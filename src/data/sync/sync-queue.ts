import { forgeDatabase } from '../database'
import { createEntityId, nowIso } from '../../domain/factories'
import type {
  SyncEntityType,
  SyncOperationType,
  SyncQueueItem,
} from '../../domain/sync'

export interface EnqueueSyncInput {
  entityType: SyncEntityType
  entityId: string
  operation: SyncOperationType
  payload?: unknown
  priority: number
  idempotencyKey?: string
}

function createDedupeKey(input: EnqueueSyncInput): string {
  return `${input.entityType}:${input.entityId}`
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
  }
}

export class SyncQueueRepository {
  async putLatest(item: SyncQueueItem): Promise<void> {
    const existing = await forgeDatabase.syncQueue
      .where('dedupeKey')
      .equals(item.dedupeKey)
      .first()

    if (existing) {
      await forgeDatabase.syncQueue.put({
        ...item,
        id: existing.id,
        createdAt: existing.createdAt,
      })
      return
    }

    await forgeDatabase.syncQueue.put(item)
  }

  countPending(): Promise<number> {
    return forgeDatabase.syncQueue
      .where('status')
      .anyOf(['pending', 'processing', 'failed', 'conflict'])
      .count()
  }

  async listReady(at = nowIso()): Promise<SyncQueueItem[]> {
    const pending = await forgeDatabase.syncQueue
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
    return forgeDatabase.syncQueue.delete(id)
  }

  put(item: SyncQueueItem): Promise<string> {
    return forgeDatabase.syncQueue.put(item)
  }
}

export const syncQueueRepository = new SyncQueueRepository()
