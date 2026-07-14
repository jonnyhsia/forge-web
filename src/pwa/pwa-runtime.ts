import { registerSW } from 'virtual:pwa-register'
import {
  inspectInstallationEnvironment,
  resolveInstallationState,
  type InstallationState,
} from './pwa-state'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

interface NavigatorWithStandalone extends Navigator {
  standalone?: boolean
}

export interface PwaSnapshot {
  installation: InstallationState
  offlineReady: boolean
  updateAvailable: boolean
  activatingUpdate: boolean
  updateError: boolean
}

type PwaListener = () => void

const initialSnapshot: PwaSnapshot = {
  installation: 'hidden',
  offlineReady: false,
  updateAvailable: false,
  activatingUpdate: false,
  updateError: false,
}

export class BrowserPwaRuntime {
  private snapshotValue: PwaSnapshot = initialSnapshot
  private readonly listeners = new Set<PwaListener>()
  private installPrompt: BeforeInstallPromptEvent | null = null
  private updateServiceWorker: ((reloadPage?: boolean) => Promise<void>) | null = null
  private started = false

  start(): void {
    if (this.started || typeof window === 'undefined') return
    this.started = true
    this.refreshInstallationState()
    window.addEventListener('beforeinstallprompt', this.handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', this.handleAppInstalled)

    this.updateServiceWorker = registerSW({
      immediate: true,
      onNeedRefresh: () => {
        this.update({ updateAvailable: true, updateError: false })
      },
      onOfflineReady: () => {
        this.update({ offlineReady: true })
      },
      onRegisterError: () => {
        this.update({ offlineReady: false })
      },
    })
  }

  subscribe = (listener: PwaListener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): PwaSnapshot => this.snapshotValue

  async promptInstall(): Promise<void> {
    const prompt = this.installPrompt
    if (!prompt) return
    this.installPrompt = null
    await prompt.prompt()
    const choice = await prompt.userChoice
    this.update({
      installation: choice.outcome === 'accepted' ? 'installed' : 'hidden',
    })
  }

  async activateUpdate(): Promise<void> {
    if (!this.updateServiceWorker || this.snapshotValue.activatingUpdate) return
    this.update({ activatingUpdate: true, updateError: false })
    try {
      await this.updateServiceWorker(true)
    } catch {
      this.update({ activatingUpdate: false, updateError: true })
    }
  }

  deferUpdate(): void {
    this.update({ updateAvailable: false, updateError: false })
  }

  dismissOfflineReady(): void {
    this.update({ offlineReady: false })
  }

  private readonly handleBeforeInstallPrompt = (event: Event) => {
    event.preventDefault()
    this.installPrompt = event as BeforeInstallPromptEvent
    this.update({ installation: 'installable' })
  }

  private readonly handleAppInstalled = () => {
    this.installPrompt = null
    this.update({ installation: 'installed' })
  }

  private refreshInstallationState(): void {
    const browserNavigator = navigator as NavigatorWithStandalone
    const environment = inspectInstallationEnvironment(
      {
        userAgent: browserNavigator.userAgent,
        platform: browserNavigator.platform,
        maxTouchPoints: browserNavigator.maxTouchPoints,
        standalone: browserNavigator.standalone,
      },
      window.matchMedia('(display-mode: standalone)').matches,
    )
    this.update({
      installation: resolveInstallationState({
        ...environment,
        hasInstallPrompt: this.installPrompt !== null,
      }),
    })
  }

  private update(patch: Partial<PwaSnapshot>): void {
    this.snapshotValue = { ...this.snapshotValue, ...patch }
    for (const listener of this.listeners) listener()
  }
}

export const pwaRuntime = new BrowserPwaRuntime()
