import { describe, expect, it } from 'vitest'
import {
  inspectInstallationEnvironment,
  resolveInstallationState,
} from '../../src/pwa/pwa-state'

describe('PWA 安装状态', () => {
  it('已在独立窗口运行时隐藏安装入口', () => {
    expect(resolveInstallationState({
      standalone: true,
      ios: true,
      hasInstallPrompt: true,
    })).toBe('installed')
  })

  it('标准安装事件可用时提供安装入口', () => {
    expect(resolveInstallationState({
      standalone: false,
      ios: false,
      hasInstallPrompt: true,
    })).toBe('installable')
  })

  it('iOS 未安装时提供手动说明', () => {
    expect(resolveInstallationState({
      standalone: false,
      ios: true,
      hasInstallPrompt: false,
    })).toBe('ios-manual')
  })

  it('识别触控型 iPad 桌面 user agent 与独立显示模式', () => {
    expect(inspectInstallationEnvironment({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)',
      platform: 'MacIntel',
      maxTouchPoints: 5,
    }, true)).toEqual({ ios: true, standalone: true })
  })
})
