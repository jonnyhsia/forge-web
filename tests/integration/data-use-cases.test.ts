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
          {
            exercise: exercise(),
            planExercise: planExercise('plan-exercise-a', 0),
          },
          {
            exercise: exercise(),
            planExercise: planExercise('plan-exercise-b', 1),
          },
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

  it('starts one persisted workout snapshot per schedule occurrence', async () => {
    const database = new ForgeDatabase('forge-t06-start-workout')
    let sequence = 0
    const useCases = createForgeDataUseCases(database, {
      createId: () => `workout-id-${++sequence}`,
      now: () => timestamp,
    })

    try {
      await database.trainingPlans.put(trainingPlan())
      await database.exercises.put(exercise())
      await database.planExercises.put(planExercise('plan-exercise-a', 0))

      const [first, replay] = await Promise.all([
        useCases.workouts.start({
          planId: 'plan-a',
          localDate: '2026-07-14',
          idempotencyKey: 'start-plan-a-2026-07-14',
        }),
        useCases.workouts.start({
          planId: 'plan-a',
          localDate: '2026-07-14',
          idempotencyKey: 'another-request-key',
        }),
      ])

      expect(replay).toEqual(first)
      expect(first).toMatchObject({
        planId: 'plan-a',
        scheduleOccurrenceKey: 'plan-a:2026-07-14',
        planName: 'Push Day',
        status: 'active',
        startedAt: timestamp,
        activeSetNumber: 1,
        idempotencyKey: 'start-plan-a-2026-07-14',
        exercises: [
          {
            sourcePlanExerciseId: 'plan-exercise-a',
            exercise: {
              exerciseId: 'exercise-a',
              name: '卧推',
              type: 'repetitions',
            },
            position: 0,
            sets: [],
          },
        ],
      })
      await expect(useCases.workouts.get(first.id)).resolves.toEqual(first)
    } finally {
      database.close()
    }
  })

  it('pauses and resumes an active workout without losing its progress', async () => {
    const database = new ForgeDatabase('forge-t06-pause-resume-workout')
    let currentTime = timestamp
    const useCases = createForgeDataUseCases(database, {
      createId: () => 'unused-id',
      now: () => currentTime,
    })
    const active = {
      ...workoutSession('session-a', 'active', timestamp),
      activeExerciseResultId: 'exercise-result-a',
      activeSetNumber: 3,
    }

    try {
      await database.workoutSessions.put(active)
      currentTime = '2026-07-14T08:05:00.000Z'
      const paused = await useCases.workouts.transition('session-a', {
        type: 'pause',
      })
      currentTime = '2026-07-14T08:10:00.000Z'
      const resumed = await useCases.workouts.transition('session-a', {
        type: 'resume',
      })

      expect(paused).toMatchObject({
        status: 'paused',
        activeExerciseResultId: 'exercise-result-a',
        activeSetNumber: 3,
        updatedAt: '2026-07-14T08:05:00.000Z',
      })
      expect(resumed).toMatchObject({
        status: 'active',
        activeExerciseResultId: 'exercise-result-a',
        activeSetNumber: 3,
        updatedAt: '2026-07-14T08:10:00.000Z',
      })
      await expect(useCases.workouts.getActive()).resolves.toEqual(resumed)
    } finally {
      database.close()
    }
  })

  it('rejects an illegal workout transition without changing the session', async () => {
    const database = new ForgeDatabase('forge-t06-invalid-workout-transition')
    const useCases = createForgeDataUseCases(database, {
      createId: () => 'unused-id',
      now: () => '2026-07-14T08:05:00.000Z',
    })
    const completed = {
      ...workoutSession('session-a', 'completed', timestamp),
      endedAt: timestamp,
    }

    try {
      await database.workoutSessions.put(completed)

      await expect(
        useCases.workouts.transition('session-a', { type: 'resume' }),
      ).rejects.toMatchObject({ code: 'invalid_transition' })
      await expect(useCases.workouts.get('session-a')).resolves.toEqual(completed)
    } finally {
      database.close()
    }
  })

  it('allows an explicitly cancelled schedule occurrence to start again', async () => {
    const database = new ForgeDatabase('forge-t06-cancel-reopen-workout')
    let sequence = 0
    let currentTime = '2026-07-14T08:05:00.000Z'
    const useCases = createForgeDataUseCases(database, {
      createId: () => `reopen-id-${++sequence}`,
      now: () => currentTime,
    })
    const active = {
      ...workoutSession('session-a', 'active', timestamp),
      scheduleOccurrenceKey: 'plan-a:2026-07-14',
      activeExerciseResultId: 'exercise-result-a',
      activeSetNumber: 1,
      timer: {
        exerciseResultId: 'exercise-result-a',
        setNumber: 1,
        targetSeconds: 60,
        segmentStartedAt: timestamp,
        accumulatedSeconds: 12,
        status: 'running' as const,
      },
    }

    try {
      await database.trainingPlans.put(trainingPlan())
      await database.exercises.put(exercise())
      await database.planExercises.put(planExercise('plan-exercise-a', 0))
      await database.workoutSessions.put(active)

      const cancelled = await useCases.workouts.transition('session-a', {
        type: 'cancel',
      })
      currentTime = '2026-07-14T08:10:00.000Z'
      const reopened = await useCases.workouts.start({
        planId: 'plan-a',
        localDate: '2026-07-14',
        idempotencyKey: 'reopen-plan-a-2026-07-14',
      })

      expect(cancelled).toMatchObject({
        id: 'session-a',
        status: 'cancelled',
        endedAt: '2026-07-14T08:05:00.000Z',
      })
      expect(cancelled.activeExerciseResultId).toBeUndefined()
      expect(cancelled.activeSetNumber).toBeUndefined()
      expect(cancelled.timer).toBeUndefined()
      expect(reopened).toMatchObject({
        status: 'active',
        scheduleOccurrenceKey: 'plan-a:2026-07-14',
        idempotencyKey: 'reopen-plan-a-2026-07-14',
      })
      expect(reopened.id).not.toBe('session-a')
    } finally {
      database.close()
    }
  })

  it('completes a workout once and returns the same completion on replay', async () => {
    const database = new ForgeDatabase('forge-t06-complete-workout-once')
    let currentTime = '2026-07-14T08:30:00.000Z'
    const useCases = createForgeDataUseCases(database, {
      createId: () => 'unused-id',
      now: () => currentTime,
    })
    const active = {
      ...workoutSession('session-a', 'active', timestamp),
      activeExerciseResultId: 'exercise-result-a',
      activeSetNumber: 2,
    }

    try {
      await database.workoutSessions.put(active)

      const first = await useCases.workouts.transition('session-a', {
        type: 'complete',
      })
      currentTime = '2026-07-14T08:35:00.000Z'
      const replay = await useCases.workouts.transition('session-a', {
        type: 'complete',
      })

      expect(first).toMatchObject({
        status: 'completed',
        endedAt: '2026-07-14T08:30:00.000Z',
        updatedAt: '2026-07-14T08:30:00.000Z',
      })
      expect(first.activeExerciseResultId).toBeUndefined()
      expect(first.activeSetNumber).toBeUndefined()
      expect(replay).toEqual(first)
    } finally {
      database.close()
    }
  })

  it('starts a draft workout at its first incomplete set', async () => {
    const database = new ForgeDatabase('forge-t06-start-draft-workout')
    const useCases = createForgeDataUseCases(database, {
      createId: () => 'unused-id',
      now: () => '2026-07-14T08:05:00.000Z',
    })
    const draft = {
      ...workoutSession('session-a', 'draft', timestamp),
      exercises: [
        {
          id: 'exercise-result-a',
          sourcePlanExerciseId: 'plan-exercise-a',
          exercise: {
            exerciseId: 'exercise-a',
            name: '卧推',
            type: 'repetitions' as const,
          },
          position: 0,
          target: planExercise('plan-exercise-a', 0).target,
          sets: [],
        },
      ],
    }

    try {
      await database.workoutSessions.put(draft)

      await expect(
        useCases.workouts.transition('session-a', { type: 'start' }),
      ).resolves.toMatchObject({
        status: 'active',
        startedAt: '2026-07-14T08:05:00.000Z',
        activeExerciseResultId: 'exercise-result-a',
        activeSetNumber: 1,
      })
    } finally {
      database.close()
    }
  })

  it('completes the active repetition set once and advances to the next set', async () => {
    const database = new ForgeDatabase('forge-t06-complete-repetition-set')
    let sequence = 0
    const useCases = createForgeDataUseCases(database, {
      createId: () => `set-result-${++sequence}`,
      now: () => '2026-07-14T08:05:00.000Z',
    })
    const active = {
      ...workoutSession('session-a', 'active', timestamp),
      activeExerciseResultId: 'exercise-result-a',
      activeSetNumber: 1,
      exercises: [
        {
          id: 'exercise-result-a',
          sourcePlanExerciseId: 'plan-exercise-a',
          exercise: {
            exerciseId: 'exercise-a',
            name: '卧推',
            type: 'repetitions' as const,
          },
          position: 0,
          target: {
            type: 'repetitions' as const,
            targetSets: 2,
            targetRepetitions: 5,
            weight: { mode: 'external' as const, value: 80, unit: 'kg' as const },
          },
          sets: [],
        },
      ],
    }

    try {
      await database.workoutSessions.put(active)

      const [first, replay] = await Promise.all([
        useCases.workouts.completeSet(
          {
            sessionId: 'session-a',
            exerciseResultId: 'exercise-result-a',
            setNumber: 1,
            result: {
              skipped: false,
              repetitions: 5,
              weight: { mode: 'external', value: 82.5, unit: 'kg' },
            },
          },
          'complete-session-a-exercise-a-set-1',
        ),
        useCases.workouts.completeSet(
          {
            sessionId: 'session-a',
            exerciseResultId: 'exercise-result-a',
            setNumber: 1,
            result: {
              skipped: false,
              repetitions: 99,
              weight: { mode: 'external', value: 999, unit: 'kg' },
            },
          },
          'second-click-key',
        ),
      ])

      expect(first.set).toMatchObject({
        id: 'set-result-1',
        setNumber: 1,
        repetitions: 5,
        weight: { mode: 'external', value: 82.5, unit: 'kg' },
        completedAt: '2026-07-14T08:05:00.000Z',
        idempotencyKey: 'complete-session-a-exercise-a-set-1',
      })
      expect(first.session).toMatchObject({
        activeExerciseResultId: 'exercise-result-a',
        activeSetNumber: 2,
      })
      expect(replay).toEqual(first)
      expect(replay.session.exercises[0]?.sets).toHaveLength(1)
    } finally {
      database.close()
    }
  })

  it('records a duration result and advances to the next exercise', async () => {
    const database = new ForgeDatabase('forge-t06-advance-workout-exercise')
    const useCases = createForgeDataUseCases(database, {
      createId: () => 'duration-set-result',
      now: () => '2026-07-14T08:05:00.000Z',
    })
    const active: WorkoutSession = {
      ...workoutSession('session-a', 'active', timestamp),
      activeExerciseResultId: 'duration-result',
      activeSetNumber: 1,
      exercises: [
        {
          id: 'duration-result',
          sourcePlanExerciseId: 'plan-exercise-duration',
          exercise: {
            exerciseId: 'exercise-duration',
            name: '跳绳',
            type: 'duration',
          },
          position: 0,
          target: { type: 'duration', targetSets: 1, targetSeconds: 60 },
          sets: [],
        },
        {
          id: 'repetition-result',
          sourcePlanExerciseId: 'plan-exercise-repetition',
          exercise: {
            exerciseId: 'exercise-a',
            name: '卧推',
            type: 'repetitions',
          },
          position: 1,
          target: {
            type: 'repetitions',
            targetSets: 2,
            targetRepetitions: 5,
            weight: { mode: 'external', value: 80, unit: 'kg' },
          },
          sets: [],
        },
      ],
    }

    try {
      await database.workoutSessions.put(active)

      const outcome = await useCases.workouts.completeSet(
        {
          sessionId: 'session-a',
          exerciseResultId: 'duration-result',
          setNumber: 1,
          result: { skipped: false, durationSeconds: 73 },
        },
        'complete-duration-set-1',
      )

      expect(outcome.set).toMatchObject({ durationSeconds: 73, skipped: false })
      expect(outcome.session).toMatchObject({
        activeExerciseResultId: 'repetition-result',
        activeSetNumber: 1,
      })
    } finally {
      database.close()
    }
  })

  it('persists the final set before explicit workout completion', async () => {
    const database = new ForgeDatabase('forge-t06-final-set-workout')
    let currentTime = '2026-07-14T08:05:00.000Z'
    const useCases = createForgeDataUseCases(database, {
      createId: () => 'final-set-result',
      now: () => currentTime,
    })
    const active: WorkoutSession = {
      ...workoutSession('session-a', 'active', timestamp),
      activeExerciseResultId: 'exercise-result-a',
      activeSetNumber: 1,
      exercises: [
        {
          id: 'exercise-result-a',
          sourcePlanExerciseId: 'plan-exercise-a',
          exercise: {
            exerciseId: 'exercise-a',
            name: '卧推',
            type: 'repetitions',
          },
          position: 0,
          target: {
            type: 'repetitions',
            targetSets: 1,
            targetRepetitions: 5,
            weight: { mode: 'bodyweight' },
          },
          sets: [],
        },
      ],
    }

    try {
      await database.workoutSessions.put(active)

      const outcome = await useCases.workouts.completeSet(
        {
          sessionId: 'session-a',
          exerciseResultId: 'exercise-result-a',
          setNumber: 1,
          result: {
            skipped: false,
            repetitions: 5,
            weight: { mode: 'bodyweight' },
          },
        },
        'complete-final-set',
      )

      expect(outcome.session.status).toBe('active')
      expect(outcome.session.activeExerciseResultId).toBeUndefined()
      expect(outcome.session.activeSetNumber).toBeUndefined()
      await expect(useCases.workouts.getActive()).resolves.toEqual(outcome.session)

      currentTime = '2026-07-14T08:10:00.000Z'
      await expect(
        useCases.workouts.transition('session-a', { type: 'complete' }),
      ).resolves.toMatchObject({
        status: 'completed',
        endedAt: '2026-07-14T08:10:00.000Z',
      })
    } finally {
      database.close()
    }
  })

  it('rejects a set result that does not match the active exercise type', async () => {
    const database = new ForgeDatabase('forge-t06-invalid-set-result')
    const useCases = createForgeDataUseCases(database, {
      createId: () => 'invalid-set-result',
      now: () => '2026-07-14T08:05:00.000Z',
    })
    const active: WorkoutSession = {
      ...workoutSession('session-a', 'active', timestamp),
      activeExerciseResultId: 'exercise-result-a',
      activeSetNumber: 1,
      exercises: [
        {
          id: 'exercise-result-a',
          sourcePlanExerciseId: 'plan-exercise-a',
          exercise: {
            exerciseId: 'exercise-a',
            name: '卧推',
            type: 'repetitions',
          },
          position: 0,
          target: planExercise('plan-exercise-a', 0).target,
          sets: [],
        },
      ],
    }

    try {
      await database.workoutSessions.put(active)

      await expect(
        useCases.workouts.completeSet(
          {
            sessionId: 'session-a',
            exerciseResultId: 'exercise-result-a',
            setNumber: 1,
            result: { skipped: false, durationSeconds: 30 },
          },
          'invalid-result-shape',
        ),
      ).rejects.toMatchObject({ code: 'validation' })
      await expect(useCases.workouts.get('session-a')).resolves.toEqual(active)
    } finally {
      database.close()
    }
  })

  it('rejects starting a workout without a usable idempotency key', async () => {
    const database = new ForgeDatabase('forge-t06-invalid-start-key')
    const useCases = createForgeDataUseCases(database, {
      createId: () => 'unused-id',
      now: () => timestamp,
    })

    try {
      await expect(
        useCases.workouts.start({
          planId: 'plan-a',
          localDate: '2026-07-14',
          idempotencyKey: '   ',
        }),
      ).rejects.toMatchObject({ code: 'validation' })
      await expect(database.workoutSessions.count()).resolves.toBe(0)
    } finally {
      database.close()
    }
  })

  it('reports missing workout command targets uniformly', async () => {
    const database = new ForgeDatabase('forge-t06-missing-workout-command')
    const useCases = createForgeDataUseCases(database, {
      createId: () => 'unused-id',
      now: () => timestamp,
    })

    try {
      await expect(
        useCases.workouts.start({
          planId: 'missing-plan',
          localDate: '2026-07-14',
          idempotencyKey: 'start-missing-plan',
        }),
      ).rejects.toMatchObject({ code: 'not_found' })
      await expect(
        useCases.workouts.transition('missing-session', { type: 'pause' }),
      ).rejects.toMatchObject({ code: 'not_found' })
      await expect(
        useCases.workouts.completeSet(
          {
            sessionId: 'missing-session',
            exerciseResultId: 'missing-exercise',
            setNumber: 1,
            result: { skipped: true },
          },
          'complete-missing-session',
        ),
      ).rejects.toMatchObject({ code: 'not_found' })
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
      exercises: [
        {
          exercise: exercise(),
          planExercise: planExercise('plan-exercise-a', 0),
        },
      ],
    }

    try {
      await expect(useCases.plans.save(input)).resolves.toMatchObject({
        plan: { id: 'plan-a', sync: { status: 'pending' } },
        exercises: [
          {
            exercise: { id: 'exercise-a', sync: { status: 'pending' } },
            planExercise: {
              id: 'plan-exercise-a',
              sync: { status: 'pending' },
            },
          },
        ],
      })
      await expect(useCases.plans.get('plan-a')).resolves.toMatchObject({
        plan: { id: 'plan-a' },
        exercises: [
          {
            exercise: { id: 'exercise-a' },
            planExercise: { id: 'plan-exercise-a' },
          },
        ],
      })
    } finally {
      database.close()
    }
  })

  it('archives a plan through the plans interface and removes it from the default list', async () => {
    const database = new ForgeDatabase('forge-t031-archive-plan')
    const useCases = createForgeDataUseCases(database)

    try {
      await database.trainingPlans.put(trainingPlan())
      await database.exercises.put(exercise())
      await database.planExercises.put(planExercise('plan-exercise-a', 0))

      await expect(useCases.plans.archive('plan-a')).resolves.toMatchObject({
        plan: { id: 'plan-a', status: 'archived', sync: { status: 'pending' } },
      })
      await expect(useCases.plans.listPage()).resolves.toMatchObject({ items: [] })
    } finally {
      database.close()
    }
  })

  it('deletes a plan as a tombstone and enqueues a delete mutation', async () => {
    const database = new ForgeDatabase('forge-t031-delete-plan')
    const useCases = createForgeDataUseCases(database)

    try {
      await database.trainingPlans.put(trainingPlan())
      await database.exercises.put(exercise())
      await database.planExercises.put(planExercise('plan-exercise-a', 0))

      await expect(useCases.plans.delete('plan-a')).resolves.toBeUndefined()
      await expect(database.trainingPlans.get('plan-a')).resolves.toMatchObject({
        deletedAt: expect.any(String),
        sync: { status: 'pending' },
      })
      await expect(database.syncQueue.toArray()).resolves.toEqual([
        expect.objectContaining({
          entityId: 'plan-a',
          operation: 'delete',
          status: 'pending',
        }),
      ])
      await expect(useCases.plans.listPage()).resolves.toMatchObject({ items: [] })
    } finally {
      database.close()
    }
  })

  it('blocks archive and delete while the plan has an active workout', async () => {
    const database = new ForgeDatabase('forge-t031-active-session-guard')
    const useCases = createForgeDataUseCases(database)

    try {
      await database.trainingPlans.put(trainingPlan())
      await database.exercises.put(exercise())
      await database.planExercises.put(planExercise('plan-exercise-a', 0))
      await database.workoutSessions.put(
        workoutSession('active-session', 'active', timestamp),
      )

      await expect(useCases.plans.archive('plan-a')).rejects.toMatchObject({
        code: 'active_session_exists',
      })
      await expect(useCases.plans.delete('plan-a')).rejects.toMatchObject({
        code: 'active_session_exists',
      })
      const storedPlan = await database.trainingPlans.get('plan-a')
      expect(storedPlan?.status).toBe('active')
      expect(storedPlan?.deletedAt).toBeUndefined()
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
