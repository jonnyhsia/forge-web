export const ROUTE_PATHS = {
  dashboard: '/',
  plans: '/plans',
  planCreate: '/plans/new',
  planDetail: '/plans/:planId',
  trainingStart: '/training/start',
  trainingSession: '/training/:sessionId',
  history: '/history',
  historyDetail: '/history/:sessionId',
  statistics: '/statistics',
  settings: '/settings',
} as const
