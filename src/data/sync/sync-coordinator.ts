import { SyncEngine } from './sync-engine'
import { SyncQueueRepository } from './sync-queue'

export type NetworkSyncStatus = 'online' | 'offline' | 'recovering'

export interface SyncCoordinatorRuntime {
  now(): number
  setTimeout(callback: () => void, delayMilliseconds: number): number
  clearTimeout(id: number): void
}

export interface SyncCoordinatorOptions {
  confirmConnectivity(): Promise<boolean>
  onStatusChange?(status: NetworkSyncStatus): void
  onQueueChange?(): void | Promise<void>
  runtime?: SyncCoordinatorRuntime
}

const browserRuntime: SyncCoordinatorRuntime = {
  now: () => Date.now(),
  setTimeout: (callback, delay) =>
    globalThis.setTimeout(callback, delay) as unknown as number,
  clearTimeout: (id) => globalThis.clearTimeout(id),
}

export class SyncCoordinator {
  private readonly engine: SyncEngine
  private readonly queue: SyncQueueRepository
  private readonly options: SyncCoordinatorOptions
  private readonly runtime: SyncCoordinatorRuntime
  private status: NetworkSyncStatus = 'offline'
  private timer: number | null = null
  private running: Promise<void> | null = null

  constructor(
    engine: SyncEngine,
    queue: SyncQueueRepository,
    options: SyncCoordinatorOptions,
  ) {
    this.engine = engine
    this.queue = queue
    this.options = options
    this.runtime = options.runtime ?? browserRuntime
  }

  start(online: boolean): void {
    this.changeNetwork(online, false)
  }

  stop(): void {
    this.cancelTimer()
  }

  networkChanged(online: boolean): void {
    this.changeNetwork(online, online)
  }

  runNow(): Promise<void> {
    if (this.status === 'offline') return Promise.resolve()
    this.cancelTimer()
    return this.process()
  }

  private changeNetwork(online: boolean, recovering: boolean): void {
    this.cancelTimer()
    if (!online) {
      this.setStatus('offline')
      return
    }
    this.setStatus(recovering ? 'recovering' : 'online')
    this.schedule(0)
  }

  private schedule(delay: number): void {
    this.cancelTimer()
    this.timer = this.runtime.setTimeout(() => {
      this.timer = null
      void this.process()
    }, Math.max(0, delay))
  }

  private process(): Promise<void> {
    if (this.running) return this.running
    this.running = this.processOnce().finally(() => {
      this.running = null
    })
    return this.running
  }

  private async processOnce(): Promise<void> {
    if (this.status === 'offline') return
    if (this.status === 'recovering') {
      const connected = await this.options.confirmConnectivity()
      if (!connected) {
        this.schedule(10_000)
        return
      }
      this.setStatus('online')
    }

    await this.engine.processReady()
    await this.options.onQueueChange?.()
    const nextAttemptAt = await this.queue.nextAttemptAt()
    if (!nextAttemptAt) return
    const delay = Date.parse(nextAttemptAt) - this.runtime.now()
    if (delay <= 2_147_483_647) this.schedule(delay)
  }

  private setStatus(status: NetworkSyncStatus): void {
    this.status = status
    this.options.onStatusChange?.(status)
  }

  private cancelTimer(): void {
    if (this.timer === null) return
    this.runtime.clearTimeout(this.timer)
    this.timer = null
  }
}
