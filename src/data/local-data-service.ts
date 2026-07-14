import type { EntityTable } from 'dexie'
import type {
  AppSettings,
  BaseEntity,
  Exercise,
  PlanExercise,
  StatisticsCache,
  TrainingPlan,
  WorkoutSession,
  WorkoutTimerState,
} from '../domain/entities'
import { createEntityId, nowIso } from '../domain/factories'
import { DataError, type DataErrorCode } from './errors'
import {
  InvalidWorkoutTransitionError,
  InvalidWorkoutSetError,
  completeWorkoutSet,
  transitionWorkout,
  type CompleteWorkoutSetCommand,
  type CompleteWorkoutSetOutcome,
  type WorkoutTransitionCommand,
} from '../domain/workout-state-machine'
import {
  SYNC_PRIORITY,
  type SyncEntityType,
} from '../domain/sync'
import { forgeDatabase, type ForgeDatabase } from './database'
import {
  createSyncQueueItem,
  SyncQueueRepository,
  syncQueueRepository,
} from './sync/sync-queue'

class ActiveSessionExistsError extends Error {}

class WorkoutMutationError extends Error {
  readonly code: DataErrorCode

  constructor(code: DataErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

export interface WorkoutRuntimeDependencies {
  createId(): string
  now(): string
}

export interface StartWorkoutInput {
  planId: string
  localDate: string
  idempotencyKey: string
}

function isLocalDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const timestamp = Date.parse(`${value}T00:00:00.000Z`)
  return (
    Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 10) === value
  )
}

function pendingEntity<TEntity extends BaseEntity>(entity: TEntity): TEntity {
  return {
    ...entity,
    updatedAt: nowIso(),
    sync: {
      ...entity.sync,
      status: 'pending',
      error: undefined,
    },
  }
}

export class LocalDataService {
  private readonly database: ForgeDatabase
  private readonly queueRepository: SyncQueueRepository

  constructor(
    database: ForgeDatabase = forgeDatabase,
    queueRepository: SyncQueueRepository = syncQueueRepository,
  ) {
    this.database = database
    this.queueRepository = queueRepository
  }

  initialize(): Promise<void> {
    return this.database.open().then(() => undefined)
  }

  saveExercise(exercise: Exercise): Promise<Exercise> {
    return this.saveEntity(
      this.database.exercises,
      pendingEntity(exercise),
      'exercise',
      SYNC_PRIORITY.exercise,
    )
  }

  async saveTrainingPlan(
    plan: TrainingPlan,
    items: Array<{ exercise: Exercise; planExercise: PlanExercise }>,
  ): Promise<TrainingPlan> {
    const pendingPlan = pendingEntity(plan)
    const pendingExercises = items.map(({ exercise }) => pendingEntity(exercise))
    const pendingPlanExercises = items.map(({ planExercise }) =>
      pendingEntity(planExercise),
    )
    const queueItem = createSyncQueueItem({
      entityType: 'training-plan',
      entityId: plan.id,
      operation: plan.deletedAt ? 'delete' : 'upsert',
      payload: {
        plan: pendingPlan,
        exercises: pendingExercises,
        planExercises: pendingPlanExercises,
      },
      priority: SYNC_PRIORITY.trainingPlan,
      baseRemoteVersion: plan.sync.remoteVersion,
      clientUpdatedAt: pendingPlan.updatedAt,
    })

    try {
      await this.database.transaction(
        'rw',
        [
          this.database.trainingPlans,
          this.database.exercises,
          this.database.planExercises,
          this.database.workoutSessions,
          this.database.syncQueue,
        ],
        async () => {
          if (pendingPlan.status === 'archived' || pendingPlan.deletedAt) {
            const activeSession = await this.database.workoutSessions
              .where('planId')
              .equals(plan.id)
              .filter(
                (session) =>
                  !session.deletedAt &&
                  ['draft', 'active', 'paused'].includes(session.status),
              )
              .first()

            if (activeSession) throw new ActiveSessionExistsError()
          }

          await this.database.trainingPlans.put(pendingPlan)
          await this.database.exercises.bulkPut(pendingExercises)
          await this.database.planExercises
            .where('planId')
            .equals(plan.id)
            .delete()
          await this.database.planExercises.bulkPut(pendingPlanExercises)
          await this.queueRepository.putLatest(queueItem)
        },
      )
    } catch (error) {
      if (error instanceof ActiveSessionExistsError) {
        throw new DataError(
          'active_session_exists',
          `Training plan ${plan.id} has an active workout session`,
        )
      }
      throw error
    }

    return pendingPlan
  }

