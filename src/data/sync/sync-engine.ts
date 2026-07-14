import type { SyncQueueItem, SyncTransport } from '../../domain/sync'
import { SyncQueueRepository, syncQueueRepository } from './sync-queue'
import { SyncStateRepository, syncStateRepository } from './sync-state'

const BASE_RETRY_DELAY_MS = 1_000
const MAX_RETRY_DELAY_MS = 5 * 60_000

export function retryDelay(attempts: number): number {
  return Math.min(
    BASE_RETRY_DELAY_MS * 2 ** Math.max(0, attempts - 1),
    MAX_RETRY_DELAY_MS,
  )
}

function nextRetryAt(attempts: number, now: () => number): string {
  const delay = Math.min(
    BASE_RETRY_DELAY_MS * 2 ** Math.max(0, attempts - 1),
    MAX_RETRY_DELAY_MS,
  )

  return new Date(now() + delay).toISOString()
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown sync error'
}

export class SyncEngine {
  private readonly transport: SyncTransport
  private readonly queue: SyncQueueRepository
  private readonly state: SyncStateRepository
  private readonly now: () => number

  constructor(
    transport: SyncTransport,
    queue: SyncQueueRepository = syncQueueRepository,
    state: SyncStateRepository = syncStateRepository,
    now: () => number = Date.now,
  ) {
    this.transport = transport
    this.queue = queue
    this.state = state
    this.now = now
  }

  async processReady(): Promise<void> {
    const items = await this.queue.listReady(new Date(this.now()).toISOString())

    for (const item of items) {
      await this.processItem(item)
    }
  }

  private async processItem(item: SyncQueueItem): Promise<void> {
    const processingAt = new Date(this.now()).toISOString()
    await this.queue.put({
      ...item,
      status: 'processing',
      updatedAt: processingAt,
    })
    await this.state.markProcessing(item)

    try {
      const result = await this.transport.push(item)

      if (result.status === 'conflict') {
        const latest = (await this.queue.get(item.id)) ?? item
        await this.state.markConflict(latest, result.conflict)
        await this.queue.put({
          ...latest,
          status: 'conflict',
          updatedAt: new Date(this.now()).toISOString(),
          lastError: result.conflict.reason,
          conflict: result.conflict,
        })
        return
      }

      if (result.status === 'success') {
        const latest = await this.queue.get(item.id)
        if (
          latest &&
          (latest.idempotencyKey !== item.idempotencyKey ||
            latest.clientUpdatedAt !== item.clientUpdatedAt)
        ) {
          const updatedAt = new Date(this.now()).toISOString()
          await this.queue.put({
            ...latest,
            baseRemoteVersion: result.value.remoteVersion,
            status: 'pending',
            nextAttemptAt: updatedAt,
            updatedAt,
          })
          return
        }
        await this.state.markSynced(item, result.value)
        await this.queue.remove(item.id)
        return
      }

      if (result.status === 'permanent-failure') {
        await this.fail(item, result.error, false)
        return
      }

      await this.fail(item, result.error, true)
    } catch (error) {
      await this.fail(item, errorMessage(error), true)
    }
  }

  private async fail(item: SyncQueueItem, error: string, retryable: boolean) {
    const latest = (await this.queue.get(item.id)) ?? item
    const attempts = latest.attempts + 1
    const updatedAt = new Date(this.now()).toISOString()
    await this.state.markFailed(latest, error)
    await this.queue.put({
      ...latest,
      status: 'failed',
      attempts,
      nextAttemptAt: retryable
        ? nextRetryAt(attempts, this.now)
        : '9999-12-31T23:59:59.999Z',
      updatedAt,
      lastError: error,
    })
  }
}
