export type IsoDateTime = string
export type WeightUnit = 'kg' | 'lb'
export type PlanCategory = 'strength' | 'cardio' | 'mobility'
export type PlanStatus = 'draft' | 'active' | 'archived'
export type SyncStatus =
  | 'local'
  | 'pending'
  | 'processing'
  | 'failed'
  | 'conflict'
  | 'synced'

export interface FixtureSyncMetadata {
  status: SyncStatus
  remoteVersion?: number
  lastSyncedAt?: IsoDateTime
  error?: string
}

export interface WeightValueFixture {
  mode: 'external' | 'bodyweight'
  value?: number
  unit?: WeightUnit
}

export interface ExerciseFixture {
  id: string
  name: string
  type: 'repetitions' | 'duration'
}

export interface RepetitionTargetFixture {
  type: 'repetitions'
  targetSets: number
  targetRepetitions: number
  weight: WeightValueFixture
}

export interface DurationTargetFixture {
  type: 'duration'
  targetSets: number
  targetSeconds: number
}

export type ExerciseTargetFixture =
  | RepetitionTargetFixture
  | DurationTargetFixture

export interface PlanExerciseFixture {
  id: string
  planId: string
  exercise: ExerciseFixture
  position: number
  target: ExerciseTargetFixture
  restSeconds: number
}

export interface TrainingPlanFixture {
  id: string
  name: string
  description?: string
  status: PlanStatus
  category: PlanCategory
  weekdays: Array<1 | 2 | 3 | 4 | 5 | 6 | 7>
  localTime?: string
  effectiveLocalDate: string
  exercises: PlanExerciseFixture[]
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
  deletedAt?: IsoDateTime
  sync: FixtureSyncMetadata
}

export interface WorkoutSetFixture {
  id: string
  setNumber: number
  repetitions?: number
  durationSeconds?: number
  weight?: WeightValueFixture
  completedAt?: IsoDateTime
  skipped: boolean
  idempotencyKey: string
}

export interface WorkoutExerciseFixture {
  id: string
  sourcePlanExerciseId: string
  exercise: ExerciseFixture
  position: number
  target: ExerciseTargetFixture
  sets: WorkoutSetFixture[]
}

export interface WorkoutTimerFixture {
  exerciseResultId: string
  setNumber: number
  targetSeconds: number
  segmentStartedAt: IsoDateTime
  accumulatedSeconds: number
  status: 'running' | 'paused'
}

export interface WorkoutSessionFixture {
  id: string
  planId: string
  scheduleOccurrenceKey: string
  planName: string
  status: 'draft' | 'active' | 'paused' | 'completed' | 'cancelled'
  startedAt?: IsoDateTime
  endedAt?: IsoDateTime
  activeExerciseResultId?: string
  activeSetNumber?: number
  timer?: WorkoutTimerFixture
  exercises: WorkoutExerciseFixture[]
  idempotencyKey: string
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
  sync: FixtureSyncMetadata
}

export interface HistoryEntryFixture {
  sessionId: string
  planName: string
  completedAt: IsoDateTime
  localDate: string
  durationSeconds: number
  exercises: WorkoutExerciseFixture[]
  sync: FixtureSyncMetadata
}

export interface StatisticsCacheFixture {
  key: string
  scope: 'cached' | 'remote'
  rangeStart: IsoDateTime
  rangeEnd: IsoDateTime
  generatedAt: IsoDateTime
  source: 'history' | 'server'
  summary: {
    workoutCount: number
    weeklyWorkoutCount: number
    monthlyWorkoutCount: number
    streakDays: number
    weeklyTrend: Array<{ weekStart: string; workoutCount: number }>
    trainingVolumeKg: number
    personalRecords: Array<{
      exerciseId: string
      exerciseName: string
      weightKg: number
      achievedAt: IsoDateTime
    }>
  }
}

export interface SyncQueueItemFixture {
  id: string
  entityType: 'exercise' | 'training-plan' | 'workout-session' | 'statistics'
  entityId: string
  operation: 'upsert' | 'delete'
  payload: unknown
  idempotencyKey: string
  dedupeKey: string
  priority: number
  status: 'pending' | 'processing' | 'failed' | 'conflict'
  attempts: number
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
  nextAttemptAt: IsoDateTime
  lastError?: string
}
