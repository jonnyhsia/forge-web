import { describe, expect, it, vi } from 'vitest'
import {
  createBrowserSystemNotificationAdapter,
  createReminderScheduler,
  createReminderService,
  type NotificationCapability,
  type SystemNotificationAdapter,
} from '../../src/notifications'

function notificationAdapter(
  capability: NotificationCapability,
): SystemNotificationAdapter & {
  requestPermission: ReturnType<typeof vi.fn>
  show: ReturnType<typeof vi.fn>
} {
  return {
    inspect: () => capability,
    requestPermission: vi.fn().mockResolvedValue(capability.permission),
    show: vi.fn().mockReturnValue(true),
  }
}

describe('提醒服务', () => {
  it('检查能力时不请求权限，iOS 未添加到主屏时直接使用站内降级', async () => {
    const adapter = notificationAdapter({
      permission: 'unsupported',
      reason: 'ios_requires_install',
    })
    const service = createReminderService(adapter)

    expect(service.inspect()).toEqual({
      permission: 'unsupported',
      reason: 'ios_requires_install',
    })
    expect(adapter.requestPermission).not.toHaveBeenCalled()

    await expect(service.requestPermission()).resolves.toBe('unsupported')
    expect(adapter.requestPermission).not.toHaveBeenCalled()
  })

  it('仅在明确请求时申请权限，并在授权后补充系统通知', async () => {
    let capability: NotificationCapability = {
      permission: 'not_requested',
      reason: null,
    }
    const adapter = notificationAdapter({
      permission: 'not_requested',
      reason: null,
    })
    adapter.inspect = () => capability
    adapter.requestPermission.mockImplementation(async () => {
      capability = { permission: 'granted', reason: null }
      return 'granted'
    })
    const service = createReminderService(adapter)

    expect(adapter.requestPermission).not.toHaveBeenCalled()
    await expect(service.requestPermission()).resolves.toBe('granted')
    expect(adapter.requestPermission).toHaveBeenCalledTimes(1)

    expect(
      service.deliver({
        kind: 'rest',
        title: '休息完成',
        body: '可以继续下一组了。',
      }),
    ).toEqual({
      inAppMessage: '可以继续下一组了。',
      systemNotificationSent: true,
    })
    expect(adapter.show).toHaveBeenCalledWith({
      kind: 'rest',
      title: '休息完成',
      body: '可以继续下一组了。',
    })
  })

  it.each(['denied', 'unsupported'] as const)(
    '权限为 %s 时仍返回站内提醒且不发送系统通知',
    (permission) => {
      const adapter = notificationAdapter({
        permission,
        reason: permission === 'unsupported' ? 'api_unavailable' : null,
      })
      const service = createReminderService(adapter)

      expect(
        service.deliver({
          kind: 'exercise',
          title: '目标完成',
          body: '计时目标已达到。',
        }),
      ).toEqual({
        inAppMessage: '计时目标已达到。',
        systemNotificationSent: false,
      })
      expect(adapter.show).not.toHaveBeenCalled()
    },
  )
})

describe('浏览器系统通知 Adapter', () => {
  it('iOS 未添加到主屏时不访问通知 API', async () => {
    const requestPermission = vi.fn().mockResolvedValue('granted')
    const adapter = createBrowserSystemNotificationAdapter({
      isIos: true,
      isStandalone: false,
      notifications: {
        permission: () => 'default',
        requestPermission,
        show: vi.fn(),
      },
    })

    expect(adapter.inspect()).toEqual({
      permission: 'unsupported',
      reason: 'ios_requires_install',
    })
    await expect(adapter.requestPermission()).resolves.toBe('unsupported')
    expect(requestPermission).not.toHaveBeenCalled()
  })

  it('iOS 已添加到主屏且系统支持时允许显式申请', async () => {
    let permission: NotificationPermission = 'default'
    const adapter = createBrowserSystemNotificationAdapter({
      isIos: true,
      isStandalone: true,
      notifications: {
        permission: () => permission,
        requestPermission: vi.fn(async () => {
          permission = 'granted'
          return permission
        }),
        show: vi.fn(),
      },
    })

    expect(adapter.inspect().permission).toBe('not_requested')
    await expect(adapter.requestPermission()).resolves.toBe('granted')
    expect(adapter.inspect().permission).toBe('granted')
  })
})

describe('前台提醒调度 Interface', () => {
  it('同一提醒重新调度时替换旧任务，并在到点后只交付一次', () => {
    const callbacks = new Map<number, () => void>()
    const clearTimeout = vi.fn((id: number) => callbacks.delete(id))
    let timerId = 0
    const setTimeout = vi.fn((callback: () => void) => {
      timerId += 1
      callbacks.set(timerId, callback)
      return timerId
    })
    const deliver = vi.fn()
    const scheduler = createReminderScheduler({
      now: () => Date.parse('2026-07-14T08:00:00.000Z'),
      setTimeout,
      clearTimeout,
    })
    const message = {
      kind: 'training' as const,
      title: '训练即将开始',
      body: 'Push Day 将在 15 分钟后开始。',
    }

    scheduler.schedule(
      { id: 'plan-a:2026-07-14', deliverAt: '2026-07-14T08:15:00.000Z', message },
      deliver,
    )
    scheduler.schedule(
      { id: 'plan-a:2026-07-14', deliverAt: '2026-07-14T08:10:00.000Z', message },
      deliver,
    )

    expect(clearTimeout).toHaveBeenCalledWith(1)
    expect(setTimeout).toHaveBeenLastCalledWith(expect.any(Function), 600_000)
    callbacks.get(2)?.()
    callbacks.get(2)?.()
    expect(deliver).toHaveBeenCalledTimes(1)
    expect(deliver).toHaveBeenCalledWith(message)
  })
})
