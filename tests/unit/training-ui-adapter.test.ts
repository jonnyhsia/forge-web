import { describe, expect, it, vi } from 'vitest'
import type { WorkoutSession } from '../../src/domain'
import { createTrainingUiAdapter } from '../../src/features/training/training-ui-adapter'

function repetitionSession(overrides: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: 'session-1',
    planId: 'plan-1',
    scheduleOccurrenceKey: 'plan-1:2026-07-14',
    planName: 'Push Day',
    status: 'active',
    startedAt: '2026-07-14T08:00:00.000Z',
    activeExerciseResultId: 'result-1',
    activeSetNumber: 2,
    exercises: [
      {
        id: 'result-1',
        sourcePlanExerciseId: 'plan-exercise-1',
        exercise: {
          exerciseId: 'exercise-1',
          name: '卧推',
          type: 'repetitions',
        },
        position: 0,
        target: {
          type: 'repetitions',
          targetSets: 3,
          targetRepetitions: 8,
          weight: { mode: 'external', value: 80, unit: 'kg' },
        },
        sets: [
          {
            id: 'set-1',
            setNumber: 1,
            skipped: false,
            repetitions: 8,
            weight: { mode: 'external', value: 80, unit: 'kg' },
            completedAt: '2026-07-14T08:05:00.000Z',
            idempotencyKey: 'set-key-1',
          },
        ],
      },
    ],
    idempotencyKey: 'start-key-1',
    createdAt: '2026-07-14T08:00:00.000Z',
    updatedAt: '2026-07-14T08:05:00.000Z',
    sync: { status: 'pending' },
    ...overrides,
  }
}

describe('次数型训练 UI adapter', () => {
  it('从开始路由创建会话，并从会话路由按持久化指针恢复视图', async () => {
    const session = repetitionSession()
    const gateway = {
      start: vi.fn().mockResolvedValue(session),
      get: vi.fn().mockResolvedValue(session),
      transition: vi.fn(),
      completeSet: vi.fn(),
    }
    const adapter = createTrainingUiAdapter({
      gateway,
      createId: () => 'generated-start-key',
    })

    await expect(
      adapter.open({ type: 'start', planId: 'plan-1', localDate: '2026-07-14' }),
    ).resolves.toMatchObject({
      kind: 'repetitions',
      sessionId: 'session-1',
      activeSetNumber: 2,
      completedSets: [{ setNumber: 1, repetitions: 8 }],
    })
    expect(gateway.start).toHaveBeenCalledWith({
      planId: 'plan-1',
      localDate: '2026-07-14',
      idempotencyKey: 'generated-start-key',
    })

    await expect(
      adapter.open({ type: 'resume', sessionId: 'session-1' }),
    ).resolves.toMatchObject({
      kind: 'repetitions',
      exerciseName: '卧推',
      exerciseNumber: 1,
      totalExercises: 1,
      targetSets: 3,
      targetRepetitions: 8,
    })
    expect(gateway.get).toHaveBeenCalledWith('session-1')
  })

  it('完成本组失败后重试复用稳定幂等键，并返回持久化后的下一组', async () => {
    const current = repetitionSession()
    const completed = repetitionSession({
      activeSetNumber: 3,
      exercises: [
        {
          ...current.exercises[0]!,
          sets: [
            ...current.exercises[0]!.sets,
            {
              id: 'set-2',
              setNumber: 2,
              skipped: false,
              repetitions: 9,
              weight: { mode: 'external', value: 82.5, unit: 'kg' },
              completedAt: '2026-07-14T08:10:00.000Z',
              idempotencyKey: 'generated-set-key',
            },
          ],
        },
      ],
    })
    const completeSet = vi
      .fn()
      .mockRejectedValueOnce(new Error('storage unavailable'))
      .mockResolvedValueOnce({
        session: completed,
        set: completed.exercises[0]!.sets[1],
      })
    const adapter = createTrainingUiAdapter({
      gateway: {
        start: vi.fn(),
        get: vi.fn().mockResolvedValue(current),
        transition: vi.fn(),
        completeSet,
      },
      createId: () => 'generated-set-key',
    })
    const view = await adapter.open({ type: 'resume', sessionId: current.id })
    if (view.kind !== 'repetitions') throw new Error('Expected repetitions view')
    const input = {
      repetitions: 9,
      weight: { mode: 'external', value: 82.5, unit: 'kg' } as const,
    }

    await expect(adapter.completeCurrentSet(view, input)).rejects.toThrow(
      'storage unavailable',
    )
    await expect(
      adapter.completeCurrentSet(view, {
        repetitions: 10,
        weight: { mode: 'external', value: 85, unit: 'kg' },
      }),
    ).resolves.toMatchObject({
      kind: 'repetitions',
      activeSetNumber: 3,
      completedSets: [
        { setNumber: 1, repetitions: 8 },
        { setNumber: 2, repetitions: 9, weight: { value: 82.5 } },
      ],
    })
    expect(completeSet).toHaveBeenCalledTimes(2)
    expect(completeSet.mock.calls[0]?.[1]).toBe('generated-set-key')
    expect(completeSet.mock.calls[1]?.[1]).toBe('generated-set-key')
    expect(completeSet.mock.calls[1]?.[0]).toEqual(
      completeSet.mock.calls[0]?.[0],
    )
  })
})

