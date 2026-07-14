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
import { forgeDatabase } from './database'
import { createSyncQueueItem, syncQueueRepository } from './sync/sync-queue'

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
  initialize(): Promise<void> {
    return forgeDatabase.open().then(() => undefined)
  }

  saveExercise(exercise: Exercise): Promise<Exercise> {
    return this.saveEntity(
      forgeDatabase.exercises,
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

    await forgeDatabase.transaction(
      'rw',
      [
        forgeDatabase.trainingPlans,
        forgeDatabase.planExercises,
        forgeDatabase.syncQueue,
      ],
      async () => {
        await forgeDatabase.trainingPlans.put(pendingPlan)
        await forgeDatabase.planExercises
          .where('planId')
          .equals(plan.id)
          .delete()
        await forgeDatabase.planExercises.bulkPut(pendingExercises)
        await syncQueueRepository.putLatest(queueItem)
      },
    )

    return pendingPlan
  }

  saveWorkoutSession(session: WorkoutSession): Promise<WorkoutSession> {
    return this.saveEntity(
      forgeDatabase.workoutSessions,
      pendingEntity(session),
      'workout-session',
      SYNC_PRIORITY.workoutSession,
      session.idempotencyKey,
    )
  }

  async saveStatisticsCache(cache: StatisticsCache): Promise<void> {
    await forgeDatabase.statisticsCaches.put(cache)
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    await forgeDatabase.settings.put(settings)
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

    await forgeDatabase.transaction(
      'rw',
      [table, forgeDatabase.syncQueue],
      async () => {
        await table.put(entity)
        await syncQueueRepository.putLatest(queueItem)
      },
    )

    return entity
  }
}

export const localDataService = new LocalDataService()
