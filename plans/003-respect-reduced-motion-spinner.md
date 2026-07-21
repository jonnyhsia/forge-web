# 003 — 让加载图标尊重减少动态

- **Status**: DONE
- **Commit**: 4dc4014
- **Severity**: MEDIUM
- **Category**: Accessibility
- **Estimated scope**: 1 file, 3 lines

## Problem

`src/ui/ui.css:104-105` 让加载图标无限旋转：

```css
.ui-spin { animation: ui-spin 800ms linear infinite; }
@keyframes ui-spin { to { transform: rotate(360deg); } }
```

`src/ui/ui.css:77-84` 的减少动态规则只处理 segmented control 和 dialog，没有覆盖 `.ui-spin`。计划页首屏在 `src/features/plans/PlanPages.tsx:104-105` 使用 loading StatePanel，因此减少动态用户仍会看到持续旋转。

## Target

在现有减少动态媒体查询中仅停用旋转；保留加载文字、`role="status"` 与静态 spinner 图标作为反馈。

```css
@media (prefers-reduced-motion: reduce) {
  .ui-spin { animation: none; }
}
```

## Repo conventions to follow

- 必须扩展 `src/ui/ui.css:77` 已有的 `@media (prefers-reduced-motion: reduce)`，不要创建重复的相邻媒体查询。
- `src/ui/primitives.tsx:438-440` 已用 status role 和可见文案表达加载，不需要新增 ARIA 属性。

## Steps

1. 将 `.ui-spin { animation: none; }` 加入 `src/ui/ui.css:77-84` 的现有减少动态规则。
2. 不修改默认的 800ms linear spinner，也不修改 StatePanel JSX。

## Boundaries

- Do NOT remove the spinner element or loading text.
- Do NOT disable unrelated opacity/color feedback.
- Do NOT add dependencies.
- If a step doesn't match commit `4dc4014`, STOP and report instead of improvising.

## Verification

- **Mechanical**: after explicit user permission, run `npm run lint`; it must exit 0.
- **Feel check**:在 DevTools Rendering 中切换 `prefers-reduced-motion: reduce`，触发 `/plans` 首屏加载，确认图标静止但加载文案仍可见；恢复 no-preference 后确认图标继续以 800ms linear 旋转。
- **Done when**: 减少动态模式不存在无限旋转，默认模式和语义反馈不变。
