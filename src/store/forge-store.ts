import { create } from 'zustand'
import {
  createForgeDataUseCases,
  browserSyncRuntime,
  forgeDatabase,
  localDataService,
  syncQueueRepository,
  toDataError,
  type DataError,
  type ForgeDataUseCases,
  type PageCursor,
  type PlanAggregate,
  type PlansFilter,
  type SettingsPatch,
  type StartWorkoutInput,
  type SyncMode,
  type NetworkSyncStatus,
} from '../data'
import type {
  AppSettings,
  DashboardRange,
  DashboardSnapshot,
  EntityId,
  StatisticsCache,
  StatisticsRange,
  TrainingPlan,
  WorkoutSession,
  WorkoutTransitionCommand,
  CompleteWorkoutSetCommand,
  CompleteWorkoutSetOutcome,
  WorkoutTimerState,
  SyncQueueItem,
} from '../domain'

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface PageSlice<TItem> {
  items: TItem[]
  status: LoadStatus
  error: DataError | null
  nextCursor: PageCursor | null
}

export interface PlansSlice extends PageSlice<TrainingPlan> {
  filter: PlansFilter
}

export interface ResourceSlice<TValue> {
  value: TValue
  status: LoadStatus
  error: DataError | null
}

export interface ForgeStoreDependencies {
  initialize(): Promise<void>
  data: ForgeDataUseCases
  countPendingSync(): Promise<number>
  pageLimit?: number
  now?: () => string
  sync?: {
    mode: SyncMode
    list(): Promise<SyncQueueItem[]>
    retry(itemId: string): Promise<void>
    acceptRemote(itemId: string): Promise<void>
    keepLocal(itemId: string): Promise<void>
    runNow(): Promise<void>
  }
}

export interface LoadPlansOptions {
  reset?: boolean
  filter?: PlansFilter
}

export interface LoadPageOptions {
  reset?: boolean
}

export interface ForgeState {
  initialized: boolean
  initializing: boolean
  initializationError: DataError | null
  online: boolean
  networkStatus: NetworkSyncStatus
  syncMode: SyncMode
  pendingSyncCount: number
  syncQueue: ResourceSlice<SyncQueueItem[]>
  dashboard: ResourceSlice<DashboardSnapshot | null>
  plans: PlansSlice
  planDetails: Record<EntityId, ResourceSlice<PlanAggregate | null>>
  history: PageSlice<WorkoutSession>
  historyDetails: Record<EntityId, ResourceSlice<WorkoutSession | null>>
  workouts: ResourceSlice<WorkoutSession | null>
  statistics: ResourceSlice<StatisticsCache[]>
  settings: ResourceSlice<AppSettings | null>
  initialize: () => Promise<void>
  setOnline: (online: boolean) => void
  setNetworkStatus: (status: NetworkSyncStatus) => void
  loadSyncQueue: () => Promise<void>
  retrySyncItem: (itemId: string) => Promise<void>
  acceptRemoteSyncItem: (itemId: string) => Promise<void>
  keepLocalSyncItem: (itemId: string) => Promise<void>
  runSyncNow: () => Promise<void>
  loadDashboard: (range: DashboardRange) => Promise<void>
  loadPlans: (options?: LoadPlansOptions) => Promise<void>
  loadPlan: (planId: EntityId) => Promise<void>
  savePlan: (input: PlanAggregate) => Promise<void>
  archivePlan: (planId: EntityId) => Promise<void>
  deletePlan: (planId: EntityId) => Promise<void>
  loadHistory: (options?: LoadPageOptions) => Promise<void>
  loadHistoryDetail: (sessionId: EntityId) => Promise<void>
  loadWorkout: (sessionId?: EntityId) => Promise<void>
  startWorkout: (input: StartWorkoutInput) => Promise<WorkoutSession>
  transitionWorkout: (
    sessionId: EntityId,
    command: WorkoutTransitionCommand,
  ) => Promise<WorkoutSession>
  completeWorkoutSet: (
    command: CompleteWorkoutSetCommand,
    idempotencyKey: string,
  ) => Promise<CompleteWorkoutSetOutcome>
  saveWorkoutTimer: (
    sessionId: EntityId,
    timer: WorkoutTimerState | undefined,
  ) => Promise<WorkoutSession>
  loadStatistics: () => Promise<void>
  rebuildStatistics: (range: StatisticsRange) => Promise<void>
  saveStatistics: (cache: StatisticsCache) => Promise<void>
  loadSettings: () => Promise<void>
  updateSettings: (patch: SettingsPatch) => Promise<void>
}

const emptyPage = <TItem>(): PageSlice<TItem> => ({
  items: [],
  status: 'idle',
  error: null,
  nextCursor: null,
})

