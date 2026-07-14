import { describe, expect, it } from 'vitest'
import { ForgeDatabase } from '../../src/data/database'
import { createForgeDataUseCases } from '../../src/data/use-cases'
import type { PlanAggregate } from '../../src/data/use-cases'
import { createForgeStore } from '../../src/store/forge-store'
import type {
  StatisticsCache,
  TrainingPlan,
  WorkoutSession,
} from '../../src/domain'

const timestamp = '2026-07-14T08:00:00.000Z'

function plan(id: string, updatedAt: string): TrainingPlan {
  return {
    id,
    name: id,
    status: 'active',
    category: 'strength',
    weekdays: [1],
    effectiveLocalDate: '2026-07-14',
    createdAt: updatedAt,
    updatedAt,
    sync: { status: 'local' },
  }
}

function completedSession(id: string, endedAt: string): WorkoutSession {
  return {
    id,
    planId: 'plan-a',
    scheduleOccurrenceKey: `plan-a:${id}`,
    planName: 'Push Day',
    status: 'completed',
    startedAt: '2026-07-14T07:00:00.000Z',
    endedAt,
    exercises: [],
    idempotencyKey: `start-${id}`,
    createdAt: endedAt,
    updatedAt: endedAt,
    sync: { status: 'local' },
  }
}

function statisticsCache(): StatisticsCache {
  return {
    key: 'cached:month',
    scope: 'cached',
    rangeStart: '2026-07-01T00:00:00.000Z',
    rangeEnd: '2026-07-31T23:59:59.999Z',
    generatedAt: '2026-07-14T09:00:00.000Z',
    source: 'history',
    summary: {
      workoutCount: 1,
      weeklyWorkoutCount: 1,
      monthlyWorkoutCount: 1,
      streakDays: 1,
      weeklyTrend: [{ weekStart: '2026-07-13', workoutCount: 1 }],
      trainingVolumeKg: 100,
      personalRecords: [],
    },
  }
}

