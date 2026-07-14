export interface AppShellFacts {
  initialized: boolean
  initializationError: unknown | null
  online: boolean
}

export interface AppShellState {
  content: 'loading' | 'error' | 'ready'
  offline: boolean
}

export function resolveAppShellState(facts: AppShellFacts): AppShellState {
  const content = facts.initializationError
    ? 'error'
    : facts.initialized
      ? 'ready'
      : 'loading'

  return { content, offline: !facts.online }
}
