import {
  createEntityId,
  nowIso,
  type AppSettings,
  type EntityId,
  type Exercise,
  type PlanExercise,
  type StatisticsCache,
  type StatisticsRange,
  type TrainingPlan,
  type WorkoutSession,
  type WorkoutTransitionCommand,
  type CompleteWorkoutSetCommand,
  type CompleteWorkoutSetOutcome,
  type DashboardRange,
  type DashboardSnapshot,
  type WorkoutTimerState,
  calculateStatistics,
  deriveDashboardSchedule,
} from '../domain'
import { DEFAULT_APP_SETTINGS, type ForgeDatabase } from './database'
import { DataError, toDataError } from './errors'
import {
  LocalDataService,
  type StartWorkoutInput,
  type WorkoutRuntimeDependencies,
} from './local-data-service'
import type { Page, PageRequest } from './pagination'
import {
  DexiePlansRepository,
  DexieHistoryRepository,
  type HistoryRepository,
  type PlansFilter,
  type PlansRepository,
} from './repositories/feature-repositories'
import { SyncQueueRepository } from './sync/sync-queue'

export interface PlanAggregate {
  plan: TrainingPlan
  exercises: PlanExerciseAggregate[]
}

export interface PlanExerciseAggregate {
  exercise: Exercise
  planExercise: PlanExercise
}

export interface PlansUseCases {
  listPage(request?: PageRequest<PlansFilter>): Promise<Page<TrainingPlan>>
  get(planId: EntityId): Promise<PlanAggregate>
  save(input: PlanAggregate): Promise<PlanAggregate>
  archive(planId: EntityId): Promise<PlanAggregate>
  delete(planId: EntityId): Promise<void>
}

export interface WorkoutsUseCases {
  get(sessionId: EntityId): Promise<WorkoutSession>
  getActive(): Promise<WorkoutSession | null>
  start(input: StartWorkoutInput): Promise<WorkoutSession>
  transition(
    sessionId: EntityId,
    command: WorkoutTransitionCommand,
  ): Promise<WorkoutSession>
  completeSet(
    command: CompleteWorkoutSetCommand,
    idempotencyKey: string,
  ): Promise<CompleteWorkoutSetOutcome>
  saveTimer(
    sessionId: EntityId,
    timer: WorkoutTimerState | undefined,
  ): Promise<WorkoutSession>
}

export interface HistoryUseCases {
  listPage(request?: PageRequest): Promise<Page<WorkoutSession>>
  getDetail(sessionId: EntityId): Promise<WorkoutSession>
}

export type SettingsPatch = Partial<
  Omit<AppSettings, 'key' | 'dataSchemaVersion'>
>

export interface SettingsUseCases {
  get(): Promise<AppSettings>
  update(patch: SettingsPatch): Promise<AppSettings>
}

export interface StatisticsUseCases {
  list(): Promise<StatisticsCache[]>
  save(cache: StatisticsCache): Promise<StatisticsCache>
  rebuild(
    range: StatisticsRange,
    generatedAt?: string,
  ): Promise<StatisticsCache>
}

export interface DashboardUseCases {
  load(range: DashboardRange): Promise<DashboardSnapshot>
}

class LocalPlansUseCases implements PlansUseCases {
  private readonly database: ForgeDatabase
  private readonly repository: PlansRepository
  private readonly localData: LocalDataService

  constructor(
    database: ForgeDatabase,
    repository: PlansRepository,
    localData: LocalDataService,
  ) {
    this.database = database
    this.repository = repository
    this.localData = localData
  }

  async listPage(
    request: PageRequest<PlansFilter> = {},
  ): Promise<Page<TrainingPlan>> {
    try {
      return await this.repository.listPage(request)
    } catch (error) {
      throw toDataError(error)
    }
  }

  async get(planId: EntityId): Promise<PlanAggregate> {
    try {
      const plan = await this.database.trainingPlans.get(planId)

      if (!plan || plan.deletedAt) {
        throw new DataError('not_found', `Training plan ${planId} was not found`)
      }

      const planExercises = await this.database.planExercises
        .where('planId')
        .equals(planId)
        .sortBy('position')
      const visiblePlanExercises = planExercises.filter((item) => !item.deletedAt)
      const exercises = await this.database.exercises.bulkGet(
        visiblePlanExercises.map((item) => item.exerciseId),
      )

      return {
        plan,
        exercises: visiblePlanExercises.map((planExercise, index) => {
          const exercise = exercises[index]
          if (!exercise || exercise.deletedAt) {
            throw new DataError(
              'not_found',
              `Exercise ${planExercise.exerciseId} was not found`,
            )
          }
          return { exercise, planExercise }
        }),
      }
    } catch (error) {
      throw toDataError(error)
    }
  }

  async save(input: PlanAggregate): Promise<PlanAggregate> {
    try {
      await this.localData.saveTrainingPlan(input.plan, input.exercises)
      return await this.get(input.plan.id)
    } catch (error) {
      throw toDataError(error)
    }
  }

