# 006 — 为计划编辑页添加移动端水平推入/推出路由转场

- **Status**: TODO
- **Commit**: 234c73c
- **Severity**: MEDIUM
- **Category**: Missed opportunities
- **Estimated scope**: 5 files, about 70 lines

## Problem

`/plans`（列表）与 `/plans/:id`、`/plans/new`（编辑器）之间是 App 里唯一的「进入更深一层再返回」的全屏层级，但两者硬切。

`src/router/router.tsx:34-36` 直接替换 Component，没有任何页面级转场：

```tsx
{ path: ROUTE_PATHS.plans, Component: PlansPage },
{ path: ROUTE_PATHS.planCreate, Component: PlanCreatePage },
{ path: ROUTE_PATHS.planDetail, Component: PlanDetailPage },
```

`DESIGN.md:77` 已经把这条列为已知空缺：

```
| 页面路由切换 | 无 | 无 | React Router 直接替换页面，未设置页面级 Transition | src/router/router.tsx |
```

同时 `src/router/route-model.ts:38-41` 让这两个路由分属不同 shell（`/plans` 是 `standard`、带底部导航；编辑器是 `focused`、无底部导航），所以切换时底部导航条同帧蒸发，用户拿不到「我进到更深一层」的空间信号。

进出编辑器共 8 个跳转点，目前全部无转场：

```tsx
// src/features/plans/PlanPages.tsx:95 — 列表页右上「+」
<Link aria-label="新建计划" className="round-action" to="/plans/new">

// src/features/plans/PlanPages.tsx:109 — 空状态 CTA
<Link className="ui-button ui-button--primary" to="/plans/new">

// src/features/plans/PlanPages.tsx:145 — 展开卡片里的「编辑计划」
<Link className="plan-edit-link" to={`/plans/${plan.id}`}>

// src/pages/ShellPages.tsx:259 — 首页当日训练卡的编辑入口
<Link aria-label={`编辑${occurrence.planName}`} to={`/plans/${occurrence.planId}`}>

// src/features/plans/PlanPages.tsx:340 — 编辑器返回箭头
<Link aria-label="返回计划" className="back-link" to="/plans">

// src/features/plans/PlanPages.tsx:258 — 保存后关闭
navigate('/plans', { replace: true })

// src/features/plans/PlanPages.tsx:328 — 删除后关闭
navigate('/plans', { replace: true })

// src/features/plans/PlanPages.tsx:388 — 「丢弃修改」离开
onClick={() => { allowNavigation.current = true; blocker.proceed?.() }}
```

### 必读风险：本仓库已经在 View Transitions 上碰过壁

`plans/001-animate-plan-card-expansion.md:54` 记录了一次失败：

> 运行时验证发现当前内置浏览器不支持稳定的 View Transitions 路径，因此最终实现采用范围受控的 grid 布局过渡，避免核心交互退化为即时跳变。

本方案仍然选择 View Transitions，理由与 001 不同：001 里 VT 只是实现卡片展开的**可选路径之一**（且有 grid 方案可替代），而路由转场里 React Router 会立刻卸载旧页面，**没有 VT 就拿不到退出动画**，纯 CSS 只能做到单向进入。

但这条先例意味着执行者**必须先验证支持情况再动手**（见 Steps 第 1 步）。好消息是 VT 的降级是安全的：浏览器不支持时 `startViewTransition` 不会被调用，导航行为与今天完全一致，不存在功能回退风险。

## Target

移动端（`max-width: 47.999rem`）用 View Transitions API 做 iOS 式水平推入/推出，桌面端完全禁用。

方向靠 `document.documentElement` 上的 `data-nav="forward" | "back"` 区分，在跳转前打标。

