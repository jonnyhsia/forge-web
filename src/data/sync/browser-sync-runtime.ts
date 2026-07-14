import type { SyncQueueItem } from '../../domain'
import { forgeDatabase } from '../database'
import { SyncCoordinator, type NetworkSyncStatus } from './sync-coordinator'
import { SyncEngine } from './sync-engine'
import {
  SyncQueueRepository,
  subscribeSyncQueueMutations,
} from './sync-queue'
import { SyncConflictResolver, SyncStateRepository } from './sync-state'
import { RestSyncTransport } from './sync-transport'

export type SyncMode = 'local' | 'remote'

export interface SyncRuntimeSnapshot {
  mode: SyncMode
  networkStatus: NetworkSyncStatus
}

type SyncRuntimeListener = (snapshot: SyncRuntimeSnapshot) => void

export class BrowserSyncRuntime {
  readonly mode: SyncMode
  private readonly queue = new SyncQueueRepository(forgeDatabase)
  private readonly conflicts = new SyncConflictResolver(forgeDatabase)
  private readonly coordinator: SyncCoordinator | null
  private readonly listeners = new Set<SyncRuntimeListener>()
  private networkStatus: NetworkSyncStatus = 'offline'

  constructor(endpoint?: string) {
    this.mode = endpoint ? 'remote' : 'local'
    if (!endpoint) {
      this.coordinator = null
      subscribeSyncQueueMutations(() => this.notify())
      return
    }
    const engine = new SyncEngine(
      new RestSyncTransport(endpoint),
      this.queue,
      new SyncStateRepository(forgeDatabase),
    )
    this.coordinator = new SyncCoordinator(engine, this.queue, {
      confirmConnectivity: async () =>
        typeof navigator === 'undefined' || navigator.onLine,
      onStatusChange: (status) => {
        this.networkStatus = status
        this.notify()
      },
      onQueueChange: () => this.notify(),
    })
    subscribeSyncQueueMutations(() => {
      this.notify()
      if (this.networkStatus === 'online') void this.coordinator?.runNow()
    })
  }

  start(online: boolean): void {
    this.networkStatus = online ? 'online' : 'offline'
    this.coordinator?.start(online)
    this.notify()
  }

  stop(): void {
    this.coordinator?.stop()
  }

  networkChanged(online: boolean): void {
    this.networkStatus = online
      ? this.coordinator
        ? 'recovering'
        : 'online'
      : 'offline'
    this.coordinator?.networkChanged(online)
    this.notify()
  }

  subscribe(listener: SyncRuntimeListener): () => void {
    this.listeners.add(listener)
    listener(this.snapshot())
    return () => this.listeners.delete(listener)
  }

  list(): Promise<SyncQueueItem[]> {
    return this.queue.listAll()
  }

  async retry(itemId: string): Promise<void> {
    await this.queue.retry(itemId)
    await this.runNow()
  }

  async acceptRemote(itemId: string): Promise<void> {
    await this.conflicts.acceptRemote(itemId)
    this.notify()
  }

  async keepLocal(itemId: string): Promise<void> {
    await this.conflicts.keepLocal(itemId)
    await this.runNow()
  }

  async runNow(): Promise<void> {
    await this.coordinator?.runNow()
    this.notify()
  }

  snapshot(): SyncRuntimeSnapshot {
    return { mode: this.mode, networkStatus: this.networkStatus }
  }

  private notify(): void {
    const snapshot = this.snapshot()
    for (const listener of this.listeners) listener(snapshot)
  }
}

const endpoint = import.meta.env.VITE_SYNC_ENDPOINT?.trim() || undefined
export const browserSyncRuntime = new BrowserSyncRuntime(endpoint)
