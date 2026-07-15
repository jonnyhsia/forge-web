import type {
  BaseEntity,
  EntityId,
  IsoDateTime,
  SyncMetadata,
} from './entities'

export function createEntityId(): EntityId {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }

  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80

  const value = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`
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
