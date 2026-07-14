import { describe, expect, it } from 'vitest'
import { createForgeDataUseCases, ForgeDatabase } from '../../src/data'
import { StatisticsPage } from '../../src/pages/ShellPages'
import { createForgeStore } from '../../src/store'
import type { StatisticsCache, WorkoutSession } from '../../src/domain'
import {
  calculateStatistics,
  rollingEightWeekRange,
  type StatisticsRange,
} from '../../src/domain'

const range: StatisticsRange = {
  start: '2026-05-25T00:00:00+08:00',
  end: '2026-07-14T23:59:59+08:00',
}

function completedSession(
  id: string,
  endedAt: string,
  exercises: WorkoutSession['exercises'] = [],
): WorkoutSession {
  return {
    id,
    planId: 'plan-a',
    scheduleOccurrenceKey: `plan-a:${id}`,
    planName: 'Push Day',
    status: 'completed',
    startedAt: endedAt,
    endedAt,
    exercises,
    idempotencyKey: `start-${id}`,
    createdAt: endedAt,
    updatedAt: endedAt,
    sync: { status: 'local' },
  }
}

function repetitionExercise(
  exerciseId: string,
  name: string,
  sets: WorkoutSession['exercises'][number]['sets'],
): WorkoutSession['exercises'][number] {
  return {
    id: `result-${exerciseId}`,
    sourcePlanExerciseId: `plan-${exerciseId}`,
    exercise: { exerciseId, name, type: 'repetitions' },
    position: 0,
    target: {
      type: 'repetitions',
      targetSets: sets.length,
      targetRepetitions: 5,
      weight: { mode: 'external', value: 1, unit: 'kg' },
    },
    sets,
  }
}

