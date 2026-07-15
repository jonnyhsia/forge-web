import { useEffect } from 'react'
import { dashboardWeekRange } from '../../domain'
import { useForgeStore } from '../../store'

export function useWeeklyDashboard(focusDate = new Date()) {
  const dashboard = useForgeStore((state) => state.dashboard)
  const loadDashboard = useForgeStore((state) => state.loadDashboard)
  const range = dashboardWeekRange(focusDate)

  useEffect(() => {
    void loadDashboard({
      start: range.start,
      end: range.end,
      today: range.today,
    })
  }, [loadDashboard, range.end, range.start, range.today])

  return { dashboard, range }
}
