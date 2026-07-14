import { describe, expect, it } from 'vitest'
import {
  dashboardWeekRange,
  deriveDashboardSchedule,
  type DashboardRange,
  type TrainingPlan,
  type WorkoutSession,
} from '../../src/domain'
import { createForgeDataUseCases, ForgeDatabase } from '../../src/data'
import { DashboardPage } from '../../src/pages/ShellPages'
import { createForgeStore } from '../../src/store'

const range: DashboardRange = {
  start: '2026-07-13',
  end: '2026-07-19',
  today: '2026-07-14',
}

function plan(
  id: string,
  overrides: Partial<TrainingPlan> = {},
): TrainingPlan {
  return {
    id,
    name: `Plan ${id}`,
    status: 'active',
    category: 'strength',
    weekdays: [2],
    localTime: '07:30',
    effectiveLocalDate: '2026-07-01',
    createdAt: '2026-07-01T08:00:00+08:00',
    updatedAt: '2026-07-01T08:00:00+08:00',
    sync: { status: 'local' },
    ...overrides,
  }
}

function session(
  id: string,
  planId: string,
  localDate: string,
  status: WorkoutSession['status'],
): WorkoutSession {
  const endedAt = status === 'completed' ? `${localDate}T08:45:00+08:00` : undefined
  return {
    id,
    planId,
    scheduleOccurrenceKey: `${planId}:${localDate}`,
    planName: `Snapshot ${planId}`,
    status,
    startedAt: `${localDate}T08:00:00+08:00`,
    endedAt,
    exercises: [{
      id: `${id}-exercise`,
      sourcePlanExerciseId: `${planId}-exercise`,
      exercise: { exerciseId: 'bench', name: '卧推', type: 'repetitions' },
      position: 0,
      target: {
        type: 'repetitions',
        targetSets: 1,
        targetRepetitions: 5,
        weight: { mode: 'external', value: 80, unit: 'kg' },
      },
      sets: status === 'completed' ? [{
        id: `${id}-set`,
        setNumber: 1,
        repetitions: 5,
        weight: { mode: 'external', value: 80, unit: 'kg' },
        completedAt: endedAt!,
        skipped: false,
        idempotencyKey: `${id}-set`,
      }] : [],
    }],
    idempotencyKey: `${id}-start`,
    createdAt: `${localDate}T08:00:00+08:00`,
    updatedAt: endedAt ?? `${localDate}T08:00:00+08:00`,
    sync: { status: 'local' },
  }
}

