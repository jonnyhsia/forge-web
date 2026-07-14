import { createBrowserRouter } from 'react-router-dom'
import { AppBootstrap } from '../app/AppBootstrap'
import { EmptyRoute } from './route-placeholders'
import { ROUTE_PATHS } from './route-paths'

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '') || '/'

export const router = createBrowserRouter(
  [
    {
      path: '/',
      Component: AppBootstrap,
      ErrorBoundary: EmptyRoute,
      children: [
        { index: true, Component: EmptyRoute },
        { path: ROUTE_PATHS.plans, Component: EmptyRoute },
        { path: ROUTE_PATHS.planCreate, Component: EmptyRoute },
        { path: ROUTE_PATHS.planDetail, Component: EmptyRoute },
        { path: ROUTE_PATHS.trainingStart, Component: EmptyRoute },
        { path: ROUTE_PATHS.trainingSession, Component: EmptyRoute },
        { path: ROUTE_PATHS.history, Component: EmptyRoute },
        { path: ROUTE_PATHS.historyDetail, Component: EmptyRoute },
        { path: ROUTE_PATHS.statistics, Component: EmptyRoute },
        { path: ROUTE_PATHS.settings, Component: EmptyRoute },
      ],
    },
  ],
  { basename: basePath },
)
