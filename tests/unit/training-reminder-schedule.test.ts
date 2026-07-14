import { describe, expect, it } from 'vitest'
import type { DashboardSnapshot } from '../../src/domain'
import { trainingReminderSchedule } from '../../src/notifications'

describe('训练提醒调度', () => {
  it('仅为有本地时间且仍未开始的未来场次生成提前提醒', () => {
    const snapshot: DashboardSnapshot = {
      range: {
        start: '2026-07-13',
        end: '2026-07-19',
        today: '2026-07-14',
      },
      days: [
        {
          localDate: '2026-07-14',
          weekday: 2,
          status: 'planned',
          occurrences: [
            {
              key: 'plan-a:2026-07-14',
              localDate: '2026-07-14',
              planId: 'plan-a',
              planName: 'Push Day',
              localTime: '08:00',
              status: 'planned',
              completedExercises: 0,
              totalExercises: 4,
            },
            {
              key: 'plan-b:2026-07-14',
              localDate: '2026-07-14',
              planId: 'plan-b',
              planName: '自由训练',
              status: 'planned',
              completedExercises: 0,
              totalExercises: 0,
            },
          ],
        },
      ],
      recentWorkout: null,
      statistics: null,
    }
    const now = new Date(2026, 6, 14, 7, 30).getTime()

    expect(trainingReminderSchedule(snapshot, 15, now)).toEqual([
      {
        id: 'training:plan-a:2026-07-14',
        deliverAt: new Date(2026, 6, 14, 7, 45).toISOString(),
        message: {
          kind: 'training',
          title: '训练即将开始',
          body: 'Push Day 将在 15 分钟后开始。',
        },
      },
    ])
  })
})
