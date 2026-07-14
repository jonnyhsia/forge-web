import type { AppSettings } from '../domain'

export type NotificationPermissionState =
  AppSettings['notificationPermission']

export type NotificationUnavailableReason =
  | 'api_unavailable'
  | 'ios_requires_install'

export interface NotificationCapability {
  permission: NotificationPermissionState
  reason: NotificationUnavailableReason | null
}

export interface ReminderMessage {
  kind: 'training' | 'exercise' | 'rest'
  title: string
  body: string
}

export interface ReminderDelivery {
  inAppMessage: string
  systemNotificationSent: boolean
}

export interface SystemNotificationAdapter {
  inspect(): NotificationCapability
  requestPermission(): Promise<NotificationPermissionState>
  show(message: ReminderMessage): boolean
}

export interface ReminderService {
  inspect(): NotificationCapability
  requestPermission(): Promise<NotificationPermissionState>
  deliver(message: ReminderMessage): ReminderDelivery
}

export function createReminderService(
  notifications: SystemNotificationAdapter,
): ReminderService {
  return {
    inspect: () => notifications.inspect(),

    requestPermission() {
      const capability = notifications.inspect()
      if (capability.permission === 'unsupported') {
        return Promise.resolve('unsupported')
      }
      if (capability.permission !== 'not_requested') {
        return Promise.resolve(capability.permission)
      }
      return notifications.requestPermission()
    },

    deliver(message) {
      const systemNotificationSent =
        notifications.inspect().permission === 'granted'
          ? notifications.show(message)
          : false
      return {
        inAppMessage: message.body,
        systemNotificationSent,
      }
    },
  }
}
