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
export const DATABASE_SCHEMA_VERSION = 2

export const DEFAULT_APP_SETTINGS: Readonly<AppSettings> = Object.freeze({
  key: 'app',
  defaultWeightUnit: 'kg',
  trainingReminderEnabled: false,
  restReminderEnabled: false,
  reminderLeadMinutes: 15,
  notificationPermission: 'not_requested',
  dataSchemaVersion: DATABASE_SCHEMA_VERSION,
})

export class ForgeDatabase extends Dexie {
  exercises!: EntityTable<Exercise, 'id'>
  trainingPlans!: EntityTable<TrainingPlan, 'id'>
  planExercises!: EntityTable<PlanExercise, 'id'>
  workoutSessions!: EntityTable<WorkoutSession, 'id'>
  syncQueue!: EntityTable<SyncQueueItem, 'id'>
  statisticsCaches!: EntityTable<StatisticsCache, 'key'>
  settings!: EntityTable<AppSettings, 'key'>

  constructor(name: string = DATABASE_NAME) {
    super(name)

    this.version(DATABASE_SCHEMA_VERSION).stores({
      exercises: '&id, name, type, updatedAt, sync.status, deletedAt',
      trainingPlans:
        '&id, name, status, category, *weekdays, [status+category], [status+effectiveLocalDate], effectiveLocalDate, updatedAt, sync.status, deletedAt',
      planExercises:
        '&id, planId, exerciseId, [planId+position], updatedAt, sync.status, deletedAt',
      workoutSessions:
        '&id, planId, scheduleOccurrenceKey, [scheduleOccurrenceKey+status], status, startedAt, endedAt, updatedAt, sync.status, deletedAt',
      syncQueue:
        '&id, &dedupeKey, status, priority, nextAttemptAt, [status+nextAttemptAt]',
      statisticsCaches:
        '&key, scope, source, [scope+source], generatedAt, [rangeStart+rangeEnd]',
      settings: '&key',
    })

    this.on('populate', () => this.settings.add({ ...DEFAULT_APP_SETTINGS }))
  }
}

export const forgeDatabase = new ForgeDatabase()
