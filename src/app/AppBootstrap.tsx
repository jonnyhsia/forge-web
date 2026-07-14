import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { startNetworkMonitor, useForgeStore } from '../store'

export function AppBootstrap() {
  const initialize = useForgeStore((state) => state.initialize)

  useEffect(() => {
    void initialize()
    return startNetworkMonitor()
  }, [initialize])

  return <Outlet />
}