```css
/* target — src/app/app-shell.css */

/* 移动端：接管 UA 默认交叉淡入，改为水平推送 */
@media (max-width: 47.999rem) {
  ::view-transition-old(root),
  ::view-transition-new(root) {
    animation: none;
    mix-blend-mode: normal;
  }

  /* 前进：编辑器从右侧盖住列表 */
  html[data-nav='forward']::view-transition-new(root) {
    z-index: 1;
    animation: plan-nav-enter-right 200ms cubic-bezier(.22, 1, .36, 1) both;
  }
  html[data-nav='forward']::view-transition-old(root) {
    animation: plan-nav-recede-left 200ms cubic-bezier(.22, 1, .36, 1) both;
  }

  /* 后退：编辑器向右滑走，露出列表 */
  html[data-nav='back']::view-transition-old(root) {
    z-index: 1;
    animation: plan-nav-exit-right 200ms cubic-bezier(.22, 1, .36, 1) both;
  }
  html[data-nav='back']::view-transition-new(root) {
    animation: plan-nav-advance-left 200ms cubic-bezier(.22, 1, .36, 1) both;
  }
}

@keyframes plan-nav-enter-right   { from { transform: translateX(100%); } }
@keyframes plan-nav-recede-left   { to   { transform: translateX(-22%); opacity: .6; } }
@keyframes plan-nav-exit-right    { to   { transform: translateX(100%); } }
@keyframes plan-nav-advance-left  { from { transform: translateX(-22%); opacity: .6; } }

/* 桌面端：与 Dialog 一致，主动禁用进退场 */
@media (min-width: 48rem) {
  ::view-transition-group(root),
  ::view-transition-old(root),
  ::view-transition-new(root) { animation: none; }
}

/* 减少动态：走仓库既有的硬切约定 */
@media (prefers-reduced-motion: reduce) {
  ::view-transition-group(root),
  ::view-transition-old(root),
  ::view-transition-new(root) { animation: none; }
}
```

几个必须照做的细节，漏掉任何一条都会出现可见缺陷：

| 细节 | 原因 |
| --- | --- |
| `mix-blend-mode: normal` | UA 默认给 old/new 加 `plus-lighter`（为交叉淡入服务）。做滑动时两层重叠区域会异常发亮 |
| `z-index: 1` 分方向给不同层 | 前进时新页在上、后退时旧页在上，否则滑动方向与遮挡关系矛盾，看起来像页面穿模 |
| 桌面端 `animation: none` | 只写移动端媒体查询不够——`startViewTransition` 在桌面端照样执行，会退回 UA 默认全页交叉淡入，等于凭空多出一个桌面端动效 |
| 只动 `transform` / `opacity` | 性能基线 |

### 为什么桌面端必须排除

1. `src/app/app-shell.css:113-126` 里 `.app-frame--focused` 在 `min-width: 48rem` 会把 `max-width` 从 `70rem` 收到 `var(--content-max)`（42rem），转场期间整个外框会跟着变形。
2. VT 伪元素挂在根节点上，**不受 `.app-frame` 的 `overflow: hidden` 裁剪**，`translateX(100%)` 会直接飞出圆角容器。
3. `src/ui/ui.css:107-111` 显示本仓库对 Dialog 就是这么处理的——桌面端刻意保持硬切。保持一致。

## Repo conventions to follow

- **不要新增缓动或时长魔数。** `200ms` 取自 `src/ui/ui.css:52` 的 Segmented Control 指示器；`cubic-bezier(.22, 1, .36, 1)` 取自 `src/ui/ui.css:64` 的 Dialog 进入曲线。`DESIGN.md:153` 已把「动画时长与 Reduced Motion 覆盖不完全一致」列为已知问题，本次不得加剧。
- **减少动态走硬切，不做「温和版本」。** 参考 `src/ui/ui.css:79-87` 与 `src/features/plans/plans.css:15`，本仓库统一用 `animation: none` / `transition: none`。
- **移动优先的动效立场。** 参考 `src/ui/ui.css:107-111`（Dialog 桌面端禁用进退场）。
- **不要给 `.bottom-navigation` 加 `view-transition-name`。** 让它随旧页面整体滑走，语义正好是「编辑页盖住了一切」。单独命名会让导航条脱离页面独立飘动。
- 不新增任何依赖。`react-router-dom@7.18.1` 原生支持 `viewTransition`。

## Steps

### 1. 支持性验证（前置闸门，未通过就停）

在目标浏览器的 DevTools Console 执行：

```js
typeof document.startViewTransition
```

- 返回 `'function'` → 继续第 2 步。
- 返回 `'undefined'` → **停下并报告**。不要改用 `@starting-style` 或其他方案自行发挥；单向进入动画是另一个独立决策，需要人来拍板。

### 2. 新建方向标记模块

新建 `src/router/nav-direction.ts`：

```ts
export type NavDirection = 'forward' | 'back'

/** 在跳转前标记方向，供 app-shell.css 的 view-transition 规则选择动画。 */
export function markNavDirection(direction: NavDirection) {
  document.documentElement.dataset.nav = direction
}
```

不需要清除标记：它只在 view transition 进行中被 CSS 读取，静止时完全惰性，并会被下一次导航覆盖。

在 `src/router/index.ts` 中按该文件现有的导出风格补上转发。

### 3. 写入转场样式

把 Target 里的整段 CSS 追加到 `src/app/app-shell.css` 末尾。选这个文件是因为它是 shell 级样式表，而这些伪元素是文档根级、跨 `plans` 与 `dashboard` 两个 feature 生效。

