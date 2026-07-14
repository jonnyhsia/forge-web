import type {
  BaseEntity,
  Exercise,
  PlanExercise,
  StatisticsCache,
  TrainingPlan,
  WorkoutSession,
} from '../../domain/entities'
import { createEntityId, nowIso } from '../../domain/factories'
import type {
  SyncConflict,
  SyncPushResult,
  SyncQueueItem,
  SyncStatus,
} from '../../domain'
import { forgeDatabase, type ForgeDatabase } from '../database'
import { SyncQueueRepository } from './sync-queue'

interface TrainingPlanPayload {
  plan: TrainingPlan
  exercises: Exercise[]
  planExercises: PlanExercise[]
}

function syncedEntity<TEntity extends BaseEntity>(
  entity: TEntity,
  result: SyncPushResult,
): TEntity {
  return {
    ...entity,
    sync: {
      status: 'synced',
      remoteVersion: result.remoteVersion,
      lastSyncedAt: result.syncedAt,
    },
  }
}

function entityWithStatus<TEntity extends BaseEntity>(
  entity: TEntity,
  status: SyncStatus,
  error?: string,
): TEntity {
  return {
    ...entity,
    sync: { ...entity.sync, status, error },
  }
}

function planPayload(value: unknown): TrainingPlanPayload | null {
  if (!value || typeof value !== 'object') return null
  const payload = value as Partial<TrainingPlanPayload>
  if (!payload.plan || !Array.isArray(payload.exercises) || !Array.isArray(payload.planExercises)) {
    return null
  }
  return payload as TrainingPlanPayload
}

export class SyncStateRepository {
  private readonly database: ForgeDatabase

  constructor(database: ForgeDatabase = forgeDatabase) {
    this.database = database
  }

  markProcessing(item: SyncQueueItem): Promise<void> {
    return this.markEntityStatus(item, 'processing')
  }

  markFailed(item: SyncQueueItem, error: string): Promise<void> {
    return this.markEntityStatus(item, 'failed', error)
  }

  async markSynced(
    item: SyncQueueItem,
    result: SyncPushResult,
  ): Promise<void> {
    if (item.entityType === 'statistics') return
    if (item.entityType === 'exercise') {
      const entity = await this.database.exercises.get(item.entityId)
      if (entity) await this.database.exercises.put(syncedEntity(entity, result))
      return
    }
    if (item.entityType === 'workout-session') {
      const entity = await this.database.workoutSessions.get(item.entityId)
      if (entity) {
        await this.database.workoutSessions.put(syncedEntity(entity, result))
      }
      return
    }

    const plan = await this.database.trainingPlans.get(item.entityId)
    const exercises = await this.database.planExercises
      .where('planId')
      .equals(item.entityId)
      .toArray()
    await this.database.transaction(
      'rw',
      [this.database.trainingPlans, this.database.planExercises],
      async () => {
        if (plan) await this.database.trainingPlans.put(syncedEntity(plan, result))
        await this.database.planExercises.bulkPut(
          exercises.map((exercise) => syncedEntity(exercise, result)),
        )
      },
    )
  }

  async markConflict(
    item: SyncQueueItem,
    conflict: SyncConflict,
  ): Promise<void> {
    await this.markEntityStatus(item, 'conflict', conflict.reason)
  }

