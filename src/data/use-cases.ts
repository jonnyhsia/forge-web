import {
  nowIso,
  type AppSettings,
  type EntityId,
  type Exercise,
  type PlanExercise,
  type StatisticsCache,
  type TrainingPlan,
  type WorkoutSession,
} from '../domain'
import { DEFAULT_APP_SETTINGS, type ForgeDatabase } from './database'
import { DataError, toDataError } from './errors'
import { LocalDataService } from './local-data-service'
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
  save(session: WorkoutSession): Promise<WorkoutSession>
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

  constructor(
    database: ForgeDatabase,
    localData: LocalDataService,
  ) {
    this.database = database
    this.localData = localData
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

  async save(session: WorkoutSession): Promise<WorkoutSession> {
    try {
      return await this.localData.saveWorkoutSession(session)
    } catch (error) {
      throw toDataError(error)
    }
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

  constructor(database: ForgeDatabase) {
    this.database = database
  }

  async list(): Promise<StatisticsCache[]> {
    try {
      return await this.database.statisticsCaches
        .orderBy('generatedAt')
        .reverse()
        .toArray()
    } catch (error) {
      throw toDataError(error)
    }
  }

  async save(cache: StatisticsCache): Promise<StatisticsCache> {
    try {
      await this.database.statisticsCaches.put(cache)
      return cache
    } catch (error) {
      throw toDataError(error)
    }
  }
}

export interface ForgeDataUseCases {
  plans: PlansUseCases
  workouts: WorkoutsUseCases
  history: HistoryUseCases
  statistics: StatisticsUseCases
  settings: SettingsUseCases
}

export function createForgeDataUseCases(
  database: ForgeDatabase,
): ForgeDataUseCases {
  const localData = new LocalDataService(
    database,
    new SyncQueueRepository(database),
  )

  return {
    plans: new LocalPlansUseCases(
      database,
      new DexiePlansRepository(database),
      localData,
    ),
    workouts: new LocalWorkoutsUseCases(database, localData),
    history: new LocalHistoryUseCases(
      database,
      new DexieHistoryRepository(database),
    ),
    statistics: new LocalStatisticsUseCases(database),
    settings: new LocalSettingsUseCases(database),
  }
}
