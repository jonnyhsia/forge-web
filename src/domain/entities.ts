export type EntityId = string
export type IsoDateTime = string

export type SyncStatus =
  | 'local'
  | 'pending'
  | 'processing'
  | 'synced'
  | 'conflict'
  | 'failed'

export interface SyncMetadata {
  status: SyncStatus
  remoteVersion?: number
  lastSyncedAt?: IsoDateTime
  error?: string
}

export interface BaseEntity {
  id: EntityId
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
  deletedAt?: IsoDateTime
  sync: SyncMetadata
}

export type ExerciseType = 'repetitions' | 'duration'
export type ExerciseUnit = 'repetition' | 'second'
export type WeightUnit = 'kg' | 'lb'

export interface Exercise extends BaseEntity {
  name: string
  type: ExerciseType
  defaultUnit: ExerciseUnit
  notes?: string
}

export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7
export type PlanStatus = 'draft' | 'active' | 'archived'
export type PlanCategory = 'strength' | 'cardio' | 'mobility'
export const DEFAULT_PLAN_CATEGORY: PlanCategory = 'strength'

export interface TrainingPlan extends BaseEntity {
  name: string
  description?: string
  status: PlanStatus
  category: PlanCategory
  weekdays: Weekday[]
  localTime?: string
  effectiveLocalDate: string
}

export interface RepetitionTarget {
  type: 'repetitions'
  targetRepetitions: number
  targetSets: number
  weight: WeightValue
}

export interface DurationTarget {
  type: 'duration'
  targetSeconds: number
  targetSets: number
}

export type ExerciseTarget = RepetitionTarget | DurationTarget

export type WeightValue =
  | { mode: 'external'; value: number; unit: WeightUnit }
  | { mode: 'bodyweight'; value?: never; unit?: never }
  | { mode: 'bodyweight'; value: number; unit: WeightUnit }

export interface PlanExercise extends BaseEntity {
  planId: EntityId
  exerciseId: EntityId
  position: number
  target: ExerciseTarget
  restSeconds?: number
}

export interface ExerciseSnapshot {
  exerciseId: EntityId
  name: string
  type: ExerciseType
}

interface WorkoutSetResultMetadata {
  id: EntityId
  setNumber: number
  completedAt: IsoDateTime
  idempotencyKey: string
}

export type WorkoutSetResult = WorkoutSetResultMetadata &
  (
    | {
        skipped: true
        repetitions?: never
        durationSeconds?: never
        weight?: never
      }
    | {
        skipped: false
        repetitions: number
        durationSeconds?: never
        weight: WeightValue
      }
    | {
        skipped: false
        repetitions?: never
        durationSeconds: number
        weight?: never
      }
  )

export interface WorkoutExerciseResult {
  id: EntityId
  sourcePlanExerciseId: EntityId
  exercise: ExerciseSnapshot
  position: number
  target: ExerciseTarget
  restSeconds?: number
  sets: WorkoutSetResult[]
}

export type WorkoutSessionStatus =
  | 'draft'
  | 'active'
  | 'paused'
  | 'completed'
  | 'cancelled'

export interface WorkoutTimerState {
  phase: 'exercise' | 'rest'
  exerciseResultId: EntityId
  setNumber: number
  targetSeconds: number
  segmentStartedAt: IsoDateTime
  accumulatedSeconds: number
  status: 'running' | 'paused'
}

export interface WorkoutSession extends BaseEntity {
  planId: EntityId
  scheduleOccurrenceKey: string
  planName: string
  status: WorkoutSessionStatus
  startedAt?: IsoDateTime
  endedAt?: IsoDateTime
  activeExerciseResultId?: EntityId
  activeSetNumber?: number
  timer?: WorkoutTimerState
  exercises: WorkoutExerciseResult[]
  idempotencyKey: string
}

export type StatisticsScope = 'cached' | 'remote'
export type StatisticsSource = 'history' | 'server'

export interface PersonalRecord {
  exerciseId: EntityId
  exerciseName: string
  weightKg: number
  achievedAt: IsoDateTime
}

export interface StatisticsSummary {
  workoutCount: number
  streakDays: number
  trainingVolumeKg: number
  personalRecords: PersonalRecord[]
}

export interface StatisticsCache {
  key: string
  scope: StatisticsScope
  rangeStart: IsoDateTime
  rangeEnd: IsoDateTime
  generatedAt: IsoDateTime
  source: StatisticsSource
  summary: StatisticsSummary
}

export interface AppSettings {
  key: 'app'
  defaultWeightUnit: WeightUnit
  trainingReminderEnabled: boolean
  restReminderEnabled: boolean
  reminderLeadMinutes: number
  notificationPermission:
    | 'not_requested'
    | 'granted'
    | 'denied'
    | 'unsupported'
  dataSchemaVersion: number
}
