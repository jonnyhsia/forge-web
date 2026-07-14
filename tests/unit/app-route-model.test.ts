import { describe, expect, it } from 'vitest'
import { resolveAppRoute } from '../../src/router/route-model'

describe('应用路由模型', () => {
  it.each([
    ['/', 'dashboard', 'dashboard', true],
    ['/plans', 'plans', 'plans', true],
    ['/plans/new', 'plan-create', null, false],
    ['/plans/plan-1', 'plan-detail', null, false],
    ['/training/start', 'training-start', null, false],
    ['/training/session-1', 'training-session', null, false],
    ['/history', 'history', 'records', true],
    ['/history/session-1', 'history-detail', null, false],
    ['/statistics', 'statistics', 'records', true],
    ['/settings', 'settings', 'settings', true],
  ] as const)(
    '直达 %s 时解析页面、导航和壳类型',
    (pathname, page, navigation, showsNavigation) => {
      expect(resolveAppRoute(pathname)).toEqual({
        page,
        navigation,
        shell: showsNavigation ? 'standard' : 'focused',
      })
    },
  )

  it('未知路径解析为可返回首页的 404 页面', () => {
    expect(resolveAppRoute('/missing')).toEqual({
      page: 'not-found',
      navigation: null,
      shell: 'focused',
    })
  })
})
