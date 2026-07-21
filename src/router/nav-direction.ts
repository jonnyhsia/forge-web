export type NavDirection = 'forward' | 'back'

/** 在跳转前标记方向，供 app-shell.css 的 view-transition 规则选择动画。 */
export function markNavDirection(direction: NavDirection) {
  document.documentElement.dataset.nav = direction
}
