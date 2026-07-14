import { describe, expect, it } from 'vitest'
import {
  DATABASE_SCHEMA_VERSION,
  ForgeDatabase,
} from '../../src/data/database'
import type {
  StatisticsCache,
  TrainingPlan,
  WorkoutSession,
} from '../../src/domain'

describe('IndexedDB schema v2', () => {
  it('initializes a new database with complete default settings', async () => {
    const database = new ForgeDatabase('forge-pwa-v2-defaults')

    try {
      await database.open()

      await expect(database.settings.get('app')).resolves.toEqual({
        key: 'app',
        defaultWeightUnit: 'kg',
        trainingReminderEnabled: false,
        restReminderEnabled: false,
        reminderLeadMinutes: 15,
        notificationPermission: 'not_requested',
        dataSchemaVersion: DATABASE_SCHEMA_VERSION,
      })
    } finally {
      database.close()
    }
  })

  it('persists and queries plans by v2 lifecycle and category', async () => {
    const database = new ForgeDatabase('forge-pwa-v2-plans')
    const plan: TrainingPlan = {
      id: 'plan-1',
      name: 'Push Day',
      status: 'active',
      category: 'strength',
      weekdays: [1, 4],
      localTime: '07:30',
      effectiveLocalDate: '2026-07-14',
      createdAt: '2026-07-14T08:00:00.000Z',
      updatedAt: '2026-07-14T08:00:00.000Z',
      sync: { status: 'local' },
    }

    try {
      await database.trainingPlans.put(plan)

      await expect(
        database.trainingPlans
          .where('[status+category]')
          .equals(['active', 'strength'])
          .first(),
      ).resolves.toEqual(plan)
    } finally {
      database.close()
    }
  })

  it('persists a complete workout snapshot and finds its schedule occurrence', async () => {
    const database = new ForgeDatabase('forge-pwa-v2-sessions')
    const session: WorkoutSession = {
      id: 'session-1',
      planId: 'plan-1',
      scheduleOccurrenceKey: 'plan-1:2026-07-14',
      planName: 'Push Day',
      status: 'completed',
      startedAt: '2026-07-14T08:00:00.000Z',
      endedAt: '2026-07-14T09:00:00.000Z',
      exercises: [
        {
          id: 'result-1',
          sourcePlanExerciseId: 'plan-exercise-1',
          position: 0,
          exercise: {
            exerciseId: 'exercise-1',
            name: '卧推',
            type: 'repetitions',
          },
          target: {
            type: 'repetitions',
            targetSets: 1,
            targetRepetitions: 5,
            weight: { mode: 'external', value: 80, unit: 'kg' },
          },
          sets: [
            {
              id: 'set-1',
              setNumber: 1,
              repetitions: 5,
              weight: { mode: 'external', value: 82.5, unit: 'kg' },
              completedAt: '2026-07-14T08:10:00.000Z',
              skipped: false,
              idempotencyKey: 'complete-set-1',
            },
          ],
        },
      ],
      idempotencyKey: 'start-session-1',
      createdAt: '2026-07-14T08:00:00.000Z',
      updatedAt: '2026-07-14T09:00:00.000Z',
      sync: { status: 'pending' },
    }

    try {
      await database.workoutSessions.put(session)

      await expect(
        database.workoutSessions
          .where('scheduleOccurrenceKey')
          .equals(session.scheduleOccurrenceKey)
          .first(),
      ).resolves.toEqual(session)
    } finally {
      database.close()
    }
  })

  it('persists v2 statistics semantics and queries by scope and source', async () => {
    const database = new ForgeDatabase('forge-pwa-v2-statistics')
    const cache: StatisticsCache = {
      key: 'cached:2026-07-01:2026-07-31',
      scope: 'cached',
      rangeStart: '2026-07-01T00:00:00.000Z',
      rangeEnd: '2026-07-31T23:59:59.999Z',
      generatedAt: '2026-07-14T08:00:00.000Z',
      source: 'history',
      summary: {
        workoutCount: 12,
        streakDays: 3,
        trainingVolumeKg: 12_450,
        personalRecords: [
          {
            exerciseId: 'exercise-1',
            exerciseName: '卧推',
            weightKg: 100,
            achievedAt: '2026-07-14T08:00:00.000Z',
          },
        ],
      },
    }

    try {
      await database.statisticsCaches.put(cache)

      await expect(
        database.statisticsCaches
          .where('[scope+source]')
          .equals(['cached', 'history'])
          .first(),
      ).resolves.toEqual(cache)
    } finally {
      database.close()
    }
  })
})
