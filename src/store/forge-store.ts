import { create } from 'zustand'
import type {
  AppSettings,
  Exercise,
  PlanExercise,
  StatisticsCache,
  TrainingPlan,
  WorkoutSession,
} from '../domain/entities'
import {
  forgeRepositories,
  localDataService,
  syncQueueRepository,
} from '../data'

interface SaveTrainingPlanInput {
  plan: TrainingPlan
  exercises: PlanExercise[]
}

export interface ForgeState {
  initialized: boolean
  initializing: boolean
  initializationError: string | null
  online: boolean
  exercises: Exercise[]
  trainingPlans: TrainingPlan[]
  planExercises: PlanExercise[]
  workoutSessions: WorkoutSession[]
  statisticsCaches: StatisticsCache[]
  settings: AppSettings | null
  activeWorkoutSessionId: string | null
  pendingSyncCount: number
  initialize: () => Promise<void>
  refresh: () => Promise<void>
  setOnline: (online: boolean) => void
  saveExercise: (exercise: Exercise) => Promise<void>
  saveTrainingPlan: (input: SaveTrainingPlanInput) => Promise<void>
  saveWorkoutSession: (session: WorkoutSession) => Promise<void>
  saveStatisticsCache: (cache: StatisticsCache) => Promise<void>
  saveSettings: (settings: AppSettings) => Promise<void>
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : 'Failed to initialize local data'
}

let initialization: Promise<void> | undefined

export const useForgeStore = create<ForgeState>((set, get) => ({
  initialized: false,
  initializing: false,
  initializationError: null,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  exercises: [],
  trainingPlans: [],
  planExercises: [],
  workoutSessions: [],
  statisticsCaches: [],
  settings: null,
  activeWorkoutSessionId: null,
  pendingSyncCount: 0,

  initialize: async () => {
    if (get().initialized) {
      return
    }

    if (!initialization) {
      set({ initializing: true, initializationError: null })
      initialization = localDataService
        .initialize()
        .then(() => get().refresh())
        .then(() => {
          set({ initialized: true, initializing: false })
        })
        .catch((error: unknown) => {
          set({
            initializing: false,
            initializationError: messageFrom(error),
          })
          initialization = undefined
        })
    }

    await initialization
  },

  refresh: async () => {
    const [
      exercises,
      trainingPlans,
      planExercises,
      workoutSessions,
      activeWorkoutSession,
      pendingSyncCount,
      statisticsCaches,
      settings,
    ] = await Promise.all([
      forgeRepositories.exercises.list(),
      forgeRepositories.trainingPlans.list(),
      forgeRepositories.planExercises.list(),
      forgeRepositories.workoutSessions.list(),
      forgeRepositories.workoutSessions.getActive(),
      syncQueueRepository.countPending(),
      forgeRepositories.statisticsCaches.toArray(),
      forgeRepositories.settings.get('app'),
    ])

    set({
      exercises,
      trainingPlans,
      planExercises,
      workoutSessions,
      activeWorkoutSessionId: activeWorkoutSession?.id ?? null,
      pendingSyncCount,
      statisticsCaches,
      settings: settings ?? null,
    })
  },

  setOnline: (online) => set({ online }),

  saveExercise: async (exercise) => {
    await localDataService.saveExercise(exercise)
    await get().refresh()
  },

  saveTrainingPlan: async ({ plan, exercises }) => {
    await localDataService.saveTrainingPlan(plan, exercises)
    await get().refresh()
  },

  saveWorkoutSession: async (session) => {
    await localDataService.saveWorkoutSession(session)
    await get().refresh()
  },

  saveStatisticsCache: async (cache) => {
    await localDataService.saveStatisticsCache(cache)
    await get().refresh()
  },

  saveSettings: async (settings) => {
    await localDataService.saveSettings(settings)
    await get().refresh()
  },
}))
