import { nowIso } from '../../domain/factories'
import type { SyncQueueItem, SyncTransport } from '../../domain/sync'
import { syncQueueRepository } from './sync-queue'
import { syncStateRepository } from './sync-state'

const BASE_RETRY_DELAY_MS = 1_000
const MAX_RETRY_DELAY_MS = 5 * 60_000

function nextRetryAt(attempts: number): string {
  const delay = Math.min(
    BASE_RETRY_DELAY_MS * 2 ** Math.max(0, attempts - 1),
    MAX_RETRY_DELAY_MS,
  )

  return new Date(Date.now() + delay).toISOString()
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown sync error'
}

export class SyncEngine {
  private readonly transport: SyncTransport

  constructor(transport: SyncTransport) {
    this.transport = transport
  }

  async processReady(): Promise<void> {
    const items = await syncQueueRepository.listReady()

    for (const item of items) {
      await this.processItem(item)
    }
  }

  private async processItem(item: SyncQueueItem): Promise<void> {
    await syncQueueRepository.put({
      ...item,
      status: 'processing',
      updatedAt: nowIso(),
    })

    try {
      const result = await this.transport.push(item)

      if (result.status === 'conflict') {
        await syncStateRepository.markConflict(item, result.conflict)
        await syncQueueRepository.put({
          ...item,
          status: 'conflict',
          updatedAt: nowIso(),
          lastError: result.conflict.reason,
        })
        return
      }

      await syncStateRepository.markSynced(item, result.value)
      await syncQueueRepository.remove(item.id)
    } catch (error) {
      const attempts = item.attempts + 1
      await syncQueueRepository.put({
        ...item,
        status: 'failed',
        attempts,
        nextAttemptAt: nextRetryAt(attempts),
        updatedAt: nowIso(),
        lastError: errorMessage(error),
      })
    }
  }
}
