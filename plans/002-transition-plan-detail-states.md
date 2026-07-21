# 002 — 过渡计划详情加载状态

- **Status**: DONE
- **Commit**: 4dc4014
- **Severity**: MEDIUM
- **Category**: Missed opportunities
- **Estimated scope**: 2 files, about 30 lines

## Problem

`src/features/plans/PlanPages.tsx:122-135` 直接用条件渲染把“正在读取动作…”替换为错误态、空态或完整动作列表：

```tsx
{detail?.status === 'loading' || !detail ? <p className="plan-inline-state">正在读取动作…</p> : detail.status === 'error' ? (
  <div className="plan-inline-error">...</div>
) : detail.value ? (
  <>
    {detail.value.exercises.length === 0 ? <p className="plan-inline-state">尚未添加动作</p> : (
      <ol className="plan-exercise-summary">...</ol>
    )}
    <Link className="plan-edit-link" ...>编辑计划...</Link>
  </>
) : null}
```

`src/features/plans/plans.css:1` 的 `.plan-inline-state`、`.plan-inline-error` 与 `.plan-exercise-summary` 均没有进入过渡，数据返回时视觉内容瞬时出现。

## Target

为 loading、error、empty、ready 四种内容提供统一 wrapper，并在每次 phase 改变时重新挂载。新状态以 180ms 强 ease-out 进入：从 `opacity: 0`、`transform: translateY(-4px)`、`filter: blur(2px)` 过渡到正常值。使用 CSS transition + `@starting-style`，不使用 keyframes。

```css
.plan-card__detail-state {
  opacity: 1;
  transform: translateY(0);
  filter: blur(0);
  transition:
    opacity 180ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 180ms cubic-bezier(0.23, 1, 0.32, 1),
    filter 180ms cubic-bezier(0.23, 1, 0.32, 1);
}

@starting-style {
  .plan-card__detail-state {
    opacity: 0;
    transform: translateY(-4px);
    filter: blur(2px);
  }
}
```

## Repo conventions to follow

- 页面动效保留在 `src/features/plans/plans.css`；不要把局部动画放进 JSX style。
- `src/ui/ui.css:64` 已使用强 ease-out 风格处理进入动效；本计划使用审查规范的精确曲线 `cubic-bezier(0.23, 1, 0.32, 1)`。
- 180ms 位于小型状态切换的 125–200ms 预算内。

## Steps

1. 在 `PlansPage` 的 map 回调中计算 `detailPhase`，值只能是 `'loading' | 'error' | 'empty' | 'ready'`；没有 detail 或 loading 为 loading，有 error 为 error，ready 且 exercises 为空为 empty，其余为 ready。
2. 保留现有文本、按钮、列表和链接逻辑，将整个条件渲染包在 `<div className="plan-card__detail-state" key={detailPhase}>` 内。不要给列表项逐项 stagger。
3. 在 `src/features/plans/plans.css` 添加 Target 中的 transition 和 `@starting-style`。
4. 在 `@media (prefers-reduced-motion: reduce)` 中令 `.plan-card__detail-state` 的 `transform` 与 `filter` 始终为 none，并保留 `opacity 180ms ease`；减少动态模式仍应提供状态变化反馈。

## Boundaries

- Do NOT change fetch timing, error handling, retry behavior, list semantics, or link destinations.
- Do NOT animate height/width or add stagger to exercise rows.
- Do NOT add dependencies or keyframes.
- If `@starting-style` is unsupported, the acceptable fallback is immediate content; do not add JavaScript timers.
- If a step doesn't match commit `4dc4014`, STOP and report instead of improvising.

## Verification

- **Mechanical**: after explicit user permission, run `npm run lint` and `npm run build`; both must exit 0.
- **Feel check**: clear or use an uncached plan detail, expand it, and confirm loading text is replaced by the result with one crisp 180ms entrance. In 10% playback, blur must never exceed 2px and the old/new content must not remain double-exposed.
- Toggle `prefers-reduced-motion: reduce`; confirm only opacity changes and there is no vertical movement or blur.
- **Done when**: all four phases share the same transition contract, rapid close/reopen does not leave stale content, and interaction is never blocked by animation.
