# 001 — 平滑计划卡展开与收起

- **Status**: DONE (compatibility-adjusted)
- **Commit**: 4dc4014
- **Severity**: MEDIUM
- **Category**: Missed opportunities / Interruptibility
- **Estimated scope**: 3 files, about 45 lines

## Problem

`src/features/plans/PlanPages.tsx:85-89,120-137` 在切换 `expanded` 后直接挂载或卸载详情：

```tsx
const togglePlan = (planId: string) => {
  const next = expanded === planId ? null : planId
  setExpanded(next)
  if (next && !planDetails[next]) void loadPlan(next)
}

{open ? (
  <div className="plan-card__detail">
    {/* detail content */}
  </div>
) : null}
```

`src/features/plans/plans.css:1` 只旋转箭头，卡片高度和后续卡片位置瞬时跳变：

```css
.plan-card__chevron{color:var(--color-text-muted);transition:transform var(--motion-fast)}
.plan-card__detail{border-top:1px solid var(--color-border)}
```

## Target

使用始终挂载的 CSS grid shell 对详情区域做 180ms 展开/收起。`grid-template-rows` 在 `0fr` 与 `1fr` 之间过渡，opacity 同步以 140ms 强 ease-out 变化；CSS transition 可在快速反向操作时从当前状态重新定向。收起内容使用 `aria-hidden` 与 `inert`，用户开启减少动态时取消空间过渡。

```css
.plan-card__detail-shell {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  transition:
    grid-template-rows 180ms cubic-bezier(0.77, 0, 0.175, 1),
    opacity 140ms cubic-bezier(0.23, 1, 0.32, 1);
}

.plan-card__detail-shell--open {
  grid-template-rows: 1fr;
  opacity: 1;
}
```

运行时验证发现当前内置浏览器不支持稳定的 View Transitions 路径，因此最终实现采用范围受控的 grid 布局过渡，避免核心交互退化为即时跳变。

## Repo conventions to follow

- 动效时长入口位于 `src/design-system/tokens.css:96`，现有快速交互使用 `--motion-fast: 140ms`。
- `src/design-system/tokens.css:99-102` 已通过 `prefers-reduced-motion` 把快速动效时长降为 0ms。
- 180ms 属于偶发的卡片空间变化；曲线严格使用审查规范的 `cubic-bezier(0.77, 0, 0.175, 1)`。
- 不新增 motion 依赖或 JavaScript 动画调度。

## Steps

1. 在 `src/features/plans/PlanPages.tsx` 始终渲染 detail shell，根据 open 状态切换 `plan-card__detail-shell--open`。
2. 收起时设置 `aria-hidden={true}` 与 `inert={true}`，避免隐藏内容进入键盘或辅助技术导航。
3. 在 `src/features/plans/plans.css` 实现 Target 中的 grid/opacity transition，并让内部 detail 使用 `min-height: 0; overflow: hidden`。
4. 在 `@media (prefers-reduced-motion: reduce)` 中取消 shell transition。

## Boundaries

- Do NOT animate `height`, `max-height`, `width`, `top`, or `margin`; `grid-template-rows` is the single scoped compatibility exception.
- Do NOT change data loading, expanded-card exclusivity, or routing.
- Do NOT add dependencies or keyframes for the reversible toggle.
- If a step doesn't match commit `4dc4014`, STOP and report instead of improvising.

## Verification

- **Mechanical**: after explicit user permission, run `npm run lint` and `npm run build`; both must exit 0.
- **Feel check**: open `/plans`, expand and collapse a populated card, and confirm detail height and every following card move over 180ms rather than teleporting. Click repeatedly during the transition and confirm CSS retargets without queued motion.
- Toggle `prefers-reduced-motion: reduce` and confirm expansion is immediate while `aria-expanded`, `aria-hidden`, `inert` and content remain correct.
- **Done when**: normal模式下 shell 在 0fr/1fr 间平滑过渡，减少动态模式即时切换，隐藏内容不可聚焦。
