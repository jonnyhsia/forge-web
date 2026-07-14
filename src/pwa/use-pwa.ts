import { useSyncExternalStore } from 'react'
import { pwaRuntime } from './pwa-runtime'

export function usePwaSnapshot() {
  return useSyncExternalStore(
    pwaRuntime.subscribe,
    pwaRuntime.getSnapshot,
    pwaRuntime.getSnapshot,
  )
}
