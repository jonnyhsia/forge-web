import { describe, expect, it } from 'vitest'
import { ForgeDatabase } from '../../src/data/database'
import {
  DexieHistoryRepository,
  DexiePlansRepository,
} from '../../src/data/repositories/feature-repositories'
import type { TrainingPlan, WorkoutSession } from '../../src/domain'

function plan(
  id: string,
  updatedAt: string,
  overrides: Partial<TrainingPlan> = {},
): TrainingPlan {
  return {
    id,
    name: id,
    status: 'active',
    category: 'strength',
    weekdays: [1],
    effectiveLocalDate: '2026-07-14',
    createdAt: updatedAt,
    updatedAt,
    sync: { status: 'local' },
    ...overrides,
  }
}

function completedSession(
  id: string,
  endedAt: string,
  overrides: Partial<WorkoutSession> = {},
): WorkoutSession {
  return {
    id,
    planId: 'plan-a',
    scheduleOccurrenceKey: `plan-a:${id}`,
    planName: 'Push Day',
    status: 'completed',
    startedAt: '2026-07-14T07:00:00.000Z',
    endedAt,
    exercises: [],
    idempotencyKey: `start-${id}`,
    createdAt: '2026-07-14T07:00:00.000Z',
    updatedAt: endedAt,
    sync: { status: 'local' },
    ...overrides,
  }
}

describe('feature repositories', () => {
  it('pages visible plans with a stable cursor and default filters', async () => {
    const database = new ForgeDatabase('forge-t03-plans-page')
    const repository = new DexiePlansRepository(database)

    try {
      await database.trainingPlans.bulkPut([
        plan('plan-a', '2026-07-14T08:00:00.000Z'),
        plan('plan-b', '2026-07-14T09:00:00.000Z'),
        plan('plan-c', '2026-07-14T07:00:00.000Z'),
        plan('archived', '2026-07-14T10:00:00.000Z', {
          status: 'archived',
        }),
        plan('deleted', '2026-07-14T11:00:00.000Z', {
          deletedAt: '2026-07-14T11:00:00.000Z',
        }),
      ])

      const firstPage = await repository.listPage({ limit: 2 })
      const secondPage = await repository.listPage({
        cursor: firstPage.nextCursor,
        limit: 2,
      })

      expect(firstPage.items.map(({ id }) => id)).toEqual([
        'plan-b',
        'plan-a',
      ])
      expect(firstPage.nextCursor).not.toBeNull()
      expect(secondPage).toEqual({
        items: [expect.objectContaining({ id: 'plan-c' })],
        nextCursor: null,
      })
    } finally {
      database.close()
    }
  })

  it('pages completed history by completion time without loading active sessions', async () => {
    const database = new ForgeDatabase('forge-t03-history-page')
    const repository = new DexieHistoryRepository(database)

    try {
      await database.workoutSessions.bulkPut([
        completedSession('session-a', '2026-07-14T09:00:00.000Z'),
        completedSession('session-b', '2026-07-14T09:00:00.000Z'),
        completedSession('session-c', '2026-07-13T09:00:00.000Z'),
        completedSession('active', '2026-07-14T10:00:00.000Z', {
          status: 'active',
          endedAt: undefined,
        }),
      ])

      const firstPage = await repository.listPage({ limit: 1 })
      const secondPage = await repository.listPage({
        cursor: firstPage.nextCursor,
        limit: 2,
      })

      expect(firstPage.items.map(({ id }) => id)).toEqual(['session-b'])
      expect(secondPage.items.map(({ id }) => id)).toEqual([
        'session-a',
        'session-c',
      ])
      expect(secondPage.nextCursor).toBeNull()
    } finally {
      database.close()
    }
  })
})
