import type { EntityTable } from 'dexie'
import type {
  AppSettings,
  BaseEntity,
  Exercise,
  PlanExercise,
  StatisticsCache,
  TrainingPlan,
  WorkoutSession,
} from '../domain/entities'
import { nowIso } from '../domain/factories'
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
    exercises: PlanExercise[],
  ): Promise<TrainingPlan> {
    const pendingPlan = pendingEntity(plan)
    const pendingExercises = exercises.map((exercise) =>
      pendingEntity(exercise),
    )
    const queueItem = createSyncQueueItem({
      entityType: 'training-plan',
      entityId: plan.id,
      operation: plan.deletedAt ? 'delete' : 'upsert',
      payload: { plan: pendingPlan, exercises: pendingExercises },
      priority: SYNC_PRIORITY.trainingPlan,
    })

    await this.database.transaction(
      'rw',
      [
        this.database.trainingPlans,
        this.database.planExercises,
        this.database.syncQueue,
      ],
      async () => {
        await this.database.trainingPlans.put(pendingPlan)
        await this.database.planExercises
          .where('planId')
          .equals(plan.id)
          .delete()
        await this.database.planExercises.bulkPut(pendingExercises)
        await this.queueRepository.putLatest(queueItem)
      },
    )

    return pendingPlan
  }

  saveWorkoutSession(session: WorkoutSession): Promise<WorkoutSession> {
    return this.saveEntity(
      this.database.workoutSessions,
      pendingEntity(session),
      'workout-session',
      SYNC_PRIORITY.workoutSession,
      session.idempotencyKey,
    )
  }

  async saveStatisticsCache(cache: StatisticsCache): Promise<void> {
    await this.database.statisticsCaches.put(cache)
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