  async startWorkoutSession(
    input: StartWorkoutInput,
    dependencies: WorkoutRuntimeDependencies = {
      createId: createEntityId,
      now: nowIso,
    },
  ): Promise<WorkoutSession> {
    if (
      !input.planId.trim() ||
      !isLocalDate(input.localDate) ||
      !input.idempotencyKey.trim()
    ) {
      throw new DataError('validation', 'Workout start input is invalid')
    }

    try {
      return await this.database.transaction(
        'rw',
        [
          this.database.trainingPlans,
          this.database.exercises,
          this.database.planExercises,
          this.database.workoutSessions,
          this.database.syncQueue,
        ],
        async () => {
          const occurrenceKey = `${input.planId}:${input.localDate}`
          const existing = await this.database.workoutSessions
            .where('scheduleOccurrenceKey')
            .equals(occurrenceKey)
            .filter(
              (session) =>
                !session.deletedAt && session.status !== 'cancelled',
            )
            .first()
          if (existing) return existing

          const plan = await this.database.trainingPlans.get(input.planId)
          if (!plan || plan.deletedAt) {
            throw new WorkoutMutationError(
              'not_found',
              `Training plan ${input.planId} was not found`,
            )
          }
          if (plan.status !== 'active') {
            throw new WorkoutMutationError(
              'invalid_transition',
              `Training plan ${input.planId} cannot start a workout`,
            )
          }

          const planExercises = (
            await this.database.planExercises
              .where('planId')
              .equals(input.planId)
              .sortBy('position')
          ).filter((item) => !item.deletedAt)
          const exercises = await this.database.exercises.bulkGet(
            planExercises.map((item) => item.exerciseId),
          )
          const timestamp = dependencies.now()
          const exerciseResults = planExercises.map((planExercise, index) => {
            const exercise = exercises[index]
            if (!exercise || exercise.deletedAt) {
              throw new WorkoutMutationError(
                'not_found',
                `Exercise ${planExercise.exerciseId} was not found`,
              )
            }
            return {
              id: dependencies.createId(),
              sourcePlanExerciseId: planExercise.id,
              exercise: {
                exerciseId: exercise.id,
                name: exercise.name,
                type: exercise.type,
              },
              position: planExercise.position,
              target: planExercise.target,
              restSeconds: planExercise.restSeconds,
              sets: [],
            }
          })
          if (exerciseResults.length === 0) {
            throw new WorkoutMutationError(
              'validation',
              `Training plan ${input.planId} has no exercises`,
            )
          }

          const session: WorkoutSession = {
            id: dependencies.createId(),
            planId: plan.id,
            scheduleOccurrenceKey: occurrenceKey,
            planName: plan.name,
            status: 'active',
            startedAt: timestamp,
            activeExerciseResultId: exerciseResults[0]?.id,
            activeSetNumber: 1,
            exercises: exerciseResults,
            idempotencyKey: input.idempotencyKey,
            createdAt: timestamp,
            updatedAt: timestamp,
            sync: { status: 'pending' },
          }
          const queueItem = createSyncQueueItem({
            entityType: 'workout-session',
            entityId: session.id,
            operation: 'upsert',
            payload: session,
            priority: SYNC_PRIORITY.workoutSession,
            idempotencyKey: session.idempotencyKey,
            baseRemoteVersion: session.sync.remoteVersion,
            clientUpdatedAt: session.updatedAt,
          })

          await this.database.workoutSessions.add(session)
          await this.queueRepository.putLatest(queueItem)
          return session
        },
      )
    } catch (error) {
      if (error instanceof WorkoutMutationError) {
        throw new DataError(error.code, error.message)
      }
      throw error
    }
  }

  async transitionWorkoutSession(
    sessionId: string,
    command: WorkoutTransitionCommand,
    dependencies: WorkoutRuntimeDependencies = {
      createId: createEntityId,
      now: nowIso,
    },
  ): Promise<WorkoutSession> {
    try {
      return await this.database.transaction(
        'rw',
        [this.database.workoutSessions, this.database.syncQueue],
        async () => {
          const current = await this.database.workoutSessions.get(sessionId)
          if (!current || current.deletedAt) {
            throw new WorkoutMutationError(
              'not_found',
              `Workout session ${sessionId} was not found`,
            )
          }

          const transitioned = transitionWorkout(
            current,
            command,
            dependencies.now(),
          )
          if (transitioned === current) return current
          const session: WorkoutSession = {
            ...transitioned,
            sync: { ...transitioned.sync, status: 'pending', error: undefined },
          }
          const queueItem = createSyncQueueItem({
            entityType: 'workout-session',
            entityId: session.id,
            operation: 'upsert',
            payload: session,
            priority: SYNC_PRIORITY.workoutSession,
            baseRemoteVersion: current.sync.remoteVersion,
            clientUpdatedAt: session.updatedAt,
          })

          await this.database.workoutSessions.put(session)
          await this.queueRepository.putLatest(queueItem)
          return session
        },
      )
    } catch (error) {
      if (error instanceof WorkoutMutationError) {
        throw new DataError(error.code, error.message)
      }
      if (error instanceof InvalidWorkoutTransitionError) {
        throw new DataError('invalid_transition', error.message)
      }
      throw error
    }
  }