describe('时间型与休息训练 UI adapter', () => {
  function durationSession(overrides: Partial<WorkoutSession> = {}): WorkoutSession {
    return {
      ...repetitionSession(),
      exercises: [{
        ...repetitionSession().exercises[0]!,
        exercise: { exerciseId: 'exercise-duration', name: '平板支撑', type: 'duration' },
        target: { type: 'duration', targetSets: 2, targetSeconds: 10 },
        restSeconds: 5,
        sets: [],
      }],
      activeExerciseResultId: 'result-1',
      activeSetNumber: 1,
      ...overrides,
    }
  }

  it('刷新时按持久化绝对时间恢复时间型动作，并在提前结束后进入休息计时', async () => {
    const session = durationSession()
    let persisted = session
    const adapter = createTrainingUiAdapter({
      createId: () => 'timer-id',
      now: () => '2026-07-14T08:00:00.000Z',
      gateway: {
        start: vi.fn().mockResolvedValue(session),
        get: vi.fn().mockImplementation(async () => persisted),
        transition: vi.fn().mockResolvedValue(session),
        completeSet: vi.fn().mockImplementation(async () => {
          persisted = {
            ...session,
            activeSetNumber: 2,
            timer: {
              phase: 'rest',
              exerciseResultId: 'result-1',
              setNumber: 1,
              targetSeconds: 5,
              segmentStartedAt: '2026-07-14T08:00:08.000Z',
              accumulatedSeconds: 0,
              status: 'running',
            },
          }
          return { session: persisted, set: persisted.exercises[0]!.sets[0]! }
        }),
        saveTimer: vi.fn().mockImplementation(async (_id, timer) => {
          persisted = { ...persisted, timer }
          return persisted
        }),
      },
    })

    const view = await adapter.open({ type: 'resume', sessionId: session.id })
    expect(view).toMatchObject({ kind: 'duration', elapsedSeconds: 0, targetSeconds: 10 })
    if (view.kind !== 'duration') throw new Error('Expected duration view')
    expect(adapter.refreshTimer(view, '2026-07-14T08:00:12.000Z')).toMatchObject({
      elapsedSeconds: 12,
      targetReached: true,
      overtimeSeconds: 2,
    })

    const rest = await adapter.completeCurrentSet(view, { durationSeconds: 8 })
    expect(rest).toMatchObject({ kind: 'rest', targetSeconds: 5, elapsedSeconds: 0 })
  })
})
