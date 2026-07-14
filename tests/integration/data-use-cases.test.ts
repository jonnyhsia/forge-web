import { describe, expect, it } from 'vitest'
import { DataError } from '../../src/data/errors'
import { ForgeDatabase } from '../../src/data/database'
import { createForgeDataUseCases } from '../../src/data/use-cases'
import type {
  Exercise,
  PlanExercise,
  StatisticsCache,
  TrainingPlan,
  WorkoutSession,
} from '../../src/domain'

const timestamp = '2026-07-14T08:00:00.000Z'

function trainingPlan(): TrainingPlan {
  return {
    id: 'plan-a',
    name: 'Push Day',
    status: 'active',
    category: 'strength',
    weekdays: [1],
    effectiveLocalDate: '2026-07-14',
    createdAt: timestamp,
    updatedAt: timestamp,
    sync: { status: 'local' },
  }
}

function exercise(): Exercise {
  return {
    id: 'exercise-a',
    name: '卧推',
    type: 'repetitions',
    defaultUnit: 'repetition',
    createdAt: timestamp,
    updatedAt: timestamp,
    sync: { status: 'local' },
  }
}

function planExercise(id: string, position: number): PlanExercise {
  return {
    id,
    planId: 'plan-a',
    exerciseId: 'exercise-a',
    position,
    target: {
      type: 'repetitions',
      targetRepetitions: 5,
      targetSets: 5,
      weight: { mode: 'external', value: 80, unit: 'kg' },
    },
    createdAt: timestamp,
    updatedAt: timestamp,
    sync: { status: 'local' },
  }
}

function workoutSession(
  id: string,
  status: WorkoutSession['status'],
  updatedAt: string,
): WorkoutSession {
  return {
    id,
    planId: 'plan-a',
    scheduleOccurrenceKey: `plan-a:${id}`,
    planName: 'Push Day',
    status,
    exercises: [],
    idempotencyKey: `start-${id}`,
    createdAt: timestamp,
    updatedAt,
    sync: { status: 'local' },
  }
}

function statisticsCache(key: string, generatedAt: string): StatisticsCache {
  return {
    key,
    scope: 'cached',
    rangeStart: '2026-07-01T00:00:00.000Z',
    rangeEnd: '2026-07-31T23:59:59.999Z',
    generatedAt,
    source: 'history',
    summary: {
      workoutCount: 1,
      streakDays: 1,
      trainingVolumeKg: 100,
      personalRecords: [],
    },
  }
}

