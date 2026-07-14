import type { ForgeDatabase } from '../database'
import type {
  PlanCategory,
  PlanStatus,
  TrainingPlan,
  WorkoutSession,
} from '../../domain'
import {
  decodeCursor,
  encodeCursor,
  isBeforeCursor,
  type Page,
  type PageRequest,
} from '../pagination'

const DEFAULT_PAGE_LIMIT = 20
const MAX_PAGE_LIMIT = 100

export interface PlansFilter {
  statuses?: PlanStatus[]
  category?: PlanCategory
  includeDeleted?: boolean
}

export interface PlansRepository {
  listPage(request?: PageRequest<PlansFilter>): Promise<Page<TrainingPlan>>
}

export interface HistoryRepository {
  listPage(request?: PageRequest): Promise<Page<WorkoutSession>>
}

function pageLimit(limit: number | undefined): number {
  return Math.min(Math.max(limit ?? DEFAULT_PAGE_LIMIT, 1), MAX_PAGE_LIMIT)
}

export class DexiePlansRepository implements PlansRepository {
  private readonly database: ForgeDatabase

  constructor(database: ForgeDatabase) {
    this.database = database
  }

  async listPage(
    request: PageRequest<PlansFilter> = {},
  ): Promise<Page<TrainingPlan>> {
    const limit = pageLimit(request.limit)
    const filter = request.filter
    const statuses = filter?.statuses ?? ['draft', 'active']
    const cursor = request.cursor ? decodeCursor(request.cursor) : undefined

    const collection = this.database.trainingPlans
      .orderBy('updatedAt')
      .reverse()
      .filter(
        (plan) =>
          (filter?.includeDeleted || !plan.deletedAt) &&
          statuses.includes(plan.status) &&
          (!filter?.category || plan.category === filter.category) &&
          (!cursor || isBeforeCursor(plan.updatedAt, plan.id, cursor)),
      )
      .limit(limit + 1)
    const matches = await collection.toArray()
    matches.sort(
      (left, right) =>
        right.updatedAt.localeCompare(left.updatedAt) ||
        right.id.localeCompare(left.id),
    )
    const items = matches.slice(0, limit)
    const lastItem = items.at(-1)

    return {
      items,
      nextCursor:
        matches.length > limit && lastItem
          ? encodeCursor({ sortValue: lastItem.updatedAt, id: lastItem.id })
          : null,
    }
  }
}

export class DexieHistoryRepository implements HistoryRepository {
  private readonly database: ForgeDatabase

  constructor(database: ForgeDatabase) {
    this.database = database
  }

  async listPage(
    request: PageRequest = {},
  ): Promise<Page<WorkoutSession>> {
    const limit = pageLimit(request.limit)
    const cursor = request.cursor ? decodeCursor(request.cursor) : undefined
    const collection = this.database.workoutSessions
      .orderBy('endedAt')
      .reverse()
      .filter(
        (session) =>
          session.status === 'completed' &&
          !session.deletedAt &&
          typeof session.endedAt === 'string' &&
          (!cursor || isBeforeCursor(session.endedAt, session.id, cursor)),
      )
      .limit(limit + 1)
    const matches = await collection.toArray()
    matches.sort(
      (left, right) =>
        right.endedAt!.localeCompare(left.endedAt!) ||
        right.id.localeCompare(left.id),
    )
    const items = matches.slice(0, limit)
    const lastItem = items.at(-1)

    return {
      items,
      nextCursor:
        matches.length > limit && lastItem?.endedAt
          ? encodeCursor({ sortValue: lastItem.endedAt, id: lastItem.id })
          : null,
    }
  }
}
