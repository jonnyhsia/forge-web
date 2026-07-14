export type TestNetworkStatus = 'online' | 'offline' | 'recovering'
export type NetworkStateListener = (status: TestNetworkStatus) => void

export class NetworkStateStub {
  private listeners = new Set<NetworkStateListener>()
  private status: TestNetworkStatus

  constructor(status: TestNetworkStatus = 'online') {
    this.status = status
  }

  current(): TestNetworkStatus {
    return this.status
  }

  isOnline(): boolean {
    return this.status === 'online'
  }

  set(status: TestNetworkStatus): void {
    if (status === this.status) return

    this.status = status
    for (const listener of this.listeners) listener(status)
  }

  subscribe(listener: NetworkStateListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}
