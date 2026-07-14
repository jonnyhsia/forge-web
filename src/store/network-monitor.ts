import { useForgeStore } from './forge-store'

export function startNetworkMonitor(): () => void {
  const update = () => {
    useForgeStore.getState().setOnline(navigator.onLine)
  }

  update()
  window.addEventListener('online', update)
  window.addEventListener('offline', update)

  return () => {
    window.removeEventListener('online', update)
    window.removeEventListener('offline', update)
  }
}
