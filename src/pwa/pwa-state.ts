export type InstallationState =
  | 'hidden'
  | 'installable'
  | 'ios-manual'
  | 'installed'

export interface InstallationFacts {
  standalone: boolean
  ios: boolean
  hasInstallPrompt: boolean
}

export function resolveInstallationState({
  standalone,
  ios,
  hasInstallPrompt,
}: InstallationFacts): InstallationState {
  if (standalone) return 'installed'
  if (hasInstallPrompt) return 'installable'
  if (ios) return 'ios-manual'
  return 'hidden'
}

export interface NavigatorInstallationFacts {
  userAgent: string
  platform: string
  maxTouchPoints: number
  standalone?: boolean
}

export function inspectInstallationEnvironment(
  navigatorFacts: NavigatorInstallationFacts,
  displayModeStandalone: boolean,
): Pick<InstallationFacts, 'standalone' | 'ios'> {
  const iosDevice = /iphone|ipad|ipod/i.test(navigatorFacts.userAgent)
    || (navigatorFacts.platform === 'MacIntel' && navigatorFacts.maxTouchPoints > 1)

  return {
    ios: iosDevice,
    standalone: displayModeStandalone || navigatorFacts.standalone === true,
  }
}
