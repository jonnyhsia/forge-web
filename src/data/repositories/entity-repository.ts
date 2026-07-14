import type { EntityTable } from 'dexie'
import type { BaseEntity, EntityId } from '../../domain/entities'

export interface ListEntitiesOptions {
  includeDeleted?: boolean
}

export interface ListEntitiesPageOptions extends ListEntitiesOptions {
  offset?: number
  limit?: number
}

export interface EntityPage<TEntity> {
  items: TEntity[]
  nextOffset: number | null
}

export class EntityRepository<TEntity extends BaseEntity> {
  constructor(private readonly table: EntityTable<TEntity, 'id'>) {}

  getById(id: EntityId): Promise<TEntity | undefined> {
    return this.table.get(id)
  }

  async list(options: ListEntitiesOptions = {}): Promise<TEntity[]> {
    const entities = await this.table.toArray()
    const visibleEntities = options.includeDeleted
      ? entities
      : entities.filter((entity) => !entity.deletedAt)

    return visibleEntities.sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
    )
  }

  async listPage(
    options: ListEntitiesPageOptions = {},
  ): Promise<EntityPage<TEntity>> {
    const offset = options.offset ?? 0
    const limit = options.limit ?? 20
    const collection = this.table.orderBy('updatedAt').reverse()
    const visibleCollection = options.includeDeleted
      ? collection
      : collection.filter((entity) => !entity.deletedAt)
    const entities = await visibleCollection.offset(offset).limit(limit + 1).toArray()
    const hasMore = entities.length > limit

    return {
      items: entities.slice(0, limit),
      nextOffset: hasMore ? offset + limit : null,
    }
  }

  put(entity: TEntity): Promise<string> {
    return this.table.put(entity)
  }

  bulkPut(entities: TEntity[]): Promise<string> {
    return this.table.bulkPut(entities)
  }
}