describe('data use cases', () => {
  it('loads a plan aggregate through its interface and reports missing plans uniformly', async () => {
    const database = new ForgeDatabase('forge-t03-plan-use-cases')
    const useCases = createForgeDataUseCases(database)

    try {
      await database.trainingPlans.put(trainingPlan())
      await database.exercises.put(exercise())
      await database.planExercises.bulkPut([
        planExercise('plan-exercise-b', 1),
        planExercise('plan-exercise-a', 0),
      ])

      await expect(useCases.plans.get('plan-a')).resolves.toEqual({
        plan: trainingPlan(),
        exercises: [
          planExercise('plan-exercise-a', 0),
          planExercise('plan-exercise-b', 1),
        ],
      })
      await expect(useCases.plans.get('missing')).rejects.toMatchObject({
        name: DataError.name,
        code: 'not_found',
      })
    } finally {
      database.close()
    }
  })

  it('loads the most recently updated active workout independently', async () => {
    const database = new ForgeDatabase('forge-t03-workout-use-cases')
    const useCases = createForgeDataUseCases(database)

    try {
      await database.workoutSessions.bulkPut([
        workoutSession('older-active', 'active', '2026-07-14T08:00:00.000Z'),
        workoutSession('newer-paused', 'paused', '2026-07-14T09:00:00.000Z'),
        workoutSession('completed', 'completed', '2026-07-14T10:00:00.000Z'),
      ])

      await expect(useCases.workouts.getActive()).resolves.toMatchObject({
        id: 'newer-paused',
      })
    } finally {
      database.close()
    }
  })

  it('exposes only completed workout snapshots through history details', async () => {
    const database = new ForgeDatabase('forge-t03-history-use-cases')
    const useCases = createForgeDataUseCases(database)
    const completed = {
      ...workoutSession('completed', 'completed', timestamp),
      endedAt: timestamp,
    }

    try {
      await database.workoutSessions.bulkPut([
        completed,
        workoutSession('active', 'active', timestamp),
      ])

      await expect(useCases.history.getDetail('completed')).resolves.toEqual(
        completed,
      )
      await expect(useCases.history.getDetail('active')).rejects.toMatchObject({
        code: 'not_found',
      })
    } finally {
      database.close()
    }
  })

  it('updates settings as a patch and always returns a complete value', async () => {
    const database = new ForgeDatabase('forge-t03-settings-use-cases')
    const useCases = createForgeDataUseCases(database)

    try {
      await database.open()

      await expect(
        useCases.settings.update({ defaultWeightUnit: 'lb' }),
      ).resolves.toEqual({
        key: 'app',
        defaultWeightUnit: 'lb',
        trainingReminderEnabled: false,
        restReminderEnabled: false,
        reminderLeadMinutes: 15,
        notificationPermission: 'not_requested',
        dataSchemaVersion: 2,
      })
      await expect(useCases.settings.get()).resolves.toMatchObject({
        defaultWeightUnit: 'lb',
        reminderLeadMinutes: 15,
      })
    } finally {
      database.close()
    }
  })

  it('saves and reads statistics independently in newest-first order', async () => {
    const database = new ForgeDatabase('forge-t03-statistics-use-cases')
    const useCases = createForgeDataUseCases(database)
    const older = statisticsCache('older', '2026-07-14T08:00:00.000Z')
    const newer = statisticsCache('newer', '2026-07-14T09:00:00.000Z')

    try {
      await useCases.statistics.save(older)
      await useCases.statistics.save(newer)

      await expect(useCases.statistics.list()).resolves.toEqual([
        newer,
        older,
      ])
    } finally {
      database.close()
    }
  })

  it('saves a plan aggregate transactionally through the plans interface', async () => {
    const database = new ForgeDatabase('forge-t03-save-plan-use-cases')
    const useCases = createForgeDataUseCases(database)
    const input = {
      plan: trainingPlan(),
      exercises: [planExercise('plan-exercise-a', 0)],
    }

    try {
      await expect(useCases.plans.save(input)).resolves.toMatchObject({
        plan: { id: 'plan-a', sync: { status: 'pending' } },
        exercises: [{ id: 'plan-exercise-a', sync: { status: 'pending' } }],
      })
      await expect(useCases.plans.get('plan-a')).resolves.toMatchObject({
        plan: { id: 'plan-a' },
        exercises: [{ id: 'plan-exercise-a' }],
      })
    } finally {
      database.close()
    }
  })

  it('saves and reloads a workout through the workouts interface', async () => {
    const database = new ForgeDatabase('forge-t03-save-workout-use-cases')
    const useCases = createForgeDataUseCases(database)
    const workout = workoutSession('active', 'active', timestamp)

    try {
      await expect(useCases.workouts.save(workout)).resolves.toMatchObject({
        id: 'active',
        sync: { status: 'pending' },
      })
      await expect(useCases.workouts.get('active')).resolves.toMatchObject({
        id: 'active',
        sync: { status: 'pending' },
      })
    } finally {
      database.close()
    }
  })

  it('rejects malformed pagination cursors as validation errors', async () => {
    const database = new ForgeDatabase('forge-t03-invalid-cursor')
    const useCases = createForgeDataUseCases(database)

    try {
      await expect(
        useCases.plans.listPage({ cursor: 'not-a-cursor' }),
      ).rejects.toMatchObject({ code: 'validation' })
    } finally {
      database.close()
    }
  })
})
