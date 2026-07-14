import type { BaseEntity } from '../../domain/entities'
import type {
  SyncConflict,
  SyncPushResult,
  SyncQueueItem,
} from '../../domain/sync'
import { forgeDatabase } from '../database'

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

function conflictedEntity<TEntity extends BaseEntity>(
  entity: TEntity,
  conflict: SyncConflict,
): TEntity {
  return {
    ...entity,
    sync: {
      ...entity.sync,
      status: 'conflict',
      error: conflict.reason,
    },
  }
}

export class SyncStateRepository {
  async markSynced(
    item: SyncQueueItem,
    result: SyncPushResult,
  ): Promise<void> {
    if (item.entityType === 'exercise') {
      const entity = await forgeDatabase.exercises.get(item.entityId)
      if (entity) await forgeDatabase.exercises.put(syncedEntity(entity, result))
      return
    }

    if (item.entityType === 'workout-session') {
      const entity = await forgeDatabase.workoutSessions.get(item.entityId)
      if (entity) {
        await forgeDatabase.workoutSessions.put(syncedEntity(entity, result))
      }
      return
    }

    const plan = await forgeDatabase.trainingPlans.get(item.entityId)
    const exercises = await forgeDatabase.planExercises
      .where('planId')
      .equals(item.entityId)
      .toArray()

    await forgeDatabase.transaction(
      'rw',
      [forgeDatabase.trainingPlans, forgeDatabase.planExercises],
      async () => {
        if (plan) {
          await forgeDatabase.trainingPlans.put(syncedEntity(plan, result))
        }
        await forgeDatabase.planExercises.bulkPut(
          exercises.map((exercise) => syncedEntity(exercise, result)),
        )
      },
    )
  }

  async markConflict(
    item: SyncQueueItem,
    conflict: SyncConflict,
  ): Promise<void> {
    if (item.entityType === 'exercise') {
      const entity = await forgeDatabase.exercises.get(item.entityId)
      if (entity) {
        await forgeDatabase.exercises.put(conflictedEntity(entity, conflict))
      }
      return
    }

    if (item.entityType === 'workout-session') {
      const entity = await forgeDatabase.workoutSessions.get(item.entityId)
      if (entity) {
        await forgeDatabase.workoutSessions.put(
          conflictedEntity(entity, conflict),
        )
      }
      return
    }

    const entity = await forgeDatabase.trainingPlans.get(item.entityId)
    if (entity) {
      await forgeDatabase.trainingPlans.put(conflictedEntity(entity, conflict))
    }
  }
}

export const syncStateRepository = new SyncStateRepository()
