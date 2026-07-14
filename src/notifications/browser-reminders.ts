import { createBrowserSystemNotificationAdapter } from './browser-notification-adapter'
import { createReminderScheduler } from './reminder-scheduler'
import { createReminderService } from './reminder-service'

export const browserReminderService = createReminderService(
  createBrowserSystemNotificationAdapter(),
)

export const browserReminderScheduler = createReminderScheduler()