const emptyPlans = (): PlansSlice => ({ ...emptyPage(), filter: {} })

const emptyResource = <TValue>(value: TValue): ResourceSlice<TValue> => ({
  value,
  status: 'idle',
  error: null,
})

function appendUnique<TItem extends { id: string }>(
  current: TItem[],
  incoming: TItem[],
): TItem[] {
  const items = new Map(current.map((item) => [item.id, item]))
  for (const item of incoming) items.set(item.id, item)
  return [...items.values()]
}

export function createForgeStore(dependencies: ForgeStoreDependencies) {
  const pageLimit = dependencies.pageLimit ?? 20
  let initialization: Promise<void> | undefined

  return create<ForgeState>((set, get) => ({
    initialized: false,
    initializing: false,
    initializationError: null,
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    networkStatus:
      typeof navigator === 'undefined' || navigator.onLine ? 'online' : 'offline',
    syncMode: dependencies.sync?.mode ?? 'local',
    pendingSyncCount: 0,
    syncQueue: emptyResource([]),
    dashboard: emptyResource(null),
    plans: emptyPlans(),
    planDetails: {},
    history: emptyPage(),
    historyDetails: {},
    workouts: emptyResource(null),
    statistics: emptyResource([]),
    settings: emptyResource(null),

    initialize: async () => {
      if (get().initialized) return

      if (!initialization) {
        set({ initializing: true, initializationError: null })
        initialization = dependencies
          .initialize()
          .then(async () => {
            const pendingSyncCount = await dependencies.countPendingSync()
            await Promise.all([
              get().loadPlans({ reset: true }),
              get().loadWorkout(),
              get().loadHistory({ reset: true }),
              get().loadStatistics(),
              get().loadSettings(),
              get().loadSyncQueue(),
            ])
            set({ initialized: true, initializing: false, pendingSyncCount })
          })
          .catch((error: unknown) => {
            set({
              initializing: false,
              initializationError: toDataError(error),
            })
            initialization = undefined
          })
      }

      await initialization
    },

    setOnline: (online) =>
      set({ online, networkStatus: online ? 'online' : 'offline' }),

    setNetworkStatus: (networkStatus) =>
      set({ online: networkStatus !== 'offline', networkStatus }),

    loadSyncQueue: async () => {
      if (!dependencies.sync) {
        set({ syncQueue: { value: [], status: 'ready', error: null } })
        return
      }
      set({
        syncQueue: { ...get().syncQueue, status: 'loading', error: null },
      })
      try {
        const value = await dependencies.sync.list()
        set({
          pendingSyncCount: value.length,
          syncQueue: { value, status: 'ready', error: null },
        })
      } catch (error) {
        set({
          syncQueue: {
            ...get().syncQueue,
            status: 'error',
            error: toDataError(error),
          },
        })
      }
    },

    retrySyncItem: async (itemId) => {
      if (!dependencies.sync) return
      await dependencies.sync.retry(itemId)
      await get().loadSyncQueue()
    },

    acceptRemoteSyncItem: async (itemId) => {
      if (!dependencies.sync) return
      await dependencies.sync.acceptRemote(itemId)
      await Promise.all([
        get().loadSyncQueue(),
        get().loadPlans({ reset: true }),
        get().loadWorkout(),
        get().loadHistory({ reset: true }),
        get().loadStatistics(),
      ])
    },

    keepLocalSyncItem: async (itemId) => {
      if (!dependencies.sync) return
      await dependencies.sync.keepLocal(itemId)
      await get().loadSyncQueue()
    },

    runSyncNow: async () => {
      if (!dependencies.sync) return
      await dependencies.sync.runNow()
      await get().loadSyncQueue()
    },

    loadDashboard: async (range) => {
      const previous = get().dashboard
      const sameRange =
        previous.value?.range.start === range.start &&
        previous.value.range.end === range.end
      set({
        dashboard: {
          value: sameRange ? previous.value : null,
          status: 'loading',
          error: null,
        },
      })

      try {
        const value = await dependencies.data.dashboard.load(range)
        set({ dashboard: { value, status: 'ready', error: null } })
      } catch (error) {
        set({
          dashboard: {
            value: sameRange ? previous.value : null,
            status: 'error',
            error: toDataError(error),
          },
        })
      }
    },

    loadPlans: async (options = {}) => {
      const previous = get().plans
      const reset = options.reset || options.filter !== undefined
      const filter = options.filter ?? previous.filter

      if (!reset && previous.status === 'ready' && !previous.nextCursor) {
        return
      }

      set({
        plans: {
          ...previous,
          status: 'loading',
          error: null,
        },
      })

      try {
        const page = await dependencies.data.plans.listPage({
          cursor: reset ? undefined : previous.nextCursor,
          limit: pageLimit,
          filter,
        })
        set({
          plans: {
            items: reset
              ? page.items
              : appendUnique(previous.items, page.items),
            status: 'ready',
            error: null,
            nextCursor: page.nextCursor,
            filter,
          },
        })
      } catch (error) {
        set({
          plans: {
            ...previous,
            status: 'error',
            error: toDataError(error),
          },
        })
      }
    },

    loadPlan: async (planId) => {
      const previous = get().planDetails[planId] ?? emptyResource(null)
      set({
        planDetails: {
          ...get().planDetails,
          [planId]: { ...previous, status: 'loading', error: null },
        },
      })

      try {
        const value = await dependencies.data.plans.get(planId)
        set({
          planDetails: {
            ...get().planDetails,
            [planId]: { value, status: 'ready', error: null },
          },
        })
      } catch (error) {
        set({
          planDetails: {
            ...get().planDetails,
            [planId]: {
              ...previous,
              status: 'error',
              error: toDataError(error),
            },
          },
        })
      }
    },

    savePlan: async (input) => {
      try {
        const value = await dependencies.data.plans.save(input)
        const pendingSyncCount = await dependencies.countPendingSync()
        set({
          pendingSyncCount,
          planDetails: {
            ...get().planDetails,
            [value.plan.id]: { value, status: 'ready', error: null },
          },
        })
        await get().loadPlans({ reset: true })
      } catch (error) {
        const dataError = toDataError(error)
        set({
          plans: {
            ...get().plans,
            status: 'error',
            error: dataError,
          },
        })
        throw dataError
      }
    },

    archivePlan: async (planId) => {
      try {
        const value = await dependencies.data.plans.archive(planId)
        const pendingSyncCount = await dependencies.countPendingSync()
        set({
          pendingSyncCount,
          planDetails: {
            ...get().planDetails,
            [planId]: { value, status: 'ready', error: null },
          },
        })
        await get().loadPlans({ reset: true })
      } catch (error) {
        const dataError = toDataError(error)
        set({
          plans: {
            ...get().plans,
            status: 'error',
            error: dataError,
          },
        })
        throw dataError
      }
    },

    deletePlan: async (planId) => {
      try {
        await dependencies.data.plans.delete(planId)
        const pendingSyncCount = await dependencies.countPendingSync()
        const planDetails = { ...get().planDetails }
        delete planDetails[planId]
        set({ pendingSyncCount, planDetails })
        await get().loadPlans({ reset: true })
      } catch (error) {
        const dataError = toDataError(error)
        set({
          plans: {
            ...get().plans,
            status: 'error',
            error: dataError,
          },
        })
        throw dataError
      }
    },

    loadHistory: async (options = {}) => {
      const previous = get().history
      if (!options.reset && previous.status === 'ready' && !previous.nextCursor) {
        return
      }

      set({
        history: {
          ...previous,
          status: 'loading',
          error: null,
        },
      })

      try {
        const page = await dependencies.data.history.listPage({
          cursor: options.reset ? undefined : previous.nextCursor,
          limit: pageLimit,
        })
        set({
          history: {
            items: options.reset
              ? page.items
              : appendUnique(previous.items, page.items),
            status: 'ready',
            error: null,
            nextCursor: page.nextCursor,
          },
        })
      } catch (error) {
        set({
          history: {
            ...previous,
            status: 'error',
            error: toDataError(error),
          },
        })
      }
    },

    loadHistoryDetail: async (sessionId) => {
      const previous = get().historyDetails[sessionId] ?? emptyResource(null)
      set({
        historyDetails: {
          ...get().historyDetails,
          [sessionId]: { ...previous, status: 'loading', error: null },
        },
      })

      try {
        const value = await dependencies.data.history.getDetail(sessionId)
        set({
          historyDetails: {
            ...get().historyDetails,
            [sessionId]: { value, status: 'ready', error: null },
          },
        })
      } catch (error) {
        set({
          historyDetails: {
            ...get().historyDetails,
            [sessionId]: {
              ...previous,
              status: 'error',
              error: toDataError(error),
            },
          },
        })
      }
    },

    loadWorkout: async (sessionId) => {
      set({
        workouts: { ...get().workouts, status: 'loading', error: null },
      })

      try {
        const value = sessionId
          ? await dependencies.data.workouts.get(sessionId)
          : await dependencies.data.workouts.getActive()
        set({ workouts: { value, status: 'ready', error: null } })
      } catch (error) {
        set({
          workouts: {
            ...get().workouts,
            status: 'error',
            error: toDataError(error),
          },
        })
      }
    },

    startWorkout: async (input) => {
      try {
        const session = await dependencies.data.workouts.start(input)
        const pendingSyncCount = await dependencies.countPendingSync()
        set({
          pendingSyncCount,
          workouts: {
            value: session.status === 'completed' ? null : session,
            status: 'ready',
            error: null,
          },
        })
        return session
      } catch (error) {
        const dataError = toDataError(error)
        set({
          workouts: {
            ...get().workouts,
            status: 'error',
            error: dataError,
          },
        })
        throw dataError
      }
    },

    transitionWorkout: async (sessionId, command) => {
      try {
        const session = await dependencies.data.workouts.transition(
          sessionId,
          command,
        )
        const pendingSyncCount = await dependencies.countPendingSync()
        set({
          pendingSyncCount,
          workouts: {
            value:
              session.status === 'completed' || session.status === 'cancelled'
                ? null
                : session,
            status: 'ready',
            error: null,
          },
        })
        if (session.status === 'completed') {
          await get().loadHistory({ reset: true })
        }
        return session
      } catch (error) {
        const dataError = toDataError(error)
        set({
          workouts: {
            ...get().workouts,
            status: 'error',
            error: dataError,
          },
        })
        throw dataError
      }
    },

    completeWorkoutSet: async (command, idempotencyKey) => {
      try {
        const outcome = await dependencies.data.workouts.completeSet(
          command,
          idempotencyKey,
        )
        const pendingSyncCount = await dependencies.countPendingSync()
        set({
          pendingSyncCount,
          workouts: {
            value: outcome.session,
            status: 'ready',
            error: null,
          },
        })
        return outcome
      } catch (error) {
        const dataError = toDataError(error)
        set({
          workouts: {
            ...get().workouts,
            status: 'error',
            error: dataError,
          },
        })
        throw dataError
      }
    },

    saveWorkoutTimer: async (sessionId, timer) => {
      try {
        const session = await dependencies.data.workouts.saveTimer(sessionId, timer)
        const pendingSyncCount = await dependencies.countPendingSync()
        set({ pendingSyncCount, workouts: { value: session, status: 'ready', error: null } })
        return session
      } catch (error) {
        const dataError = toDataError(error)
        set({ workouts: { ...get().workouts, status: 'error', error: dataError } })
        throw dataError
      }
    },

    loadStatistics: async () => {
      set({
        statistics: {
          ...get().statistics,
          status: 'loading',
          error: null,
        },
      })

      try {
        const value = await dependencies.data.statistics.list()
        set({ statistics: { value, status: 'ready', error: null } })
      } catch (error) {
        set({
          statistics: {
            ...get().statistics,
            status: 'error',
            error: toDataError(error),
          },
        })
      }
    },

    rebuildStatistics: async (range) => {
      set({
        statistics: {
          ...get().statistics,
          status: 'loading',
          error: null,
        },
      })

      try {
        await dependencies.data.statistics.rebuild(range, dependencies.now?.())
        const value = await dependencies.data.statistics.list()
        const pendingSyncCount = await dependencies.countPendingSync()
        set({
          pendingSyncCount,
          statistics: { value, status: 'ready', error: null },
        })
      } catch (error) {
        set({
          statistics: {
            ...get().statistics,
            status: 'error',
            error: toDataError(error),
          },
        })
      }
    },

    saveStatistics: async (cache) => {
      try {
        await dependencies.data.statistics.save(cache)
        const pendingSyncCount = await dependencies.countPendingSync()
        set({ pendingSyncCount })
        await get().loadStatistics()
      } catch (error) {
        const dataError = toDataError(error)
        set({
          statistics: {
            ...get().statistics,
            status: 'error',
            error: dataError,
          },
        })
        throw dataError
      }
    },

    loadSettings: async () => {
      set({
        settings: { ...get().settings, status: 'loading', error: null },
      })

      try {
        const value = await dependencies.data.settings.get()
        set({ settings: { value, status: 'ready', error: null } })
      } catch (error) {
        set({
          settings: {
            ...get().settings,
            status: 'error',
            error: toDataError(error),
          },
        })
      }
    },

    updateSettings: async (patch) => {
      set({
        settings: { ...get().settings, status: 'loading', error: null },
      })

      try {
        const value = await dependencies.data.settings.update(patch)
        set({ settings: { value, status: 'ready', error: null } })
      } catch (error) {
        const dataError = toDataError(error)
        set({
          settings: {
            ...get().settings,
            status: 'error',
            error: dataError,
          },
        })
        throw dataError
      }
    },
  }))
}

export const useForgeStore = createForgeStore({
  initialize: () => localDataService.initialize(),
  data: createForgeDataUseCases(forgeDatabase),
  countPendingSync: () => syncQueueRepository.countPending(),
  sync: browserSyncRuntime,
})
