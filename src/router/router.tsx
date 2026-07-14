import { createBrowserRouter } from 'react-router-dom'
import { AppBootstrap } from '../app/AppBootstrap'
import {
  DashboardPage,
  HistoryDetailPage,
  HistoryPage,
  NotFoundPage,
  PlanCreatePage,
  PlanDetailPage,
  PlansPage,
  RouteErrorPage,
  SettingsPage,
  StatisticsPage,
  TrainingSessionPage,
  TrainingStartPage,
} from '../pages/ShellPages'
import { ROUTE_PATHS } from './route-paths'

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '') || '/'

export const router = createBrowserRouter(
  [
    {
      path: '/',
      Component: AppBootstrap,
      ErrorBoundary: RouteErrorPage,
      children: [
        { index: true, Component: DashboardPage },
        { path: ROUTE_PATHS.plans, Component: PlansPage },
        { path: ROUTE_PATHS.planCreate, Component: PlanCreatePage },
        { path: ROUTE_PATHS.planDetail, Component: PlanDetailPage },
        { path: ROUTE_PATHS.trainingStart, Component: TrainingStartPage },
        { path: ROUTE_PATHS.trainingSession, Component: TrainingSessionPage },
        { path: ROUTE_PATHS.history, Component: HistoryPage },
        { path: ROUTE_PATHS.historyDetail, Component: HistoryDetailPage },
        { path: ROUTE_PATHS.statistics, Component: StatisticsPage },
        { path: ROUTE_PATHS.settings, Component: SettingsPage },
        { path: '*', Component: NotFoundPage },
      ],
    },
  ],
  { basename: basePath },
)
