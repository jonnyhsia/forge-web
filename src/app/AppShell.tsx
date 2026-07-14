import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { resolveAppRoute, type NavigationSection } from '../router/route-model'
import { useForgeStore } from '../store'
import { Button, StatePanel } from '../ui/primitives'
import { Icon, type IconName } from '../ui/Icon'
import { PwaNotices } from '../pwa/PwaNotices'
import { resolveAppShellState } from './app-shell-state'
import './app-shell.css'

const navigation: Array<{
  section: NavigationSection
  label: string
  path: string
  icon: IconName
}> = [
  { section: 'dashboard', label: '首页', path: '/', icon: 'home' },
  { section: 'plans', label: '计划', path: '/plans', icon: 'plans' },
  { section: 'records', label: '记录', path: '/history', icon: 'records' },
  { section: 'settings', label: '我的', path: '/settings', icon: 'settings' },
]

export function AppShell() {
  const location = useLocation()
  const route = resolveAppRoute(location.pathname)
  const initialized = useForgeStore((state) => state.initialized)
  const initializationError = useForgeStore((state) => state.initializationError)
  const online = useForgeStore((state) => state.online)
  const networkStatus = useForgeStore((state) => state.networkStatus)
  const initialize = useForgeStore((state) => state.initialize)
  const state = resolveAppShellState({ initialized, initializationError, online })

  return (
    <div className={`app-frame app-frame--${route.shell}`}>
      {state.offline ? (
        <div className="offline-banner" role="status">
          <Icon name="cloud-off" size={15} />
          <span>离线模式 · 本地数据仍可使用</span>
        </div>
      ) : networkStatus === 'recovering' ? (
        <div className="offline-banner" role="status">
          <Icon name="refresh" size={15} />
          <span>网络已恢复 · 正在检查待同步更改</span>
        </div>
      ) : null}

      <PwaNotices showInstall={route.shell === 'standard' && state.content === 'ready'} />

      <main className="app-content">
        {state.content === 'loading' ? (
          <StatePanel kind="loading" title="正在准备 Forge" description="正在打开本地训练数据。" />
        ) : state.content === 'error' ? (
          <StatePanel
            action={<Button leadingIcon="refresh" onClick={() => void initialize()}>重试</Button>}
            description="无法打开本地训练数据，请重试。"
            kind="error"
            title="启动失败"
          />
        ) : (
          <Outlet />
        )}
      </main>

      {route.shell === 'standard' && state.content === 'ready' ? (
        <nav aria-label="主要导航" className="bottom-navigation">
          {navigation.map((item) => {
            const active = route.navigation === item.section
            return (
              <NavLink
                aria-current={active ? 'page' : undefined}
                className={`bottom-navigation__item ${active ? 'bottom-navigation__item--active' : ''}`}
                key={item.section}
                to={item.path}
              >
                <Icon name={item.icon} size={20} strokeWidth={active ? 2.2 : 1.6} />
                <span>{item.label}</span>
              </NavLink>
            )
          })}
        </nav>
      ) : null}
    </div>
  )
}
