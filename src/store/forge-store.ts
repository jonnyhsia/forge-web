import { create } from 'zustand'
import {
  createForgeDataUseCases,
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
} from '../data'
import type {
  AppSettings,
  EntityId,
  StatisticsCache,
  TrainingPlan,
  WorkoutSession,
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
  pendingSyncCount: number
  plans: PlansSlice
  planDetails: Record<EntityId, ResourceSlice<PlanAggregate | null>>
  history: PageSlice<WorkoutSession>
  workouts: ResourceSlice<WorkoutSession | null>
  statistics: ResourceSlice<StatisticsCache[]>
  settings: ResourceSlice<AppSettings | null>
  initialize: () => Promise<void>
  setOnline: (online: boolean) => void
  loadPlans: (options?: LoadPlansOptions) => Promise<void>
  loadPlan: (planId: EntityId) => Promise<void>
  savePlan: (input: PlanAggregate) => Promise<void>
  archivePlan: (planId: EntityId) => Promise<void>
  deletePlan: (planId: EntityId) => Promise<void>
  loadHistory: (options?: LoadPageOptions) => Promise<void>
  loadWorkout: () => Promise<void>
  saveWorkout: (session: WorkoutSession) => Promise<void>
  loadStatistics: () => Promise<void>
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
    pendingSyncCount: 0,
    plans: emptyPlans(),
    planDetails: {},
    history: emptyPage(),
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
            const [, , , , , pendingSyncCount] = await Promise.all([
              get().loadPlans({ reset: true }),
              get().loadWorkout(),
              get().loadHistory({ reset: true }),
              get().loadStatistics(),
              get().loadSettings(),
              dependencies.countPendingSync(),
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

    setOnline: (online) => set({ online }),

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

    loadWorkout: async () => {
      set({
        workouts: { ...get().workouts, status: 'loading', error: null },
      })

      try {
        const value = await dependencies.data.workouts.getActive()
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

    saveWorkout: async (session) => {
      try {
        await dependencies.data.workouts.save(session)
        const pendingSyncCount = await dependencies.countPendingSync()
        set({ pendingSyncCount })

        const refreshes: Promise<void>[] = [get().loadWorkout()]
        if (session.status === 'completed') {
          refreshes.push(get().loadHistory({ reset: true }))
        }
        await Promise.all(refreshes)
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

    saveStatistics: async (cache) => {
      try {
        await dependencies.data.statistics.save(cache)
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
})