  async saveWorkoutTimerState(
    sessionId: string,
    timer: WorkoutTimerState | undefined,
    dependencies: WorkoutRuntimeDependencies = {
      createId: createEntityId,
      now: nowIso,
    },
  ): Promise<WorkoutSession> {
    try {
      return await this.database.transaction(
        'rw',
        [this.database.workoutSessions, this.database.syncQueue],
        async () => {
          const current = await this.database.workoutSessions.get(sessionId)
          if (!current || current.deletedAt) {
            throw new WorkoutMutationError(
              'not_found',
              `Workout session ${sessionId} was not found`,
            )
          }
          if (!['active', 'paused'].includes(current.status)) {
            throw new WorkoutMutationError(
              'invalid_transition',
              `Workout session ${sessionId} cannot save a timer`,
            )
          }
          const session = {
            ...current,
            timer,
            updatedAt: dependencies.now(),
            sync: { ...current.sync, status: 'pending' as const, error: undefined },
          }
          await this.database.workoutSessions.put(session)
          await this.queueRepository.putLatest(
            createSyncQueueItem({
              entityType: 'workout-session',
              entityId: session.id,
              operation: 'upsert',
              payload: session,
              priority: SYNC_PRIORITY.workoutSession,
              baseRemoteVersion: current.sync.remoteVersion,
              clientUpdatedAt: session.updatedAt,
            }),
          )
          return session
        },
      )
    } catch (error) {
      if (error instanceof WorkoutMutationError) {
        throw new DataError(error.code, error.message)
      }
      throw error
    }
  }

  async completeWorkoutSet(
    command: CompleteWorkoutSetCommand,
    idempotencyKey: string,
    dependencies: WorkoutRuntimeDependencies = {
      createId: createEntityId,
      now: nowIso,
    },
  ): Promise<CompleteWorkoutSetOutcome> {
    if (!idempotencyKey.trim()) {
      throw new DataError(
        'validation',
        'Set completion idempotency key is required',
      )
    }

    try {
      return await this.database.transaction(
        'rw',
        [this.database.workoutSessions, this.database.syncQueue],
        async () => {
          const current = await this.database.workoutSessions.get(
            command.sessionId,
          )
          if (!current || current.deletedAt) {
            throw new WorkoutMutationError(
              'not_found',
              `Workout session ${command.sessionId} was not found`,
            )
          }

          const outcome = completeWorkoutSet(current, command, {
            id: dependencies.createId(),
            completedAt: dependencies.now(),
            idempotencyKey,
          })
          if (outcome.session === current) return outcome

          const session: WorkoutSession = {
            ...outcome.session,
            sync: {
              ...outcome.session.sync,
              status: 'pending',
              error: undefined,
            },
          }
          const queueItem = createSyncQueueItem({
            entityType: 'workout-session',
            entityId: session.id,
            operation: 'upsert',
            payload: {
              sessionId: session.id,
              exerciseResultId: command.exerciseResultId,
              set: outcome.set,
            },
            priority: SYNC_PRIORITY.workoutSession,
            idempotencyKey,
            dedupeKey: `workout-session:${session.id}:set:${command.exerciseResultId}:${command.setNumber}`,
            baseRemoteVersion: current.sync.remoteVersion,
            clientUpdatedAt: session.updatedAt,
          })

          await this.database.workoutSessions.put(session)
          await this.queueRepository.putLatest(queueItem)
          return { session, set: outcome.set }
        },
      )
    } catch (error) {
      if (error instanceof WorkoutMutationError) {
        throw new DataError(error.code, error.message)
      }
      if (error instanceof InvalidWorkoutSetError) {
        throw new DataError('validation', error.message)
      }
      if (error instanceof InvalidWorkoutTransitionError) {
        throw new DataError('invalid_transition', error.message)
      }
      throw error
    }
  }

  async saveStatisticsCache(cache: StatisticsCache): Promise<void> {
    const queueItem = createSyncQueueItem({
      entityType: 'statistics',
      entityId: cache.key,
      operation: 'upsert',
      payload: cache,
      priority: SYNC_PRIORITY.statistics,
      clientUpdatedAt: cache.generatedAt,
    })
    await this.database.transaction(
      'rw',
      [this.database.statisticsCaches, this.database.syncQueue],
      async () => {
        await this.database.statisticsCaches.put(cache)
        await this.queueRepository.putLatest(queueItem)
      },
    )
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    await this.database.settings.put(settings)
  }

  private async saveEntity<TEntity extends BaseEntity>(
    table: EntityTable<TEntity, 'id'>,
    entity: TEntity,
    entityType: SyncEntityType,
    priority: number,
    idempotencyKey?: string,
  ): Promise<TEntity> {
    const queueItem = createSyncQueueItem({
      entityType,
      entityId: entity.id,
      operation: entity.deletedAt ? 'delete' : 'upsert',
      payload: entity,
      priority,
      idempotencyKey,
      baseRemoteVersion: entity.sync.remoteVersion,
      clientUpdatedAt: entity.updatedAt,
    })

    await this.database.transaction(
      'rw',
      [table, this.database.syncQueue],
      async () => {
        await table.put(entity)
        await this.queueRepository.putLatest(queueItem)
      },
    )

    return entity
  }
}

export const localDataService = new LocalDataService()