  async archive(planId: EntityId): Promise<PlanAggregate> {
    try {
      const aggregate = await this.get(planId)
      return await this.save({
        ...aggregate,
        plan: { ...aggregate.plan, status: 'archived' },
      })
    } catch (error) {
      throw toDataError(error)
    }
  }

  async delete(planId: EntityId): Promise<void> {
    try {
      const aggregate = await this.get(planId)
      await this.localData.saveTrainingPlan(
        {
          ...aggregate.plan,
          deletedAt: nowIso(),
        },
        aggregate.exercises,
      )
    } catch (error) {
      throw toDataError(error)
    }
  }
}

class LocalWorkoutsUseCases implements WorkoutsUseCases {
  private readonly database: ForgeDatabase
  private readonly localData: LocalDataService
  private readonly runtime: WorkoutRuntimeDependencies

  constructor(
    database: ForgeDatabase,
    localData: LocalDataService,
    runtime: WorkoutRuntimeDependencies,
  ) {
    this.database = database
    this.localData = localData
    this.runtime = runtime
  }

  async get(sessionId: EntityId): Promise<WorkoutSession> {
    try {
      const session = await this.database.workoutSessions.get(sessionId)

      if (!session || session.deletedAt) {
        throw new DataError(
          'not_found',
          `Workout session ${sessionId} was not found`,
        )
      }

      return session
    } catch (error) {
      throw toDataError(error)
    }
  }

  async getActive(): Promise<WorkoutSession | null> {
    try {
      const sessions = await this.database.workoutSessions
        .where('status')
        .anyOf(['draft', 'active', 'paused'])
        .toArray()

      sessions.sort(
        (left, right) =>
          right.updatedAt.localeCompare(left.updatedAt) ||
          right.id.localeCompare(left.id),
      )

      return sessions.find((session) => !session.deletedAt) ?? null
    } catch (error) {
      throw toDataError(error)
    }
  }

  async start(input: StartWorkoutInput): Promise<WorkoutSession> {
    try {
      return await this.localData.startWorkoutSession(input, this.runtime)
    } catch (error) {
      throw toDataError(error)
    }
  }

  async transition(
    sessionId: EntityId,
    command: WorkoutTransitionCommand,
  ): Promise<WorkoutSession> {
    try {
      return await this.localData.transitionWorkoutSession(
        sessionId,
        command,
        this.runtime,
      )
    } catch (error) {
      throw toDataError(error)
    }
  }

  async completeSet(
    command: CompleteWorkoutSetCommand,
    idempotencyKey: string,
  ): Promise<CompleteWorkoutSetOutcome> {
    try {
      return await this.localData.completeWorkoutSet(
        command,
        idempotencyKey,
        this.runtime,
      )
    } catch (error) {
      throw toDataError(error)
    }
  }

  saveTimer(
    sessionId: EntityId,
    timer: WorkoutTimerState | undefined,
  ): Promise<WorkoutSession> {
    return this.localData.saveWorkoutTimerState(sessionId, timer, this.runtime)
  }
}

class LocalHistoryUseCases implements HistoryUseCases {
  private readonly database: ForgeDatabase
  private readonly repository: HistoryRepository

  constructor(
    database: ForgeDatabase,
    repository: HistoryRepository,
  ) {
    this.database = database
    this.repository = repository
  }

  async listPage(request: PageRequest = {}): Promise<Page<WorkoutSession>> {
    try {
      return await this.repository.listPage(request)
    } catch (error) {
      throw toDataError(error)
    }
  }

  async getDetail(sessionId: EntityId): Promise<WorkoutSession> {
    try {
      const session = await this.database.workoutSessions.get(sessionId)

      if (
        !session ||
        session.deletedAt ||
        session.status !== 'completed' ||
        !session.endedAt
      ) {
        throw new DataError(
          'not_found',
          `Workout history ${sessionId} was not found`,
        )
      }

      return session
    } catch (error) {
      throw toDataError(error)
    }
  }
}

class LocalSettingsUseCases implements SettingsUseCases {
  private readonly database: ForgeDatabase

  constructor(database: ForgeDatabase) {
    this.database = database
  }

  async get(): Promise<AppSettings> {
    try {
      return (
        (await this.database.settings.get('app')) ?? {
          ...DEFAULT_APP_SETTINGS,
        }
      )
    } catch (error) {
      throw toDataError(error)
    }
  }

  async update(patch: SettingsPatch): Promise<AppSettings> {
    try {
      const settings = { ...(await this.get()), ...patch }
      await this.database.settings.put(settings)
      return settings
    } catch (error) {
      throw toDataError(error)
    }
  }
}

class LocalStatisticsUseCases implements StatisticsUseCases {
  private readonly database: ForgeDatabase
  private readonly localData: LocalDataService

