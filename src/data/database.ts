import Dexie, { type EntityTable } from 'dexie'
import type {
  AppSettings,
  Exercise,
  PlanExercise,
  StatisticsCache,
  TrainingPlan,
  WorkoutSession,
} from '../domain/entities'
import type { SyncQueueItem } from '../domain/sync'

export const DATABASE_NAME = 'forge-pwa'
export const DATABASE_SCHEMA_VERSION = 1

export class ForgeDatabase extends Dexie {
  exercises!: EntityTable<Exercise, 'id'>
  trainingPlans!: EntityTable<TrainingPlan, 'id'>
  planExercises!: EntityTable<PlanExercise, 'id'>
  workoutSessions!: EntityTable<WorkoutSession, 'id'>
  syncQueue!: EntityTable<SyncQueueItem, 'id'>
  statisticsCaches!: EntityTable<StatisticsCache, 'key'>
  settings!: EntityTable<AppSettings, 'key'>

  constructor() {
    super(DATABASE_NAME)

    this.version(DATABASE_SCHEMA_VERSION).stores({
      exercises: '&id, name, type, updatedAt, sync.status, deletedAt',
      trainingPlans: '&id, name, updatedAt, sync.status, deletedAt',
      planExercises:
        '&id, planId, exerciseId, [planId+position], updatedAt, sync.status, deletedAt',
      workoutSessions:
        '&id, planId, status, startedAt, endedAt, updatedAt, sync.status, deletedAt',
      syncQueue:
        '&id, &dedupeKey, status, priority, nextAttemptAt, [status+nextAttemptAt]',
      statisticsCaches: '&key, scope, generatedAt, [rangeStart+rangeEnd]',
      settings: '&key',
    })
  }
}

export const forgeDatabase = new ForgeDatabase()