describe('feature store', () => {
  it('loads and appends plan pages while owning loading and cursor state', async () => {
    const database = new ForgeDatabase('forge-t03-plans-store')
    const store = createForgeStore({
      initialize: () => database.open().then(() => undefined),
      data: createForgeDataUseCases(database),
      countPendingSync: () => database.syncQueue.count(),
      pageLimit: 2,
    })

    try {
      await database.trainingPlans.bulkPut([
        plan('plan-a', '2026-07-14T08:00:00.000Z'),
        plan('plan-b', '2026-07-14T09:00:00.000Z'),
        plan('plan-c', '2026-07-14T07:00:00.000Z'),
      ])

      await store.getState().loadPlans({ reset: true })
      expect(store.getState().plans).toMatchObject({
        status: 'ready',
        items: [{ id: 'plan-b' }, { id: 'plan-a' }],
        error: null,
      })
      expect(store.getState().plans.nextCursor).not.toBeNull()

      await store.getState().loadPlans()
      expect(store.getState().plans).toEqual({
        status: 'ready',
        items: [
          expect.objectContaining({ id: 'plan-b' }),
          expect.objectContaining({ id: 'plan-a' }),
          expect.objectContaining({ id: 'plan-c' }),
        ],
        error: null,
        nextCursor: null,
        filter: {},
      })
    } finally {
      database.close()
    }
  })

  it('loads a plan aggregate into an independent detail resource', async () => {
    const database = new ForgeDatabase('forge-t032-plan-detail-store')
    const store = createForgeStore({
      initialize: () => database.open().then(() => undefined),
      data: createForgeDataUseCases(database),
      countPendingSync: () => database.syncQueue.count(),
    })

    try {
      await database.trainingPlans.put(plan('plan-a', timestamp))

      await store.getState().loadPlan('plan-a')

      expect(store.getState().planDetails['plan-a']).toEqual({
        value: {
          plan: expect.objectContaining({ id: 'plan-a' }),
          exercises: [],
        },
        status: 'ready',
        error: null,
      })
      expect(store.getState().plans.status).toBe('idle')
    } finally {
      database.close()
    }
  })

  it('retains the plan filter while loading subsequent pages', async () => {
    const database = new ForgeDatabase('forge-t03-plans-filter-store')
    const store = createForgeStore({
      initialize: () => database.open().then(() => undefined),
      data: createForgeDataUseCases(database),
      countPendingSync: () => database.syncQueue.count(),
      pageLimit: 1,
    })

    try {
      await database.trainingPlans.bulkPut([
        { ...plan('cardio-new', '2026-07-14T10:00:00.000Z'), category: 'cardio' },
        plan('strength', '2026-07-14T09:00:00.000Z'),
        { ...plan('cardio-old', '2026-07-14T08:00:00.000Z'), category: 'cardio' },
      ])

      await store.getState().loadPlans({
        reset: true,
        filter: { category: 'cardio' },
      })
      await store.getState().loadPlans()

      expect(store.getState().plans.items.map(({ id }) => id)).toEqual([
        'cardio-new',
        'cardio-old',
      ])
    } finally {
      database.close()
    }
  })

  it('loads history pages without sharing plan pagination state', async () => {
    const database = new ForgeDatabase('forge-t03-history-store')
    const store = createForgeStore({
      initialize: () => database.open().then(() => undefined),
      data: createForgeDataUseCases(database),
      countPendingSync: () => database.syncQueue.count(),
      pageLimit: 1,
    })

    try {
      await database.workoutSessions.bulkPut([
        completedSession('session-a', '2026-07-14T08:00:00.000Z'),
        completedSession('session-b', '2026-07-14T09:00:00.000Z'),
      ])

      await store.getState().loadHistory({ reset: true })

      expect(store.getState().history).toMatchObject({
        status: 'ready',
        items: [{ id: 'session-b' }],
      })
      expect(store.getState().plans).toMatchObject({
        status: 'idle',
        items: [],
        nextCursor: null,
      })
    } finally {
      database.close()
    }
  })

  it('loads the active workout into its own resource state', async () => {
    const database = new ForgeDatabase('forge-t03-workouts-store')
    const store = createForgeStore({
      initialize: () => database.open().then(() => undefined),
      data: createForgeDataUseCases(database),
      countPendingSync: () => database.syncQueue.count(),
    })
    const active = {
      ...completedSession('session-active', '2026-07-14T09:00:00.000Z'),
      status: 'active' as const,
      endedAt: undefined,
    }

    try {
      await database.workoutSessions.put(active)
      await store.getState().loadWorkout()

      expect(store.getState().workouts).toEqual({
        value: active,
        status: 'ready',
        error: null,
      })
    } finally {
      database.close()
    }
  })

  it('refreshes only statistics after a statistics write', async () => {
    const database = new ForgeDatabase('forge-t03-statistics-store')
    const store = createForgeStore({
      initialize: () => database.open().then(() => undefined),
      data: createForgeDataUseCases(database),
      countPendingSync: () => database.syncQueue.count(),
    })
    const cache = statisticsCache()

    try {
      await store.getState().loadPlans({ reset: true })
      const plansBefore = store.getState().plans

      await store.getState().saveStatistics(cache)

      expect(store.getState().statistics).toEqual({
        value: [cache],
        status: 'ready',
        error: null,
      })
      expect(store.getState().plans).toBe(plansBefore)
    } finally {
      database.close()
    }
  })

  it('stores settings update state independently', async () => {
    const database = new ForgeDatabase('forge-t03-settings-store')
    const store = createForgeStore({
      initialize: () => database.open().then(() => undefined),
      data: createForgeDataUseCases(database),
      countPendingSync: () => database.syncQueue.count(),
    })

    try {
      await database.open()
      await store.getState().updateSettings({ defaultWeightUnit: 'lb' })

      expect(store.getState().settings).toMatchObject({
        status: 'ready',
        error: null,
        value: {
          defaultWeightUnit: 'lb',
          reminderLeadMinutes: 15,
        },
      })
      expect(store.getState().statistics.status).toBe('idle')
    } finally {
      database.close()
    }
  })

  it('refreshes plans and sync count after a plan write without reloading history', async () => {
    const database = new ForgeDatabase('forge-t03-save-plan-store')
    const store = createForgeStore({
      initialize: () => database.open().then(() => undefined),
      data: createForgeDataUseCases(database),
      countPendingSync: () => database.syncQueue.count(),
    })
    const input: PlanAggregate = { plan: plan('plan-a', timestamp), exercises: [] }

    try {
      await store.getState().loadHistory({ reset: true })
      const historyBefore = store.getState().history

      await store.getState().savePlan(input)

      expect(store.getState().plans).toMatchObject({
        status: 'ready',
        items: [{ id: 'plan-a', sync: { status: 'pending' } }],
      })
      expect(store.getState().planDetails['plan-a']).toMatchObject({
        status: 'ready',
        value: { plan: { id: 'plan-a' } },
      })
      expect(store.getState().pendingSyncCount).toBe(1)
      expect(store.getState().history).toBe(historyBefore)
    } finally {
      database.close()
    }
  })

  it('archives a plan and refreshes only the plans slice', async () => {
    const database = new ForgeDatabase('forge-t031-archive-plan-store')
    const store = createForgeStore({
      initialize: () => database.open().then(() => undefined),
      data: createForgeDataUseCases(database),
      countPendingSync: () => database.syncQueue.count(),
    })

    try {
      await database.trainingPlans.put(plan('plan-a', timestamp))
      await store.getState().loadHistory({ reset: true })
      const historyBefore = store.getState().history

      await store.getState().archivePlan('plan-a')

      expect(store.getState().plans).toMatchObject({
        status: 'ready',
        items: [],
      })
      expect(store.getState().pendingSyncCount).toBe(1)
      expect(store.getState().history).toBe(historyBefore)
      expect(store.getState().planDetails['plan-a']).toMatchObject({
        status: 'ready',
        value: { plan: { status: 'archived' } },
      })
    } finally {
      database.close()
    }
  })

  it('deletes a plan and removes it from the plans slice', async () => {
    const database = new ForgeDatabase('forge-t031-delete-plan-store')
    const store = createForgeStore({
      initialize: () => database.open().then(() => undefined),
      data: createForgeDataUseCases(database),
      countPendingSync: () => database.syncQueue.count(),
    })

    try {
      await database.trainingPlans.put(plan('plan-a', timestamp))
      await store.getState().loadPlans({ reset: true })

      await store.getState().deletePlan('plan-a')

      expect(store.getState().plans).toMatchObject({
        status: 'ready',
        items: [],
      })
      expect(store.getState().pendingSyncCount).toBe(1)
      expect(store.getState().planDetails['plan-a']).toBeUndefined()
    } finally {
      database.close()
    }
  })

  it('refreshes workout and history after completing a workout', async () => {
    const database = new ForgeDatabase('forge-t03-save-workout-store')
    const store = createForgeStore({
      initialize: () => database.open().then(() => undefined),
      data: createForgeDataUseCases(database),
      countPendingSync: () => database.syncQueue.count(),
    })
    const active = {
      ...completedSession('session-a', timestamp),
      status: 'active' as const,
      endedAt: undefined,
    }

    try {
      await database.workoutSessions.put(active)
      await store
        .getState()
        .transitionWorkout('session-a', { type: 'complete' })

      expect(store.getState().workouts).toEqual({
        value: null,
        status: 'ready',
        error: null,
      })
      expect(store.getState().history).toMatchObject({
        status: 'ready',
        items: [{ id: 'session-a', sync: { status: 'pending' } }],
      })
      expect(store.getState().pendingSyncCount).toBe(1)
    } finally {
      database.close()
    }
  })

  it('loads a completed history detail independently from the history page', async () => {
    const database = new ForgeDatabase('forge-t09-history-detail-store')
    const store = createForgeStore({
      initialize: () => database.open().then(() => undefined),
      data: createForgeDataUseCases(database),
      countPendingSync: () => database.syncQueue.count(),
    })
    const completed = completedSession('session-detail', timestamp)

    try {
      await database.workoutSessions.put(completed)
      await store.getState().loadHistoryDetail(completed.id)

      expect(store.getState().historyDetails[completed.id]).toEqual({
        value: completed,
        status: 'ready',
        error: null,
      })
      expect(store.getState().history.status).toBe('idle')
    } finally {
      database.close()
    }
  })

  it('initializes each feature slice through its independent loader', async () => {
    const database = new ForgeDatabase('forge-t03-initialize-store')
    const store = createForgeStore({
      initialize: () => database.open().then(() => undefined),
      data: createForgeDataUseCases(database),
      countPendingSync: () => database.syncQueue.count(),
    })

    try {
      await store.getState().initialize()

      expect(store.getState()).toMatchObject({
        initialized: true,
        initializing: false,
        initializationError: null,
        plans: { status: 'ready' },
        workouts: { status: 'ready' },
        history: { status: 'ready' },
        statistics: { status: 'ready' },
        settings: { status: 'ready', value: { key: 'app' } },
      })
    } finally {
      database.close()
    }
  })

  it('keeps existing page data and exposes a unified error when loading fails', async () => {
    const database = new ForgeDatabase('forge-t03-error-store')
    const store = createForgeStore({
      initialize: () => database.open().then(() => undefined),
      data: createForgeDataUseCases(database),
      countPendingSync: () => database.syncQueue.count(),
      pageLimit: 1,
    })

    await database.open()
    await database.trainingPlans.bulkPut([
      plan('plan-a', timestamp),
      plan('plan-b', '2026-07-14T09:00:00.000Z'),
    ])
    await store.getState().loadPlans({ reset: true })
    database.close({ disableAutoOpen: true })

    await store.getState().loadPlans({ reset: true })

    expect(store.getState().plans).toMatchObject({
      status: 'error',
      items: [{ id: 'plan-b' }],
      error: { name: 'DataError', code: 'storage_unavailable' },
    })
  })
})
