import type {
  NotificationCapability,
  NotificationPermissionState,
  ReminderMessage,
  SystemNotificationAdapter,
} from './reminder-service'

export interface BrowserNotificationApi {
  permission(): NotificationPermission
  requestPermission(): Promise<NotificationPermission>
  show(message: ReminderMessage): void
}

export interface BrowserNotificationEnvironment {
  isIos: boolean
  isStandalone: boolean
  notifications?: BrowserNotificationApi
}

function permissionState(
  permission: NotificationPermission,
): NotificationPermissionState {
  return permission === 'default' ? 'not_requested' : permission
}

function capability(
  environment: BrowserNotificationEnvironment,
): NotificationCapability {
  if (environment.isIos && !environment.isStandalone) {
    return {
      permission: 'unsupported',
      reason: 'ios_requires_install',
    }
  }
  if (!environment.notifications) {
    return { permission: 'unsupported', reason: 'api_unavailable' }
  }
  return {
    permission: permissionState(environment.notifications.permission()),
    reason: null,
  }
}

function defaultEnvironment(): BrowserNotificationEnvironment {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { isIos: false, isStandalone: false }
  }

  const iosNavigator = navigator as Navigator & { standalone?: boolean }
  const isIos =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const isStandalone =
    iosNavigator.standalone === true ||
    window.matchMedia?.('(display-mode: standalone)').matches === true
  const NotificationConstructor = window.Notification

  return {
    isIos,
    isStandalone,
    notifications:
      typeof NotificationConstructor === 'undefined'
        ? undefined
        : {
            permission: () => NotificationConstructor.permission,
            requestPermission: () =>
              NotificationConstructor.requestPermission(),
            show: ({ kind, title, body }) => {
              const options: NotificationOptions = {
                body,
                tag: `forge-${kind}`,
              }
              if (navigator.serviceWorker) {
                void navigator.serviceWorker.ready
                  .then((registration) =>
                    registration.showNotification(title, options),
                  )
                  .catch(() => undefined)
                return
              }
              new NotificationConstructor(title, options)
            },
          },
  }
}

export function createBrowserSystemNotificationAdapter(
  environment: BrowserNotificationEnvironment = defaultEnvironment(),
): SystemNotificationAdapter {
  return {
    inspect: () => capability(environment),

    async requestPermission() {
      const current = capability(environment)
      if (current.permission === 'unsupported' || !environment.notifications) {
        return 'unsupported'
      }
      return permissionState(
        await environment.notifications.requestPermission(),
      )
    },

    show(message) {
      if (
        capability(environment).permission !== 'granted' ||
        !environment.notifications
      ) {
        return false
      }
      try {
        environment.notifications.show(message)
        return true
      } catch {
        return false
      }
    },
  }
}
