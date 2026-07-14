import { describe, expect, it } from 'vitest'
import { createTimerController } from '../../src/domain'

describe('Timer Controller', () => {
  it('以绝对时间计算运行、暂停、恢复和超时，不依赖 tick 次数', () => {
    const controller = createTimerController()
    const state = controller.start({
      phase: 'exercise',
      exerciseResultId: 'result-1',
      setNumber: 1,
      targetSeconds: 10,
      startedAt: '2026-07-14T08:00:00.000Z',
    })

    expect(controller.read(state, '2026-07-14T08:00:07.900Z')).toMatchObject({
      elapsedSeconds: 7,
      remainingSeconds: 3,
      targetReached: false,
    })

    const paused = controller.pause(state, '2026-07-14T08:00:12.000Z')
    expect(controller.read(paused, '2026-07-14T08:01:00.000Z')).toMatchObject({
      elapsedSeconds: 12,
      remainingSeconds: 0,
      targetReached: true,
      overtimeSeconds: 2,
    })

    const resumed = controller.resume(paused, '2026-07-14T08:02:00.000Z')
    expect(controller.finish(resumed, '2026-07-14T08:02:05.000Z')).toBe(17)
  })
})
