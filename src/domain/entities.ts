export type EntityId = string
export type IsoDateTime = string

export type SyncStatus =
  | 'local'
  | 'pending'
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

export interface Exercise extends BaseEntity {
  name: string
  type: ExerciseType
  defaultUnit: ExerciseUnit
  notes?: string
}

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

export interface TrainingSchedule {
  weekdays: Weekday[]
  time?: string
  reminderEnabled: boolean
}

export interface TrainingPlan extends BaseEntity {
  name: string
  description?: string
  schedule?: TrainingSchedule
  archivedAt?: IsoDateTime
}

export interface RepetitionTarget {
  type: 'repetitions'
  targetRepetitions: number
  targetSets: number
}

export interface DurationTarget {
  type: 'duration'
  targetSeconds: number
  targetSets: number
}

export type ExerciseTarget = RepetitionTarget | DurationTarget

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
  unit: ExerciseUnit
}

export interface RepetitionResult {
  type: 'repetitions'
  repetitions: number
}

export interface DurationResult {
  type: 'duration'
  durationSeconds: number
}

export type ExerciseResultValue = RepetitionResult | DurationResult

export interface WorkoutSetResult {
  id: EntityId
  setNumber: number
  completedAt?: IsoDateTime
  value?: ExerciseResultValue
  skipped: boolean
}

export interface WorkoutExerciseResult {
  id: EntityId
  planExerciseId?: EntityId
  exercise: ExerciseSnapshot
  target: ExerciseTarget
  sets: WorkoutSetResult[]
}

export type WorkoutSessionStatus =
  | 'draft'
  | 'active'
  | 'paused'
  | 'completed'
  | 'cancelled'

export interface WorkoutTimerState {
  exerciseResultId: EntityId
  setId: EntityId
  targetSeconds: number
  startedAt: IsoDateTime
  accumulatedSeconds: number
  status: 'running' | 'paused'
}

export interface WorkoutSession extends BaseEntity {
  planId?: EntityId
  planName?: string
  status: WorkoutSessionStatus
  startedAt?: IsoDateTime
  endedAt?: IsoDateTime
  activeExerciseId?: EntityId
  timer?: WorkoutTimerState
  exercises: WorkoutExerciseResult[]
  idempotencyKey: string
}

export type StatisticsScope = 'cached' | 'remote'

export interface StatisticsSummary {
  workoutCount: number
  completedExerciseCount: number
  totalDurationSeconds: number
}

export interface StatisticsCache {
  key: string
  scope: StatisticsScope
  rangeStart: IsoDateTime
  rangeEnd: IsoDateTime
  generatedAt: IsoDateTime
  summary: StatisticsSummary
}

export interface AppSettings {
  key: 'app'
  notificationsEnabled: boolean
  reminderLeadMinutes: number
  dataSchemaVersion: number
}
