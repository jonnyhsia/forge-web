import { ManualClock, SequenceIdGenerator } from '../support'
import type {
  ExerciseFixture,
  HistoryEntryFixture,
  PlanExerciseFixture,
  StatisticsCacheFixture,
  SyncQueueItemFixture,
  TrainingPlanFixture,
  WorkoutExerciseFixture,
  WorkoutSessionFixture,
  WorkoutSetFixture,
} from './types'

export interface FixtureFactoryOptions {
  clock?: ManualClock
  ids?: SequenceIdGenerator
}

export class FixtureFactory {
  readonly clock: ManualClock
  readonly ids: SequenceIdGenerator

  constructor(options: FixtureFactoryOptions = {}) {
    this.clock = options.clock ?? new ManualClock()
    this.ids = options.ids ?? new SequenceIdGenerator('fixture')
  }

  exercise(overrides: Partial<ExerciseFixture> = {}): ExerciseFixture {
    return {
      id: this.ids.next('exercise'),
      name: '卧推',
      type: 'repetitions',
      ...overrides,
    }
  }

  planExercise(
    overrides: Partial<PlanExerciseFixture> = {},
  ): PlanExerciseFixture {
    const planId = overrides.planId ?? this.ids.next('plan')
    return {
      id: this.ids.next('plan-exercise'),
      planId,
      exercise: this.exercise(),
      position: 0,
      target: {
        type: 'repetitions',
        targetSets: 5,
        targetRepetitions: 5,
        weight: { mode: 'external', value: 80, unit: 'kg' },
      },
      restSeconds: 90,
      ...overrides,
    }
  }

  plan(overrides: Partial<TrainingPlanFixture> = {}): TrainingPlanFixture {
    const id = overrides.id ?? this.ids.next('plan')
    return {
      id,
      name: 'Push Day',
      description: 'Figma 示例力量训练计划',
      status: 'active',
      category: 'strength',
      weekdays: [1, 4],
      localTime: '07:30',
      effectiveLocalDate: '2026-07-14',
      exercises: [this.planExercise({ planId: id })],
      createdAt: this.clock.nowIso(),
      updatedAt: this.clock.nowIso(),
      sync: { status: 'local' },
      ...overrides,
    }
  }

  workoutSet(overrides: Partial<WorkoutSetFixture> = {}): WorkoutSetFixture {
    return {
      id: this.ids.next('set'),
      setNumber: 1,
      repetitions: 5,
      weight: { mode: 'external', value: 80, unit: 'kg' },
      completedAt: this.clock.nowIso(),
      skipped: false,
      idempotencyKey: this.ids.next('set-idempotency'),
      ...overrides,
    }
  }

  workoutExercise(
    overrides: Partial<WorkoutExerciseFixture> = {},
  ): WorkoutExerciseFixture {
    return {
      id: this.ids.next('exercise-result'),
      sourcePlanExerciseId: this.ids.next('plan-exercise'),
      exercise: this.exercise(),
      position: 0,
      target: {
        type: 'repetitions',
        targetSets: 5,
        targetRepetitions: 5,
        weight: { mode: 'external', value: 80, unit: 'kg' },
      },
      sets: [this.workoutSet()],
      ...overrides,
    }
  }

  session(
    overrides: Partial<WorkoutSessionFixture> = {},
  ): WorkoutSessionFixture {
    const planId = overrides.planId ?? this.ids.next('plan')
    const localDate = '2026-07-14'
    const exercises = overrides.exercises ?? [this.workoutExercise()]
    return {
      id: this.ids.next('session'),
      planId,
      scheduleOccurrenceKey: `${planId}:${localDate}`,
      planName: 'Push Day',
      status: 'active',
      startedAt: this.clock.nowIso(),
      activeExerciseResultId: exercises[0]?.id,
      activeSetNumber: 1,
      exercises,
      idempotencyKey: this.ids.next('session-idempotency'),
      createdAt: this.clock.nowIso(),
      updatedAt: this.clock.nowIso(),
      sync: { status: 'local' },
      ...overrides,
    }
  }

  history(overrides: Partial<HistoryEntryFixture> = {}): HistoryEntryFixture {
    return {
      sessionId: this.ids.next('session'),
      planName: 'Push Day',
      completedAt: this.clock.nowIso(),
      localDate: '2026-07-14',
      durationSeconds: 3_000,
      exercises: [this.workoutExercise()],
      sync: { status: 'synced' },
      ...overrides,
    }
  }

  statistics(
    overrides: Partial<StatisticsCacheFixture> = {},
  ): StatisticsCacheFixture {
    return {
      key: 'cached:2026-07-01:2026-07-31',
      scope: 'cached',
      rangeStart: '2026-07-01T00:00:00.000Z',
      rangeEnd: '2026-07-31T23:59:59.999Z',
      generatedAt: this.clock.nowIso(),
      source: 'history',
      summary: {
        workoutCount: 12,
        streakDays: 3,
        trainingVolumeKg: 12_450,
        personalRecords: [
          {
            exerciseId: this.ids.next('exercise'),
            exerciseName: '卧推',
            weightKg: 100,
            achievedAt: this.clock.nowIso(),
          },
        ],
      },
      ...overrides,
    }
  }

  syncQueue(
    overrides: Partial<SyncQueueItemFixture> = {},
  ): SyncQueueItemFixture {
    const entityType = overrides.entityType ?? 'workout-session'
    const entityId = overrides.entityId ?? this.ids.next('session')
    return {
      id: this.ids.next('sync-item'),
      entityType,
      entityId,
      operation: 'upsert',
      payload: {},
      idempotencyKey: this.ids.next('sync-idempotency'),
      dedupeKey: `${entityType}:${entityId}`,
      priority: 300,
      status: 'pending',
      attempts: 0,
      createdAt: this.clock.nowIso(),
      updatedAt: this.clock.nowIso(),
      nextAttemptAt: this.clock.nowIso(),
      ...overrides,
    }
  }
}

export function createFixtureFactory(
  options: FixtureFactoryOptions = {},
): FixtureFactory {
  return new FixtureFactory(options)
}
