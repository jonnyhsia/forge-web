import type { ReminderMessage } from './reminder-service'

export interface ScheduledReminder {
  id: string
  deliverAt: string
  message: ReminderMessage
}

export interface ReminderScheduler {
  schedule(
    reminder: ScheduledReminder,
    deliver: (message: ReminderMessage) => void,
  ): void
  cancel(id: string): void
  cancelAll(): void
}

export interface ReminderSchedulerRuntime {
  now(): number
  setTimeout(callback: () => void, delayMilliseconds: number): number
  clearTimeout(id: number): void
}

function browserRuntime(): ReminderSchedulerRuntime {
  return {
    now: () => Date.now(),
    setTimeout: (callback, delay) =>
      globalThis.setTimeout(callback, delay) as unknown as number,
    clearTimeout: (id) => globalThis.clearTimeout(id),
  }
}

export function createReminderScheduler(
  runtime: ReminderSchedulerRuntime = browserRuntime(),
): ReminderScheduler {
  const scheduled = new Map<string, number>()

  const cancel = (id: string) => {
    const timer = scheduled.get(id)
    if (timer === undefined) return
    runtime.clearTimeout(timer)
    scheduled.delete(id)
  }

  return {
    schedule(reminder, deliver) {
      cancel(reminder.id)
      const delay = Math.max(0, Date.parse(reminder.deliverAt) - runtime.now())
      const timer = runtime.setTimeout(() => {
        if (scheduled.get(reminder.id) !== timer) return
        scheduled.delete(reminder.id)
        deliver(reminder.message)
      }, delay)
      scheduled.set(reminder.id, timer)
    },

    cancel,

    cancelAll() {
      for (const id of [...scheduled.keys()]) cancel(id)
    },
  }
}
