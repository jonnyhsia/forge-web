import type {
  BaseEntity,
  EntityId,
  IsoDateTime,
  SyncMetadata,
} from './entities'

export function createEntityId(): EntityId {
  return crypto.randomUUID()
}

export function nowIso(): IsoDateTime {
  return new Date().toISOString()
}

export function createLocalSyncMetadata(): SyncMetadata {
  return { status: 'local' }
}

export function createEntityMetadata(
  timestamp: IsoDateTime = nowIso(),
): Pick<BaseEntity, 'id' | 'createdAt' | 'updatedAt' | 'sync'> {
  return {
    id: createEntityId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    sync: createLocalSyncMetadata(),
  }
}