### 4. 改造 4 个前进入口

`src/features/plans/PlanPages.tsx:95`、`:109`、`:145` 与 `src/pages/ShellPages.tsx:259`，每处加 `viewTransition` 属性与 `onClick`：

```tsx
<Link
  aria-label="新建计划"
  className="round-action"
  onClick={() => markNavDirection('forward')}
  to="/plans/new"
  viewTransition
>
```

两个文件都需要 `import { markNavDirection } from '../../router'`（`ShellPages.tsx` 里是 `'../router'`），按各文件现有 import 排序插入。

### 5. 改造 4 个后退出口

`src/features/plans/PlanPages.tsx:340`（返回箭头）同上，方向传 `'back'`。

`:258` 与 `:328` 的两处 `navigate`：

```tsx
markNavDirection('back')
navigate('/plans', { replace: true, viewTransition: true })
```

`:388` 的「丢弃修改」：

```tsx
onClick={() => {
  allowNavigation.current = true
  markNavDirection('back')
  blocker.proceed?.()
}}
```

注意 `blocker.proceed()` 不接受 `viewTransition` 选项——它恢复的是被拦截的原始导航。若该原始导航来自已改造的返回箭头，转场应当被带过去；这一点无法从代码判断，放到验证环节确认。**若实测没有转场，接受降级为即时切换，不要为它单独加一套机制。**

### 6. 同步文档

更新 `DESIGN.md:77` 那一行，把「无 / 无」改成本方案的实际参数（200ms、`cubic-bezier(.22, 1, .36, 1)`、仅移动端、含 reduced-motion 硬切），并补上新增的文件路径。

## Boundaries

- Do NOT 给 `.bottom-navigation`、`.plan-card`、`.plan-editor-header` 或任何具体元素加 `view-transition-name`。本次只做根级整页推送。
- Do NOT 给编辑页加 `@starting-style` 入场动画。那是独立的一条（Loading→表单入场），会与 VT 快照叠加冲突；如果之后要做，需用 `:root:not(:active-view-transition)` 之类的方式隔离。
- Do NOT 改动路由结构、`route-model.ts` 的 shell 归类、数据加载或 `useBlocker` 逻辑。
- Do NOT 给 `/training/*`、`/history/*`、底部导航四个 tab 加转场。底部导航是每天数十次以上的高频操作，加转场会让主干导航变慢。
- Do NOT 新增依赖，Do NOT 新增缓动或时长数值。
- 若某一步与 commit `234c73c` 的代码对不上（文件已漂移），STOP 并报告，不要即兴发挥。

## Verification

- **Mechanical**: 取得用户明确许可后运行 `npm run lint` 与 `npm run build`，两者都必须以 0 退出。
- **Feel check**（必须在移动视口或真机，桌面视口看不到本动效）：
  - 从 `/plans` 点「编辑计划」，确认编辑页**从右侧推入**、列表页同时向左退让并略微变暗，底部导航随列表一起滑走而不是原地消失。
  - 点返回箭头，确认编辑页**向右滑出**、列表页从左侧回到原位——路径与进入完全对称。
  - 分别验证保存关闭、删除关闭、「丢弃修改」离开三条出口，确认都走后退方向；若「丢弃修改」无转场，记录下来并接受降级。
  - 从首页当日训练卡的编辑入口进入，确认同样是前进方向。
  - DevTools Animations 面板调到 10% 速度，确认：两层**没有异常发亮的重叠区域**（`mix-blend-mode` 生效）、遮挡关系正确（前进时编辑页在上，后退时编辑页在上）。
  - **200ms 是否偏仓促只能在真机上判断。** 若全屏推送在手机上显得急促，把四个 `@keyframes` 的时长统一提到 `240ms` 再试一次，并把最终取值回填到 `DESIGN.md`。
  - 浏览器返回键与 iOS 侧滑返回是否命中转场，代码层面无法确认——逐个实测，无转场则记录为已知降级。
  - 桌面视口（≥48rem）重复上述进出，确认**完全没有动效**，`.app-frame` 圆角容器内没有任何内容飞出边界。
  - Rendering 面板开启 `prefers-reduced-motion: reduce`，确认进出变为即时切换，且导航、焦点、数据均正常。
- **Done when**: 移动端进出编辑页为对称的 200ms 水平推送，桌面端与减少动态模式均为即时切换，8 个跳转点方向标记正确（`blocker.proceed()` 一处允许降级），`DESIGN.md:77` 已更新。
