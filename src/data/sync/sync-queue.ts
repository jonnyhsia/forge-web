import { forgeDatabase, type ForgeDatabase } from '../database'
import { createEntityId, nowIso } from '../../domain/factories'
import type {
  SyncEntityType,
  SyncOperationType,
  SyncQueueItem,
} from '../../domain/sync'

type SyncQueueMutationListener = () => void
const mutationListeners = new Set<SyncQueueMutationListener>()

export function subscribeSyncQueueMutations(
  listener: SyncQueueMutationListener,
): () => void {
  mutationListeners.add(listener)
  return () => mutationListeners.delete(listener)
}

function notifyMutation(): void {
  globalThis.setTimeout(() => {
    for (const listener of mutationListeners) listener()
  }, 0)
}

export interface EnqueueSyncInput {
  entityType: SyncEntityType
  entityId: string
  operation: SyncOperationType
  payload?: unknown
  priority: number
  idempotencyKey?: string
  dedupeKey?: string
  baseRemoteVersion?: number
  clientUpdatedAt?: string
}

function createDedupeKey(input: EnqueueSyncInput): string {
  return (
    input.dedupeKey ??
    `${input.entityType}:${input.entityId}:${input.operation}`
  )
}

export function createSyncQueueItem(input: EnqueueSyncInput): SyncQueueItem {
  const timestamp = nowIso()

  return {
    id: createEntityId(),
    entityType: input.entityType,
    entityId: input.entityId,
    operation: input.operation,
    payload: input.payload,
    idempotencyKey: input.idempotencyKey ?? createEntityId(),
    dedupeKey: createDedupeKey(input),
    priority: input.priority,
    status: 'pending',
    attempts: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    nextAttemptAt: timestamp,
    baseRemoteVersion: input.baseRemoteVersion,
    clientUpdatedAt: input.clientUpdatedAt ?? timestamp,
  }
}

export class SyncQueueRepository {
  private readonly database: ForgeDatabase

  constructor(database: ForgeDatabase = forgeDatabase) {
    this.database = database
  }

  async putLatest(item: SyncQueueItem): Promise<void> {
    let existing = await this.database.syncQueue
      .where('dedupeKey')
      .equals(item.dedupeKey)
      .first()
    const legacyDedupeKey = `${item.entityType}:${item.entityId}`
    if (
      !existing &&
      item.dedupeKey === `${legacyDedupeKey}:${item.operation}`
    ) {
      existing = await this.database.syncQueue
        .where('dedupeKey')
        .equals(legacyDedupeKey)
        .first()
    }

    if (existing) {
      await this.database.syncQueue.put({
        ...item,
        id: existing.id,
        createdAt: existing.createdAt,
      })
      notifyMutation()
      return
    }

    await this.database.syncQueue.put(item)
    notifyMutation()
  }

  countPending(): Promise<number> {
    return this.database.syncQueue
      .where('status')
      .anyOf(['pending', 'processing', 'failed', 'conflict'])
      .count()
  }

  listAll(): Promise<SyncQueueItem[]> {
    return this.database.syncQueue
      .toArray()
      .then((items) =>
        items.sort(
          (left, right) =>
            right.priority - left.priority ||
            left.createdAt.localeCompare(right.createdAt),
        ),
      )
  }

  get(id: string): Promise<SyncQueueItem | undefined> {
    return this.database.syncQueue.get(id)
  }

  async listReady(at = nowIso()): Promise<SyncQueueItem[]> {
    const pending = await this.database.syncQueue
      .where('status')
      .anyOf(['pending', 'failed'])
      .toArray()

    return pending
      .filter((item) => item.nextAttemptAt <= at)
      .sort(
        (left, right) =>
          right.priority - left.priority ||
          left.createdAt.localeCompare(right.createdAt),
      )
  }

  remove(id: string): Promise<void> {
    return this.database.syncQueue.delete(id)
  }

  put(item: SyncQueueItem): Promise<string> {
    return this.database.syncQueue.put(item)
  }

  async retry(id: string, at = nowIso()): Promise<void> {
    const item = await this.get(id)
    if (!item || item.status === 'processing') return
    await this.put({
      ...item,
      status: 'pending',
      nextAttemptAt: at,
      updatedAt: at,
      lastError: undefined,
    })
  }

  async nextAttemptAt(): Promise<string | null> {
    const candidates = await this.database.syncQueue
      .where('status')
      .anyOf(['pending', 'failed'])
      .toArray()
    return candidates.reduce<string | null>(
      (earliest, item) =>
        earliest === null || item.nextAttemptAt < earliest
          ? item.nextAttemptAt
          : earliest,
      null,
    )
  }
}

export const syncQueueRepository = new SyncQueueRepository()