describe('dashboard', () => {
  it('builds the local Monday-to-Sunday range containing the focused date', () => {
    expect(
      dashboardWeekRange(
        new Date(2026, 6, 14, 12),
        new Date(2026, 6, 14, 12),
      ),
    ).toEqual(range)
  })

  it('derives multiple planned occurrences and explicit rest days without persisting them', () => {
    const days = deriveDashboardSchedule({
      range,
      plans: [plan('morning'), plan('evening', { localTime: '18:30' })],
      sessions: [],
    })

    expect(days).toHaveLength(7)
    expect(days[1]).toMatchObject({
      localDate: '2026-07-14',
      status: 'planned',
    })
    expect(days[1].occurrences.map((item) => item.key)).toEqual([
      'morning:2026-07-14',
      'evening:2026-07-14',
    ])
    expect(days[2]).toMatchObject({ status: 'rest', occurrences: [] })
  })

  it('uses existing session snapshots as the only source of past schedule facts', () => {
    const days = deriveDashboardSchedule({
      range,
      plans: [plan('changed', { weekdays: [1], name: 'Current name' })],
      sessions: [session('past', 'changed', '2026-07-13', 'completed')],
    })

    expect(days[0].occurrences).toEqual([
      expect.objectContaining({
        planName: 'Snapshot changed',
        status: 'completed',
        sessionId: 'past',
      }),
    ])
  })

  it.each([
    {
      name: 'in progress',
      sessions: [session('active', 'a', '2026-07-14', 'active')],
      expected: 'in_progress',
    },
    {
      name: 'paused in progress',
      sessions: [session('paused', 'a', '2026-07-14', 'paused')],
      expected: 'in_progress',
    },
    {
      name: 'partially completed',
      sessions: [session('done', 'a', '2026-07-14', 'completed')],
      expected: 'partially_completed',
    },
    {
      name: 'completed',
      sessions: [
        session('done-a', 'a', '2026-07-14', 'completed'),
        session('done-b', 'b', '2026-07-14', 'completed'),
      ],
      expected: 'completed',
    },
  ])('derives the $name day status for multiple workouts', ({ sessions, expected }) => {
    const days = deriveDashboardSchedule({
      range,
      plans: [plan('a'), plan('b', { localTime: '18:30' })],
      sessions,
    })

    expect(days[1].status).toBe(expected)
  })

  it('turns a cancelled session back into a planned occurrence that can be started again', () => {
    const days = deriveDashboardSchedule({
      range,
      plans: [plan('restart')],
      sessions: [session('cancelled', 'restart', '2026-07-14', 'cancelled')],
    })

    expect(days[1]).toMatchObject({
      status: 'planned',
      occurrences: [{
        key: 'restart:2026-07-14',
        status: 'planned',
      }],
    })
    expect(days[1].occurrences[0]).not.toHaveProperty('sessionId')
  })

  it('keeps a cancelled past occurrence as a planned fact instead of rewriting it as rest', () => {
    const days = deriveDashboardSchedule({
      range,
      plans: [],
      sessions: [session('cancelled-past', 'archived', '2026-07-13', 'cancelled')],
    })

    expect(days[0]).toMatchObject({
      status: 'planned',
      occurrences: [{
        planName: 'Snapshot archived',
        status: 'planned',
      }],
    })
  })

  it('loads schedule, recent workout and the latest statistics cache through one interface', async () => {
    const database = new ForgeDatabase('forge-t11-dashboard')
    const completed = session('recent', 'a', '2026-07-14', 'completed')
    try {
      await database.open()
      await database.trainingPlans.put(plan('a'))
      await database.workoutSessions.put(completed)
      await database.statisticsCaches.put({
        key: 'cached:rolling-8-weeks',
        scope: 'cached',
        rangeStart: '2026-05-25T00:00:00+08:00',
        rangeEnd: '2026-07-14T23:59:59+08:00',
        generatedAt: '2026-07-14T20:00:00+08:00',
        source: 'history',
        summary: {
          workoutCount: 1,
          weeklyWorkoutCount: 1,
          monthlyWorkoutCount: 1,
          streakDays: 1,
          weeklyTrend: [],
          trainingVolumeKg: 400,
          personalRecords: [],
        },
      })

      const snapshot = await createForgeDataUseCases(database).dashboard.load(range)

      expect(snapshot.recentWorkout?.id).toBe('recent')
      expect(snapshot.statistics?.summary.weeklyWorkoutCount).toBe(1)
      expect(snapshot.days[1].status).toBe('completed')
    } finally {
      database.close()
    }
  })

  it('exposes the production Dashboard page after wiring the aggregate resource', () => {
    expect(DashboardPage).toBeTypeOf('function')
  })

  it('loads the Dashboard snapshot into its independent store resource', async () => {
    const database = new ForgeDatabase('forge-t11-dashboard-store')
    const store = createForgeStore({
      initialize: () => database.open().then(() => undefined),
      data: createForgeDataUseCases(database),
      countPendingSync: () => database.syncQueue.count(),
    })
    try {
      await database.open()
      await database.trainingPlans.put(plan('store'))

      await store.getState().loadDashboard(range)

      expect(store.getState().dashboard).toMatchObject({
        status: 'ready',
        error: null,
        value: {
          days: expect.arrayContaining([
            expect.objectContaining({ localDate: '2026-07-14', status: 'planned' }),
          ]),
        },
      })
    } finally {
      database.close()
    }
  })
})
