# Animation implementation plans

| # | Plan | Severity | Status | Depends on |
| --- | --- | --- | --- | --- |
| 003 | [让加载图标尊重减少动态](003-respect-reduced-motion-spinner.md) | MEDIUM | DONE | — |
| 004 | [用 transform 驱动周进度条](004-transform-progress-indicator.md) | MEDIUM | DONE | — |
| 005 | [统一计划页按压反馈](005-add-plan-press-feedback.md) | MEDIUM | DONE | — |
| 001 | [平滑计划卡展开与收起](001-animate-plan-card-expansion.md) | MEDIUM | DONE (compatibility-adjusted) | — |
| 002 | [过渡计划详情加载状态](002-transition-plan-detail-states.md) | MEDIUM | DONE | 001 recommended first |
| 006 | [计划编辑页水平推入/推出路由转场](006-push-transition-plan-editor-route.md) | MEDIUM | TODO | — |

## Recommended execution order

1. `003` — 最小且独立，先补齐无障碍基线。
2. `004` — 独立的性能修正，可快速验证。
3. `005` — 建立计划页统一按压反馈。
4. `001` — 实现卡片几何过渡与快速切换处理。
5. `002` — 在卡片空间过渡稳定后添加内容 phase 进入效果，避免调试时混淆两层动效。
6. `006` — 补上唯一缺失的层级转场。无代码依赖，但建议放在最后：它是根级动效，先让页面内部动效稳定下来，调试时才不会与页内过渡混淆。

`006` 有一个前置闸门：动手前必须先确认目标浏览器支持 `document.startViewTransition`。`001` 曾因运行时不支持 View Transitions 而改用 grid 过渡方案，同样的风险对 `006` 依然存在——区别是路由转场没有等效的纯 CSS 替代（React Router 会立刻卸载旧页面，拿不到退出动画），所以闸门未通过时应停下来让人决策，而不是自行改方案。

所有机械验证命令都必须在获得用户明确许可后运行。
