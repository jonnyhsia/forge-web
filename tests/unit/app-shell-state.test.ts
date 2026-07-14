import { describe, expect, it } from 'vitest'
import { resolveAppShellState } from '../../src/app/app-shell-state'

describe('应用壳状态', () => {
  it('初始化完成前显示加载状态', () => {
    expect(
      resolveAppShellState({
        initialized: false,
        initializationError: null,
        online: true,
      }),
    ).toEqual({ content: 'loading', offline: false })
  })

  it('初始化失败时错误状态优先于加载状态', () => {
    expect(
      resolveAppShellState({
        initialized: false,
        initializationError: new Error('storage failed'),
        online: true,
      }),
    ).toEqual({ content: 'error', offline: false })
  })

  it('离线但本地数据已就绪时保留页面并显示离线状态', () => {
    expect(
      resolveAppShellState({
        initialized: true,
        initializationError: null,
        online: false,
      }),
    ).toEqual({ content: 'ready', offline: true })
  })
})