describe('statistics', () => {
  it('builds an eight-week cache range from local Monday through now', () => {
    const now = new Date(2026, 6, 14, 20, 0, 0)
    const expectedStart = new Date(2026, 4, 25, 0, 0, 0)

    expect(rollingEightWeekRange(now)).toEqual({
      start: expectedStart.toISOString(),
      end: now.toISOString(),
    })
  })

  it('returns a complete zero summary for an empty history range', () => {
    const result = calculateStatistics(range, [])

    expect(result).toMatchObject({
      workoutCount: 0,
      weeklyWorkoutCount: 0,
      monthlyWorkoutCount: 0,
      streakDays: 0,
      trainingVolumeKg: 0,
      personalRecords: [],
    })
    expect(result.weeklyTrend).toHaveLength(8)
    expect(result.weeklyTrend.every((week) => week.workoutCount === 0)).toBe(
      true,
    )
  })

  it('counts completed workouts in the current local week and month', () => {
    const result = calculateStatistics(range, [
      completedSession('today', '2026-07-14T08:00:00+08:00'),
      completedSession('this-week', '2026-07-13T08:00:00+08:00'),
      completedSession('this-month', '2026-07-05T08:00:00+08:00'),
      completedSession('last-month', '2026-06-30T08:00:00+08:00'),
    ])

    expect(result.weeklyWorkoutCount).toBe(2)
    expect(result.monthlyWorkoutCount).toBe(3)
  })

  it('counts consecutive local training days once per day', () => {
    const result = calculateStatistics(range, [
      completedSession('today-a', '2026-07-14T08:00:00+08:00'),
      completedSession('today-b', '2026-07-14T18:00:00+08:00'),
      completedSession('yesterday', '2026-07-13T08:00:00+08:00'),
      completedSession('two-days-ago', '2026-07-12T08:00:00+08:00'),
      completedSession('gap', '2026-07-10T08:00:00+08:00'),
    ])

    expect(result.streakDays).toBe(3)
  })

  it('resets the streak after a missed local day', () => {
    const result = calculateStatistics(range, [
      completedSession('stale', '2026-07-10T08:00:00+08:00'),
      completedSession('stale-previous', '2026-07-09T08:00:00+08:00'),
    ])

    expect(result.streakDays).toBe(0)
  })

  it('returns eight Monday-based weekly trend buckets including empty weeks', () => {
    const result = calculateStatistics(range, [
      completedSession('first-week', '2026-05-25T08:00:00+08:00'),
      completedSession('last-week-a', '2026-07-13T08:00:00+08:00'),
      completedSession('last-week-b', '2026-07-14T08:00:00+08:00'),
    ])

    expect(result.weeklyTrend).toEqual([
      { weekStart: '2026-05-25', workoutCount: 1 },
      { weekStart: '2026-06-01', workoutCount: 0 },
      { weekStart: '2026-06-08', workoutCount: 0 },
      { weekStart: '2026-06-15', workoutCount: 0 },
      { weekStart: '2026-06-22', workoutCount: 0 },
      { weekStart: '2026-06-29', workoutCount: 0 },
      { weekStart: '2026-07-06', workoutCount: 0 },
      { weekStart: '2026-07-13', workoutCount: 2 },
    ])
  })

  it('sums completed repetition volume in kg and excludes skipped or unweighted sets', () => {
    const result = calculateStatistics(range, [
      completedSession('weighted', '2026-07-14T08:00:00+08:00', [
        repetitionExercise('bench', '卧推', [
          {
            id: 'kg',
            setNumber: 1,
            repetitions: 5,
            weight: { mode: 'external', value: 100, unit: 'kg' },
            completedAt: '2026-07-14T08:00:00+08:00',
            skipped: false,
            idempotencyKey: 'kg',
          },
          {
            id: 'lb',
            setNumber: 2,
            repetitions: 10,
            weight: { mode: 'external', value: 22.0462, unit: 'lb' },
            completedAt: '2026-07-14T08:05:00+08:00',
            skipped: false,
            idempotencyKey: 'lb',
          },
          {
            id: 'bodyweight',
            setNumber: 3,
            repetitions: 10,
            weight: { mode: 'bodyweight' },
            completedAt: '2026-07-14T08:10:00+08:00',
            skipped: false,
            idempotencyKey: 'bodyweight',
          },
          {
            id: 'skipped',
            setNumber: 4,
            completedAt: '2026-07-14T08:15:00+08:00',
            skipped: true,
            idempotencyKey: 'skipped',
          },
        ]),
      ]),
      completedSession('last-month-weighted', '2026-06-30T08:00:00+08:00', [
        repetitionExercise('squat', '深蹲', [
          {
            id: 'last-month',
            setNumber: 1,
            repetitions: 10,
            weight: { mode: 'external', value: 100, unit: 'kg' },
            completedAt: '2026-06-30T08:05:00+08:00',
            skipped: false,
            idempotencyKey: 'last-month',
          },
        ]),
      ]),
    ])

    expect(result.trainingVolumeKg).toBeCloseTo(600, 3)
  })

  it('keeps the maximum completed external or attached weight as each exercise PR', () => {
    const result = calculateStatistics(range, [
      completedSession('older', '2026-07-10T08:00:00+08:00', [
        repetitionExercise('bench', '卧推', [
          {
            id: 'bench-older',
            setNumber: 1,
            repetitions: 5,
            weight: { mode: 'external', value: 90, unit: 'kg' },
            completedAt: '2026-07-10T08:05:00+08:00',
            skipped: false,
            idempotencyKey: 'bench-older',
          },
        ]),
      ]),
      completedSession('newer', '2026-07-14T08:00:00+08:00', [
        repetitionExercise('bench', '卧推', [
          {
            id: 'bench-pr',
            setNumber: 1,
            repetitions: 3,
            weight: { mode: 'external', value: 220.462, unit: 'lb' },
            completedAt: '2026-07-14T08:05:00+08:00',
            skipped: false,
            idempotencyKey: 'bench-pr',
          },
        ]),
        repetitionExercise('pull-up', '引体向上', [
          {
            id: 'attached',
            setNumber: 1,
            repetitions: 5,
            weight: { mode: 'bodyweight', value: 20, unit: 'kg' },
            completedAt: '2026-07-14T08:10:00+08:00',
            skipped: false,
            idempotencyKey: 'attached',
          },
          {
            id: 'pure-bodyweight',
            setNumber: 2,
            repetitions: 5,
            weight: { mode: 'bodyweight' },
            completedAt: '2026-07-14T08:15:00+08:00',
            skipped: false,
            idempotencyKey: 'pure-bodyweight',
          },
        ]),
      ]),
    ])

    expect(result.personalRecords).toHaveLength(2)
    expect(result.personalRecords[0]).toMatchObject({
      exerciseId: 'bench',
      exerciseName: '卧推',
      achievedAt: '2026-07-14T08:05:00+08:00',
    })
    expect(result.personalRecords[0].weightKg).toBeCloseTo(100, 3)
    expect(result.personalRecords[1]).toEqual({
      exerciseId: 'pull-up',
      exerciseName: '引体向上',
      weightKg: 20,
      achievedAt: '2026-07-14T08:10:00+08:00',
    })
  })

  it('rebuilds and persists a cached range from completed history', async () => {
    const database = new ForgeDatabase('forge-t10-statistics-rebuild')
    const useCases = createForgeDataUseCases(database)
    const inside = completedSession(
      'inside',
      '2026-07-14T08:00:00+08:00',
    )
    const outside = completedSession(
      'outside',
      '2026-05-20T08:00:00+08:00',
    )

    try {
      await database.workoutSessions.bulkPut([inside, outside])

      const cache = await useCases.statistics.rebuild(
        range,
        '2026-07-14T20:00:00+08:00',
      )

      expect(cache).toMatchObject({
        key: 'cached:rolling-8-weeks',
        scope: 'cached',
        rangeStart: range.start,
        rangeEnd: range.end,
        generatedAt: '2026-07-14T20:00:00+08:00',
        source: 'history',
        summary: { workoutCount: 1 },
      })
      await expect(database.statisticsCaches.get(cache.key)).resolves.toEqual(
        cache,
      )
    } finally {
      database.close()
    }
  })

  it('ignores legacy caches that cannot satisfy the statistics interface', async () => {
    const database = new ForgeDatabase('forge-t10-statistics-legacy-cache')
    const useCases = createForgeDataUseCases(database)
    const legacy = {
      key: 'cached:legacy',
      scope: 'cached',
      rangeStart: range.start,
      rangeEnd: range.end,
      generatedAt: '2026-07-14T18:00:00+08:00',
      source: 'history',
      summary: {
        workoutCount: 1,
        streakDays: 1,
        trainingVolumeKg: 100,
        personalRecords: [],
      },
    } as unknown as StatisticsCache

    try {
      await database.statisticsCaches.put(legacy)

      await expect(useCases.statistics.list()).resolves.toEqual([])
    } finally {
      database.close()
    }
  })

  it('refreshes the statistics store resource with the rebuilt cache', async () => {
    const database = new ForgeDatabase('forge-t10-statistics-store')
    const store = createForgeStore({
      initialize: () => database.open().then(() => undefined),
      data: createForgeDataUseCases(database),
      countPendingSync: () => database.syncQueue.count(),
      now: () => '2026-07-14T20:00:00+08:00',
    })

    try {
      await database.workoutSessions.put(
        completedSession('inside', '2026-07-14T08:00:00+08:00'),
      )

      await store.getState().rebuildStatistics(range)

      expect(store.getState().statistics).toMatchObject({
        status: 'ready',
        error: null,
        value: [{
          scope: 'cached',
          generatedAt: '2026-07-14T20:00:00+08:00',
          summary: { workoutCount: 1 },
        }],
      })
    } finally {
      database.close()
    }
  })

  it('loads the statistics page module after wiring the cache resource', () => {
    expect(StatisticsPage).toBeTypeOf('function')
  })
})