  constructor(
    database: ForgeDatabase,
    localData: LocalDataService,
  ) {
    this.database = database
    this.localData = localData
  }

  async list(): Promise<StatisticsCache[]> {
    try {
      const caches = await this.database.statisticsCaches
        .orderBy('generatedAt')
        .reverse()
        .toArray()
      return caches.filter(isCurrentStatisticsCache)
    } catch (error) {
      throw toDataError(error)
    }
  }

  async save(cache: StatisticsCache): Promise<StatisticsCache> {
    try {
      await this.localData.saveStatisticsCache(cache)
      return cache
    } catch (error) {
      throw toDataError(error)
    }
  }

  async rebuild(
    range: StatisticsRange,
    generatedAt: string = nowIso(),
  ): Promise<StatisticsCache> {
    try {
      const history = await this.database.workoutSessions
        .where('status')
        .equals('completed')
        .filter((session) => !session.deletedAt && Boolean(session.endedAt))
        .toArray()
      const cache: StatisticsCache = {
        key: 'cached:rolling-8-weeks',
        scope: 'cached',
        rangeStart: range.start,
        rangeEnd: range.end,
        generatedAt,
        source: 'history',
        summary: calculateStatistics(range, history),
      }
      await this.localData.saveStatisticsCache(cache)
      return cache
    } catch (error) {
      throw toDataError(error)
    }
  }
}

class LocalDashboardUseCases implements DashboardUseCases {
  private readonly database: ForgeDatabase

  constructor(database: ForgeDatabase) {
    this.database = database
  }

  async load(range: DashboardRange): Promise<DashboardSnapshot> {
    try {
      const [plans, sessions, recentWorkout, statistics] = await Promise.all([
        this.database.trainingPlans
          .where('status')
          .equals('active')
          .filter((plan) => !plan.deletedAt)
          .toArray(),
        this.database.workoutSessions
          .filter((session) => {
            const localDate = session.scheduleOccurrenceKey.slice(-10)
            return (
              !session.deletedAt &&
              localDate >= range.start &&
              localDate <= range.end
            )
          })
          .toArray(),
        this.database.workoutSessions
          .orderBy('endedAt')
          .reverse()
          .filter(
            (session) =>
              !session.deletedAt &&
              session.status === 'completed' &&
              Boolean(session.endedAt),
          )
          .first(),
        this.database.statisticsCaches
          .orderBy('generatedAt')
          .reverse()
          .filter(
            (cache) =>
              cache.scope === 'cached' && isCurrentStatisticsCache(cache),
          )
          .first(),
      ])

      const activePlanIds = plans.map((plan) => plan.id)
      const planExercises = activePlanIds.length
        ? await this.database.planExercises
            .where('planId')
            .anyOf(activePlanIds)
            .filter((item) => !item.deletedAt)
            .toArray()
        : []
      const planExerciseCounts = new Map<string, number>()
      for (const item of planExercises) {
        planExerciseCounts.set(
          item.planId,
          (planExerciseCounts.get(item.planId) ?? 0) + 1,
        )
      }

      return {
        range,
        days: deriveDashboardSchedule({
          range,
          plans,
          sessions,
          planExerciseCounts,
        }),
        recentWorkout: recentWorkout ?? null,
        statistics: statistics ?? null,
      }
    } catch (error) {
      throw toDataError(error)
    }
  }
}

function isCurrentStatisticsCache(cache: StatisticsCache): boolean {
  const summary = cache.summary as Partial<StatisticsCache['summary']> | undefined
  return Boolean(
    summary &&
      typeof summary.workoutCount === 'number' &&
      typeof summary.weeklyWorkoutCount === 'number' &&
      typeof summary.monthlyWorkoutCount === 'number' &&
      typeof summary.streakDays === 'number' &&
      Array.isArray(summary.weeklyTrend) &&
      typeof summary.trainingVolumeKg === 'number' &&
      Array.isArray(summary.personalRecords),
  )
}

export interface ForgeDataUseCases {
  dashboard: DashboardUseCases
  plans: PlansUseCases
  workouts: WorkoutsUseCases
  history: HistoryUseCases
  statistics: StatisticsUseCases
  settings: SettingsUseCases
}

export function createForgeDataUseCases(
  database: ForgeDatabase,
  runtime: WorkoutRuntimeDependencies = {
    createId: createEntityId,
    now: nowIso,
  },
): ForgeDataUseCases {
  const localData = new LocalDataService(
    database,
    new SyncQueueRepository(database),
  )

  return {
    dashboard: new LocalDashboardUseCases(database),
    plans: new LocalPlansUseCases(
      database,
      new DexiePlansRepository(database),
      localData,
    ),
    workouts: new LocalWorkoutsUseCases(database, localData, runtime),
    history: new LocalHistoryUseCases(
      database,
      new DexieHistoryRepository(database),
    ),
    statistics: new LocalStatisticsUseCases(database, localData),
    settings: new LocalSettingsUseCases(database),
  }
}