  async acceptRemote(item: SyncQueueItem): Promise<void> {
    if (!item.conflict) return
    const { remotePayload, remoteVersion } = item.conflict
    const result = { remoteVersion, syncedAt: nowIso() }

    await this.database.transaction(
      'rw',
      [
        this.database.exercises,
        this.database.trainingPlans,
        this.database.planExercises,
        this.database.workoutSessions,
        this.database.statisticsCaches,
        this.database.syncQueue,
      ],
      async () => {
        if (item.entityType === 'exercise') {
          await this.database.exercises.put(
            syncedEntity(remotePayload as Exercise, result),
          )
        } else if (item.entityType === 'workout-session') {
          await this.database.workoutSessions.put(
            syncedEntity(remotePayload as WorkoutSession, result),
          )
        } else if (item.entityType === 'statistics') {
          await this.database.statisticsCaches.put(
            remotePayload as StatisticsCache,
          )
        } else {
          const payload = planPayload(remotePayload)
          if (!payload) throw new Error('远端计划数据格式无效')
          await this.database.trainingPlans.put(syncedEntity(payload.plan, result))
          await this.database.exercises.bulkPut(
            payload.exercises.map((exercise) => syncedEntity(exercise, result)),
          )
          await this.database.planExercises
            .where('planId')
            .equals(item.entityId)
            .delete()
          await this.database.planExercises.bulkPut(
            payload.planExercises.map((planExercise) =>
              syncedEntity(planExercise, result),
            ),
          )
        }
        await this.database.syncQueue.delete(item.id)
      },
    )
  }

  async keepLocal(item: SyncQueueItem): Promise<void> {
    if (!item.conflict) return
    const timestamp = nowIso()
    const payload = await this.currentPayload(item)
    await this.markEntityStatus(item, 'pending')
    await this.database.syncQueue.put({
      ...item,
      payload,
      idempotencyKey: createEntityId(),
      baseRemoteVersion: item.conflict.remoteVersion,
      clientUpdatedAt: timestamp,
      status: 'pending',
      attempts: 0,
      nextAttemptAt: timestamp,
      updatedAt: timestamp,
      lastError: undefined,
      conflict: undefined,
    })
  }

  private async currentPayload(item: SyncQueueItem): Promise<unknown> {
    if (item.entityType === 'exercise') {
      return this.database.exercises.get(item.entityId)
    }
    if (item.entityType === 'workout-session') {
      return this.database.workoutSessions.get(item.entityId)
    }
    if (item.entityType === 'statistics') {
      return this.database.statisticsCaches.get(item.entityId)
    }
    const plan = await this.database.trainingPlans.get(item.entityId)
    const planExercises = await this.database.planExercises
      .where('planId')
      .equals(item.entityId)
      .sortBy('position')
    const exercises = (
      await this.database.exercises.bulkGet(
        planExercises.map((entry) => entry.exerciseId),
      )
    ).filter((entry): entry is Exercise => Boolean(entry))
    return { plan, planExercises, exercises }
  }

  private async markEntityStatus(
    item: SyncQueueItem,
    status: SyncStatus,
    error?: string,
  ): Promise<void> {
    if (item.entityType === 'statistics') return
    if (item.entityType === 'exercise') {
      const entity = await this.database.exercises.get(item.entityId)
      if (entity) {
        await this.database.exercises.put(entityWithStatus(entity, status, error))
      }
      return
    }
    if (item.entityType === 'workout-session') {
      const entity = await this.database.workoutSessions.get(item.entityId)
      if (entity) {
        await this.database.workoutSessions.put(
          entityWithStatus(entity, status, error),
        )
      }
      return
    }
    const plan = await this.database.trainingPlans.get(item.entityId)
    if (plan) {
      await this.database.trainingPlans.put(entityWithStatus(plan, status, error))
    }
  }
}

export class SyncConflictResolver {
  private readonly queue: SyncQueueRepository
  private readonly state: SyncStateRepository

  constructor(database: ForgeDatabase = forgeDatabase) {
    this.queue = new SyncQueueRepository(database)
    this.state = new SyncStateRepository(database)
  }

  async acceptRemote(itemId: string): Promise<void> {
    const item = await this.queue.get(itemId)
    if (item?.status === 'conflict') await this.state.acceptRemote(item)
  }

  async keepLocal(itemId: string): Promise<void> {
    const item = await this.queue.get(itemId)
    if (item?.status === 'conflict') await this.state.keepLocal(item)
  }
}

export const syncStateRepository = new SyncStateRepository()
export const syncConflictResolver = new SyncConflictResolver()
