# 004 — 用 transform 驱动周进度条

- **Status**: DONE
- **Commit**: 4dc4014
- **Severity**: MEDIUM
- **Category**: Performance
- **Estimated scope**: 2 files, about 8 lines

## Problem

`src/ui/primitives.tsx:409-416` 通过内联 width 表达进度：

```tsx
<span className="ui-progress__value" style={{ width: `${normalized}%` }} />
```

`src/ui/ui.css:96` 再对 width 做 transition：

```css
.ui-progress__value { display: block; height: 100%; border-radius: inherit; background: var(--color-accent); box-shadow: 0 0 10px rgb(192 255 0 / 45%); transition: width var(--motion-fast); }
```

width 动画会触发布局与绘制；计划页的 `WeeklyTrainingSummary` 在数据加载完成时直接触发该路径。

## Target

进度值元素始终占满 track 宽度，只通过以左侧为原点的 `scaleX(normalized / 100)` 表示进度。过渡只包含 transform，时长沿用 140ms token，曲线使用强 ease-out。

```tsx
<span
  className="ui-progress__value"
  style={{ transform: `scaleX(${normalized / 100})` }}
/>
```

```css
.ui-progress__value {
  width: 100%;
  transform-origin: left center;
  transition: transform var(--motion-fast) cubic-bezier(0.23, 1, 0.32, 1);
}
```

## Repo conventions to follow

- `src/design-system/tokens.css:96` 定义 `--motion-fast: 140ms`，并在减少动态时设为 0ms。
- `src/ui/ui.css:13` 已使用 transform transition 作为共享控件的性能优先模式。
- 进度为 0 时 `scaleX(0)` 表示真实的零值，不是元素从无到有的入场动画，因此不适用 popover 的“禁止 scale(0)”规则。

## Steps

1. 在 `src/ui/primitives.tsx:415` 将内联 `width` 改为完整 `transform: scaleX(...)` 字符串；normalized 仍保持 0–100 clamp 和现有 ARIA 数值。
2. 在 `src/ui/ui.css:96` 为 value 添加 `width: 100%` 与 `transform-origin: left center`，把 transition property 从 width 改为 transform，并使用 `cubic-bezier(0.23, 1, 0.32, 1)`。
3. 不修改 track 的 overflow、圆角、颜色或 glow。

## Boundaries

- Do NOT animate width, clip-path, box-shadow, or CSS custom properties.
- Do NOT change Progress public props or ARIA semantics.
- Do NOT add dependencies.
- If a step doesn't match commit `4dc4014`, STOP and report instead of improvising.

## Verification

- **Mechanical**: after explicit user permission, run `npm run lint` and `npm run build`; both must exit 0.
- **Feel check**:在 `/plans` 观察周进度从 0 到非零的更新；填充必须从左向右变化，140ms 内结束。用 Performance 面板确认动画期间没有由 value width 引起的 Layout 事件。
- Toggle `prefers-reduced-motion: reduce` and confirm the bar snaps to the correct value with no travel.
- **Done when**: 0%、中间值、100% 的视觉宽度与 `aria-valuenow` 一致，且 transition property 只有 transform。
