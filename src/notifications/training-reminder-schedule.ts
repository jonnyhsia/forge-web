import type { DashboardSnapshot } from '../domain'
import type { ScheduledReminder } from './reminder-scheduler'

function localDateTime(localDate: string, localTime: string): Date | null {
  const dateParts = localDate.split('-').map(Number)
  const timeParts = localTime.split(':').map(Number)
  if (
    dateParts.length !== 3 ||
    timeParts.length !== 2 ||
    dateParts.some((value) => !Number.isInteger(value)) ||
    timeParts.some((value) => !Number.isInteger(value))
  ) {
    return null
  }
  const [year, month, day] = dateParts
  const [hour, minute] = timeParts
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  return new Date(year, month - 1, day, hour, minute)
}

export function trainingReminderSchedule(
  snapshot: DashboardSnapshot,
  leadMinutes: number,
  now = Date.now(),
): ScheduledReminder[] {
  const lead = Math.max(0, Math.floor(leadMinutes))
  return snapshot.days.flatMap((day) =>
    day.occurrences.flatMap((occurrence) => {
      if (occurrence.status !== 'planned' || !occurrence.localTime) return []
      const startsAt = localDateTime(day.localDate, occurrence.localTime)
      if (!startsAt) return []
      const deliverAt = startsAt.getTime() - lead * 60_000
      if (deliverAt <= now) return []
      return [
        {
          id: `training:${occurrence.key}`,
          deliverAt: new Date(deliverAt).toISOString(),
          message: {
            kind: 'training' as const,
            title: '训练即将开始',
            body:
              lead === 0
                ? `${occurrence.planName} 现在开始。`
                : `${occurrence.planName} 将在 ${lead} 分钟后开始。`,
          },
        },
      ]
    }),
  )
}
