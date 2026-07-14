import { useForgeStore } from './forge-store'
import { browserSyncRuntime } from '../data'

export function startNetworkMonitor(): () => void {
  const update = () => {
    browserSyncRuntime.networkChanged(navigator.onLine)
  }

  browserSyncRuntime.start(navigator.onLine)
  const unsubscribe = browserSyncRuntime.subscribe((snapshot) => {
    const store = useForgeStore.getState()
    store.setNetworkStatus(snapshot.networkStatus)
    void store.loadSyncQueue()
  })
  window.addEventListener('online', update)
  window.addEventListener('offline', update)

  return () => {
    unsubscribe()
    browserSyncRuntime.stop()
    window.removeEventListener('online', update)
    window.removeEventListener('offline', update)
  }
}
