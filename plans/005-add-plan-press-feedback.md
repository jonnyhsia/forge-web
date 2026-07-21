# 005 — 统一计划页按压反馈

- **Status**: DONE
- **Commit**: 4dc4014
- **Severity**: MEDIUM
- **Category**: Physicality & origin
- **Estimated scope**: 2 files, about 15 lines

## Problem

`src/features/plans/PlanPages.tsx:95,116,133` 有三个主要点击面：

```tsx
<Link aria-label="新建计划" className="round-action" to="/plans/new">...</Link>
<button aria-expanded={open} className="plan-card__summary" onClick={() => togglePlan(plan.id)}>
<Link className="plan-edit-link" to={`/plans/${plan.id}`}>编辑计划...</Link>
```

对应的 `src/pages/shell-pages.css:11-14` 与 `src/features/plans/plans.css:1` 只有静态/焦点样式，没有按压反馈。相比之下，仓库共享按钮在 `src/ui/ui.css:13,17` 已建立 scale(.98) 语言：

```css
transition: transform var(--motion-fast), background var(--motion-fast), border-color var(--motion-fast);
.ui-button:active:not(:disabled) { transform: scale(.98); }
```

## Target

三个点击面统一使用 `transform 140ms cubic-bezier(0.23, 1, 0.32, 1)`，按下时缩放到 `.98`。计划卡 summary 同时使用轻微背景反馈，使减少动态模式即使取消 transform 仍有状态反馈。

```css
.round-action,
.plan-card__summary,
.plan-edit-link {
  transition:
    transform var(--motion-fast) cubic-bezier(0.23, 1, 0.32, 1),
    background-color var(--motion-fast) ease,
    color var(--motion-fast) ease;
}

.round-action:active,
.plan-card__summary:active,
.plan-edit-link:active { transform: scale(.98); }

.plan-card__summary:active { background-color: rgb(255 255 255 / 4%); }
```

## Repo conventions to follow

- scale `.98` 与 `src/ui/ui.css:17` 完全一致。
- 140ms 来自 `src/design-system/tokens.css:96`，处于按钮反馈 100–160ms 预算内。
- 进入/按压反馈使用审查规范的强 ease-out `cubic-bezier(0.23, 1, 0.32, 1)`；颜色变化使用 `ease`。

## Steps

1. 在 `src/pages/shell-pages.css` 给 `.round-action` 增加 Target 的 transform/background/color transition，并增加 `.round-action:active { transform: scale(.98); }`。不要影响 `.back-link`。
2. 在 `src/features/plans/plans.css` 给 `.plan-card__summary` 与 `.plan-edit-link` 增加同样的 transition 和 active scale；summary active 时增加 `rgb(255 255 255 / 4%)` 背景。
3. 在 `@media (prefers-reduced-motion: reduce)` 中令这三个元素的 active transform 为 none；summary 的背景反馈必须保留。
4. 不添加 hover scale。该页面是触控优先界面，hover motion 会提高高频噪声。

## Boundaries

- Do NOT change hit areas, navigation, focus-visible outlines, disabled behavior, or DOM structure.
- Do NOT add hover animation, bounce, sound, or haptics.
- Do NOT scale below .98.
- Do NOT add dependencies.
- If a step doesn't match commit `4dc4014`, STOP and report instead of improvising.

## Verification

- **Mechanical**: after explicit user permission, run `npm run lint`; it must exit 0.
- **Feel check**:分别按住“新建计划”、计划卡 summary 与“编辑计划”；反馈应在 140ms 内完成，释放后立即回到 1。连续快速点击计划卡时 transform 必须从当前状态重定向，不得排队或弹跳。
- Toggle `prefers-reduced-motion: reduce`; confirm there is no scale movement and the summary still shows its subtle pressed background.
- **Done when**: 三个点击面拥有一致的轻微按压感，键盘 focus 样式不变，且没有新增 hover motion。
