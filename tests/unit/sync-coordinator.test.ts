import { describe, expect, it, vi } from 'vitest'
import {
  ForgeDatabase,
  MockSyncTransport,
  SyncCoordinator,
  SyncEngine,
  SyncQueueRepository,
  SyncStateRepository,
  createSyncQueueItem,
  type SyncCoordinatorRuntime,
} from '../../src/data'

class CoordinatorRuntime implements SyncCoordinatorRuntime {
  callback: (() => void) | null = null
  delay: number | null = null

  now() {
    return Date.parse('2026-07-14T08:00:00.000Z')
  }

  setTimeout(callback: () => void, delay: number) {
    this.callback = callback
    this.delay = delay
    return 1
  }

  clearTimeout() {
    this.callback = null
    this.delay = null
  }

  fire() {
    const callback = this.callback
    this.callback = null
    this.delay = null
    callback?.()
  }
}

describe('网络恢复同步调度', () => {
  it('恢复网络后先确认连通性，并在 10 秒门槛内发起队列处理', async () => {
    const db = new ForgeDatabase('forge-t13-coordinator')
    const queue = new SyncQueueRepository(db)
    const transport = new MockSyncTransport()
    const item = {
      ...createSyncQueueItem({ entityType: 'statistics', entityId: 'stats', operation: 'upsert', priority: 100 }),
      nextAttemptAt: '2026-07-14T08:00:00.000Z',
    }
    await queue.put(item)
    const confirmConnectivity = vi.fn(async () => true)
    const statuses: string[] = []
    const runtime = new CoordinatorRuntime()
    const coordinator = new SyncCoordinator(
      new SyncEngine(transport, queue, new SyncStateRepository(db), () => runtime.now()),
      queue,
      {
        confirmConnectivity,
        onStatusChange: (status) => statuses.push(status),
        runtime,
      },
    )

    coordinator.start(false)
    coordinator.networkChanged(true)
    expect(runtime.delay).toBeLessThanOrEqual(10_000)
    runtime.fire()
    await coordinator.runNow()

    expect(confirmConnectivity).toHaveBeenCalledTimes(1)
    expect(transport.pushed).toHaveLength(1)
    expect(statuses).toEqual(['offline', 'recovering', 'online'])
    db.close()
  })

  it('离线时取消调度且不发送', async () => {
    const db = new ForgeDatabase('forge-t13-offline')
    const queue = new SyncQueueRepository(db)
    const transport = new MockSyncTransport()
    await queue.put(createSyncQueueItem({ entityType: 'statistics', entityId: 'stats', operation: 'upsert', priority: 100 }))
    const runtime = new CoordinatorRuntime()
    const coordinator = new SyncCoordinator(
      new SyncEngine(transport, queue, new SyncStateRepository(db)),
      queue,
      { confirmConnectivity: async () => true, runtime },
    )

    coordinator.start(true)
    coordinator.networkChanged(false)

    expect(runtime.callback).toBeNull()
    expect(transport.pushed).toHaveLength(0)
    db.close()
  })
})
