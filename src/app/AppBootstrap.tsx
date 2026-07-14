import { useEffect } from 'react'
import { startNetworkMonitor, useForgeStore } from '../store'
import { AppShell } from './AppShell'

export function AppBootstrap() {
  const initialize = useForgeStore((state) => state.initialize)

  useEffect(() => {
    void initialize()
    return startNetworkMonitor()
  }, [initialize])

  return <AppShell />
}
