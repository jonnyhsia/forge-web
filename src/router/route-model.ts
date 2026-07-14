export type AppPage =
  | 'dashboard'
  | 'plans'
  | 'plan-create'
  | 'plan-detail'
  | 'training-start'
  | 'training-session'
  | 'history'
  | 'history-detail'
  | 'statistics'
  | 'settings'
  | 'not-found'

export type NavigationSection = 'dashboard' | 'plans' | 'records' | 'settings'
export type AppShellKind = 'standard' | 'focused'

export interface AppRouteMatch {
  page: AppPage
  navigation: NavigationSection | null
  shell: AppShellKind
}

const focused = (page: AppPage): AppRouteMatch => ({
  page,
  navigation: null,
  shell: 'focused',
})

const standard = (
  page: AppPage,
  navigation: NavigationSection,
): AppRouteMatch => ({ page, navigation, shell: 'standard' })

export function resolveAppRoute(pathname: string): AppRouteMatch {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname

  if (path === '/') return standard('dashboard', 'dashboard')
  if (path === '/plans') return standard('plans', 'plans')
  if (path === '/plans/new') return focused('plan-create')
  if (/^\/plans\/[^/]+$/.test(path)) return focused('plan-detail')
  if (path === '/training/start') return focused('training-start')
  if (/^\/training\/[^/]+$/.test(path)) return focused('training-session')
  if (path === '/history') return standard('history', 'records')
  if (/^\/history\/[^/]+$/.test(path)) return focused('history-detail')
  if (path === '/statistics') return standard('statistics', 'records')
  if (path === '/settings') return standard('settings', 'settings')

  return focused('not-found')
}
