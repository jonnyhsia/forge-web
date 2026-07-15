# Design Guidelines 1.0

> 本文档基于当前项目代码整理，用于指导后续页面和组件开发。

基线：`main` 分支，提交 `2ecd6e4`。项目使用 React + 原生 CSS，未使用 Tailwind 或第三方 UI 组件库。全局设计 Token 位于 `src/design-system/tokens.css`，基础组件位于 `src/ui`。本文只总结当前已形成的高频模式，不把单页特例提升为全局规范。

## 1. 颜色

项目采用单一深色主题：近黑画布与多层深灰容器，荧光黄绿色作为主要操作、激活和完成状态色。颜色优先来自 CSS 变量；局部透明强调色和遮罩色仍有较多硬编码。

| 名称或 Token | 实际值 | 用途 | 来源文件 |
| --- | --- | --- | --- |
| `--color-canvas` | `#030303` | 浏览器外层画布、页面最底层背景、全局径向渐变底色 | `src/design-system/tokens.css`、`src/index.css` |
| `--color-background` | `#0d0d0d` | App Shell、页面基础背景、训练与编辑器内部底色；同时作为 PWA theme/background color | `src/design-system/tokens.css`、`src/app/app-shell.css`、`vite.config.ts`、`index.html` |
| `--color-surface` | `#161616` | Card、Dialog、Alert、导航型容器及普通浮层 | `src/design-system/tokens.css`、`src/ui/ui.css` |
| `--color-surface-raised` | `#1a1a1a` | Input、Icon Button、分段控件、局部控制面板等抬升层 | `src/design-system/tokens.css`、`src/ui/ui.css` |
| `--color-surface-muted` | `#1e1e1e` | 已定义的更高层级深灰 Surface；当前抽样代码中未形成稳定共享用法，不作为新页面首选 | `src/design-system/tokens.css` |
| `--color-text` | `#f0f0f0` | 主要文字、标题、默认控件文字 | `src/design-system/tokens.css` |
| `--color-text-muted` | `#8a8a8a` | 次要说明、元数据、非激活控件文字 | `src/design-system/tokens.css`、各页面样式 |
| `--color-text-faint` | `#555` | 更弱层级文字、未激活导航、拖拽手柄和弱提示 | `src/design-system/tokens.css`、`src/app/app-shell.css`、`src/features/plans/plans.css` |
| `--color-border` | `rgb(255 255 255 / 8%)` | 默认边框、分隔线、Card 与表单分组边界 | `src/design-system/tokens.css`、`src/ui/ui.css` |
| `--color-border-strong` | `rgb(255 255 255 / 16%)` | 强边框、未完成进度、Switch 底色及更明确的控件边界 | `src/design-system/tokens.css`、`src/features/training/training.css`、`src/pages/shell-pages.css` |
| `--color-accent` | `#c0ff00` | 主要按钮、激活导航、选中状态、进度、重点数字和品牌标题 | `src/design-system/tokens.css`、`src/ui/ui.css`、各页面样式 |
| `--color-on-accent` | `#0a0a0a` | 强调色背景上的文字与图标 | `src/design-system/tokens.css`、`src/ui/ui.css` |
| 成功 / 完成状态（无独立 Token） | `var(--color-accent)` / `#c0ff00` | 已完成训练、已授权通知、PWA 离线就绪等正向状态 | `src/pages/dashboard.css`、`src/pages/shell-pages.css`、`src/pwa/pwa-notices.css` |
| `--color-warning` | `#f4c95d` | 离线、同步提醒、部分完成和需要注意的状态 | `src/design-system/tokens.css`、`src/app/app-shell.css`、`src/pages/dashboard.css` |
| 警告背景（硬编码） | `rgb(244 201 93 / 12%)` | 顶部离线 / 网络恢复提示条 | `src/app/app-shell.css` |
| `--color-danger` | `#ef6a6a` | 删除、错误、校验失败和危险操作 | `src/design-system/tokens.css`、`src/ui/ui.css` |
| `--color-danger-muted` | `rgb(239 106 106 / 12%)` | Danger Button、错误提示块和删除 Hover 背景 | `src/design-system/tokens.css`、`src/ui/ui.css`、`src/features/plans/plan-editor-enhancements.css` |
| `--color-focus` | `rgb(192 255 0 / 55%)` | 键盘焦点轮廓 | `src/design-system/tokens.css`、各组件样式 |
| 强调色透明派生（无 Token） | 常见为 `rgb(192 255 0 / 8%–45%)` | 提醒底色、状态 Badge、强调边框和局部 Glow | `src/pages/dashboard.css`、`src/features/plans/plans.css`、`src/features/training/training.css`、`src/pwa/pwa-notices.css` |
| 遮罩与半透明深色（无 Token） | `rgb(0 0 0 / 68%)`、`rgb(13 13 13 / 82%)`、`rgb(13 13 13 / 94%)` | Modal Backdrop、暂停遮罩、底部导航、Sticky 区域和编辑器操作栏 | `src/ui/ui.css`、`src/app/app-shell.css`、`src/features/training/training.css`、`src/pages/dashboard.css` |

使用规则：

| 规则 | 要求 |
| --- | --- |
| 使用 Token | 新页面先使用现有颜色变量，不直接复制十六进制值 |
| 成功语义 | 当前没有独立 Success Token；“完成 / 成功”沿用 `--color-accent`，不要另建近似绿色 |
| 透明派生色 | 优先复用同语义已有透明度，避免继续增加相近 Alpha 值 |
| Surface 层级 | `--color-surface` 用于主要容器，`--color-surface-raised` 用于容器内控件或抬升层，不要反转层级 |

## 2. 圆角

| 圆角值或 Class | 使用场景 | 来源文件 |
| --- | --- | --- |
| `--radius-sm: 0.625rem`（10px） | Select、小型按钮、NumberStepper 输入态等紧凑控件 | `src/design-system/tokens.css`、`src/ui/ui.css`、`src/pages/shell-pages.css` |
| `--radius-md: 0.75rem`（12px） | Button、Input、Segmented Control、历史记录卡片、列表项和多数局部控件 | `src/design-system/tokens.css`、`src/ui/ui.css`、`src/pages/shell-pages.css` |
| `--radius-lg: 1rem`（16px） | 通用 `Card`、计划编辑分组、周日历、StatePanel 图标容器 | `src/design-system/tokens.css`、`src/ui/ui.css`、`src/features/plans/plans.css`、`src/pages/dashboard.css` |
| `--radius-xl: 1.5rem`（24px） | Dialog、Alert、桌面 App Frame；移动端 Dialog 仅顶部两角使用 | `src/design-system/tokens.css`、`src/ui/ui.css`、`src/app/app-shell.css` |
| `--radius-round: 999px` | 圆形图标按钮、Badge、Switch、Progress、胶囊状态 | `src/design-system/tokens.css`、`src/ui/ui.css`、各页面样式 |
| `50%`（硬编码） | Weekday 按钮、NumberStepper 加减按钮、训练完成标记等严格圆形元素 | `src/ui/ui.css`、`src/features/plans/plans.css`、`src/features/training/training.css` |
| `.65rem` / `.5rem`（局部硬编码） | Compact Segmented Control 的外框和指示器 | `src/ui/ui.css` |

当前主流规则是：普通控件使用 `--radius-md`，通用卡片使用 `--radius-lg`，浮层使用 `--radius-xl`，圆形或胶囊元素使用 `--radius-round`。历史记录卡片、Dashboard Rest Row、Exercise List 等卡片化容器仍使用 `--radius-md`，属于现有例外。

## 3. 动画

> 当前项目尚未形成统一动画规范。

项目已有全局快速时长 `--motion-fast: 140ms`，并在 `prefers-reduced-motion: reduce` 下设为 `0ms`；但 Segmented Control、Dialog、数字滚动和 Loading 使用各自的参数。

| 动画场景 | Duration | Easing | 实现方式 | 来源文件 |
| --- | ---: | --- | --- | --- |
| Button 按压、底部导航、Progress、计划展开箭头 | `140ms` | 未显式设置，使用 CSS 默认 `ease` | `transition`；按钮 Active 时 `scale(.98)`，其余切换颜色、背景、宽度或旋转 | `src/design-system/tokens.css`、`src/ui/ui.css`、`src/app/app-shell.css`、`src/features/plans/plans.css` |
| Input Focus / 校验状态 | 无 | 无 | Border 与 Outline 直接切换，当前未设置输入框过渡 | `src/ui/ui.css`、`src/features/plans/plans.css` |
| 计划删除按钮 Hover | 未定义 | 未定义 | 仅切换为 `--color-danger-muted`，当前没有独立过渡 | `src/features/plans/plan-editor-enhancements.css` |
| Settings Reminder 展开 / 收起 | `140ms` | `ease`；Visibility 使用延迟 | `grid-template-rows`、`opacity`、`visibility` 组合 | `src/pages/shell-pages.css` |
| Settings Switch | `160ms` | `ease` | Thumb `transform` 与 `background-color` 过渡 | `src/pages/shell-pages.css` |
| Segmented Control 指示器 | `200ms` | `cubic-bezier(.22, 1, .36, 1)` | 指示器 `transform` / `width`；文字颜色另用 `160ms ease-out` | `src/ui/ui.css` |
| Dialog 移动端进入 / 退出 | `180ms` | 进入：`cubic-bezier(.22, 1, .36, 1)`；退出：`cubic-bezier(.64, 0, .78, 0)`；Backdrop 为 `ease-out/ease-in` | Bottom Sheet `translateY` + Backdrop Keyframes；桌面端禁用进退场动画 | `src/ui/primitives.tsx`、`src/ui/ui.css` |
| Alert 显示 / 关闭 | 无 | 无 | 直接挂载 / 卸载，当前没有进退场 Keyframes | `src/ui/primitives.tsx`、`src/ui/ui.css` |
| AnimatedNumber | 透明度 `350ms`；旋转 / 位移 `750ms` | `ease-out`；`cubic-bezier(.22, 1, .36, 1)` | `@number-flow/react` timing props | `src/ui/primitives.tsx` |
| 目标重量“自重 / 数字”切换 | 基础 `140ms`；显示自重时延迟 `180ms`、时长 `750ms` | `ease-out` | 两层内容交叉淡入淡出 | `src/features/plans/plan-editor-enhancements.css` |
| Loading Spinner | `800ms`，无限循环 | `linear` | `@keyframes ui-spin` 旋转 | `src/ui/ui.css` |
| Dashboard 日期跳转 | 浏览器控制，未定义固定时长 | 浏览器控制 | `scrollIntoView({ behavior: 'smooth' })` | `src/pages/ShellPages.tsx` |
| 页面路由切换 | 无 | 无 | React Router 直接替换页面，未设置页面级 Transition | `src/router/router.tsx` |

Reduced Motion 当前覆盖 `--motion-fast`、Segmented Control、Dialog 和目标重量切换。`AnimatedNumber` 在项目代码层未显式接入 Reduced Motion 分支；新增动画应至少提供同等降级。当前没有通用 Dropdown 或 Drawer 组件，因此也没有对应的共享展开动画。

## 4. 可复用 UI 组件

基础组件集中在 `src/ui`。开发新页面时，应优先复用下表组件，再考虑新增抽象。

| 组件 | 路径 | 主要用途 | Variants / Sizes | 备注 |
| --- | --- | --- | --- | --- |
| `Button` | `src/ui/primitives.tsx` | 页面主操作、次操作、弱操作和危险操作 | Variants：`primary`、`secondary`、`ghost`、`danger`；支持 `fullWidth`、`leadingIcon`；无 Size Prop | 新增按钮优先使用。Router Link 目前常直接复用 `.ui-button` class，项目尚无通用 LinkButton |
| `Card` | `src/ui/primitives.tsx` | 通用分组容器和内容卡片 | 无 Variant / Size | 默认 `--radius-lg`。部分页面仍手写相似容器，应避免再增加新的 Card 实现 |
| `Field` | `src/ui/primitives.tsx` | 带 Label、Hint、Error 的单行 Input | 继承原生 Input 属性；无 Variant / Size | 适合文本与数字输入。Select、Textarea、Time Input 目前仍由页面自行实现 |
| `SegmentedControl` | `src/ui/primitives.tsx` | 少量互斥选项切换 | Sizes：`default`、`compact`；支持 `disabled`、隐藏可视 Label | 设置页已复用；记录页 `.segments`、统计范围按钮仍是重复实现 |
| `NumberStepper` | `src/ui/primitives.tsx` | 数值加减、直接输入和格式化显示 | `min`、`max`、`step`、`fractionDigits`、`renderValue`；无命名 Size | 计划编辑器已复用。训练页另有局部 `NumberControl`，新页面不应创建第三套实现 |
| `AnimatedNumber` | `src/ui/primitives.tsx` | 指标、进度数字和数值控件的滚动过渡 | `fractionDigits`、`prefix`、`suffix` | 适合数据变化反馈；动画参数固定为组件内部配置 |
| `Dialog` | `src/ui/primitives.tsx` | 一般弹窗、表单弹层和移动端 Bottom Sheet | 无 Variant / Size；支持 `actions`、`className`、`onAfterClose` | 移动端底部弹出、桌面居中。当前没有独立 Drawer 组件 |
| `Alert` | `src/ui/primitives.tsx` | 需要确认 / 取消的警示对话框 | `confirmVariant` 复用 Button Variant；支持 `pending` | 训练提前结束与完成确认已使用。计划删除仍使用普通 `Dialog`，确认模式尚未完全统一 |
| `Progress` | `src/ui/primitives.tsx` | 百分比进度条，可选 Label | 无 Variant / Size | Dashboard 与 Training 共用；默认使用 Accent 色 |
| `StatePanel` | `src/ui/primitives.tsx` | Empty、Loading、Error、Offline、Not Found 状态 | Kinds：`empty`、`loading`、`error`、`offline`、`not-found` | 项目中的 Empty State 与 Loading 统一入口；新页面不应另写同类整页状态 |
| `Icon` | `src/ui/Icon.tsx` | 内置线性 SVG 图标 | `name`、`size`，并继承 SVG 属性 | 使用 `currentColor`；新增页面优先使用现有图标名，避免内联重复 SVG |

另外存在 `Page`、`BackHeader`、`RecordSegments`、`ReminderToggle`、`TrainingHeader`、`NumberControl` 等文件内局部组件。它们当前不是全局基础组件，不应在设计规范中视为已稳定的公共 API。

当前没有通用 `Form`、`Select`、`Textarea`、`Table`、`Tabs`、`Badge`、`Tooltip`、`Toast`、`Pagination`、`Switch` 或独立 `Drawer`。不要在代码中假设这些组件已经存在；遇到新需求时先组合现有组件，并仅在多个页面形成稳定重复后抽象。

开发新页面时的复用顺序：

| 优先级 | 类别 | 首选组件 |
| ---: | --- | --- |
| 1 | 操作与容器 | `Button`、`Card`、`Icon` |
| 2 | 表单与选择 | `Field`、`SegmentedControl`、`NumberStepper` |
| 3 | 浮层与确认 | `Dialog`、`Alert` |
| 4 | 状态与反馈 | `StatePanel`、`Progress`、`AnimatedNumber` |

## 5. 布局规范

项目以移动端 PWA 为主。`html/body/#root` 固定为视口高度并隐藏外层滚动，滚动发生在页面内部内容区；所有主要页面均处理 Safe Area。

| 布局项 | 当前主流规则 | 来源文件 |
| --- | --- | --- |
| 最小视口 | `320px`；`html`、`body` 使用 `100vh` + `100dvh`，外层 `overflow: hidden` | `src/index.css` |
| App Frame | 移动端占满视口；`>= 48rem` 时最大宽度 `70rem`、上下外边距 `1.5rem`、高度为视口减 `3rem`、圆角 `--radius-xl` | `src/app/app-shell.css` |
| 主内容最大宽度 | `--content-max: 42rem`（672px）；`.app-content`、底部导航和 PWA Notice 均受此限制 | `src/design-system/tokens.css`、`src/app/app-shell.css`、`src/pwa/pwa-notices.css` |
| Standard 页面水平留白 | 移动端 `max(--space-5, safe-area)`，即至少 `1.25rem`；`>= 48rem` 为 `--space-8`，即 `2rem` | `src/pages/shell-pages.css` |
| Focused 页面水平留白 | 移动端至少 `--space-5`（1.25rem），顶部通常 `--space-4`（1rem）；`>= 48rem` 水平为 `--space-8` | `src/pages/shell-pages.css`、`src/features/plans/plans.css`、`src/features/training/training.css` |
| Header 高度 | 标准页、计划列表和计划编辑 Header 以 `min-height: 3.5rem` 为主；左 / 右操作使用 `--touch-target: 2.75rem` | `src/pages/shell-pages.css`、`src/features/plans/plans.css`、`src/design-system/tokens.css` |
| Sidebar | 当前没有 Sidebar；主导航为 4 列底部导航 | `src/app/AppShell.tsx`、`src/app/app-shell.css` |
| 底部导航 | 高度至少 `4rem + safe-area-inset-bottom`；移动端固定底部并保留同高 Placeholder；`>= 48rem` 改为静态布局 | `src/app/app-shell.css` |
| 主内容滚动区 | `.page-body`、`.focused-page`、`.plan-editor-body`、Plan List 等内部区域负责滚动；均使用 `overscroll-behavior: contain` | `src/pages/shell-pages.css`、`src/app/app-shell.css`、`src/features/plans/plans.css` |
| 页面标题区 | 标准 `Page` 由 Header + 可选 Fixed Content + Scroll Body 组成；Eyebrow 页使用 Display Font 和 Accent 标题 | `src/pages/ShellPages.tsx`、`src/pages/shell-pages.css` |
| 卡片与列表间距 | 页面主体默认 `gap: --space-4`（1rem）；多数列表 `--space-3`（0.75rem）；Dashboard Timeline 使用 `--space-6`（1.5rem） | `src/pages/shell-pages.css`、`src/features/plans/plans.css`、`src/pages/dashboard.css` |
| 表单宽度 | 表单与输入默认占满内容宽度；计划基础信息使用 2 列等宽 Grid，在 `<= 34rem` 时改为单列 | `src/features/plans/plans.css` |
| Dialog 宽度 | 通用移动端宽度至 `--content-max`、最大高度 `88svh`；桌面居中。Exercise Dialog 移动端全宽，桌面最大 `30rem` | `src/ui/ui.css`、`src/features/plans/plan-editor-enhancements.css` |
| 常用 Grid | 周日历 7 列；统计摘要 3 列；最近训练摘要 4 列并在 `<= 24rem` 变为 2 列；训练数值控件 2 列 | `src/pages/dashboard.css`、`src/pages/shell-pages.css`、`src/features/training/training.css` |
| 响应式断点 | 主断点 `48rem`；局部断点为 `24rem`、`30rem`、`34rem`。移动端上限常写为 `47.999rem` | `src/app/app-shell.css`、`src/ui/ui.css`、各页面样式 |
| 移动端适配 | 使用 `env(safe-area-inset-*)`、`100dvh`、固定底部导航 Placeholder、内部滚动和小屏 Grid 降列 | `src/index.css`、`src/app/app-shell.css`、各页面样式 |

代表性页面依据：

| 页面 | 代表性依据 | 主要文件 |
| --- | --- | --- |
| `DashboardPage` | 标准页、Sticky 周日历、时间线与多类 Card | `src/pages/ShellPages.tsx`、`src/pages/dashboard.css` |
| `PlansPage` | 标准列表页、展开式 Card 和底部导航共存 | `src/features/plans/PlanPages.tsx`、`src/features/plans/plans.css` |
| `PlanEditorForm` | Focused 表单页、内部滚动、固定底部操作区和移动端 Dialog | `src/features/plans/PlanPages.tsx`、`src/features/plans/plan-editor-enhancements.css` |
| `TrainingSessionPage` | Focused 全屏任务流、Header、进度和暂停遮罩 | `src/features/training/TrainingPages.tsx`、`src/features/training/training.css` |
| `SettingsPage` | 标准页中的分组 Card、紧凑控件及窄屏纵向重排 | `src/pages/ShellPages.tsx`、`src/pages/shell-pages.css` |

## 6. 当前不一致项

| 问题 | 实际影响 | 当前主要做法与例外 |
| --- | --- | --- |
| 强调色透明派生未 Token 化 | 同一语义出现大量相近 Alpha，后续难以统一调整状态层级 | 主色统一为 `--color-accent`，但背景 / 边框散落使用约 `8%–45%` 的硬编码值 |
| Card-like 容器圆角分为 `--radius-lg` 与 `--radius-md` | 同类列表卡片和内容卡片的轮廓密度不一致 | 通用 `Card` 为 `--radius-lg`；History Card、Dashboard Rest、Exercise List 等使用 `--radius-md` |
| 同类控件存在重复实现 | 交互、无障碍和样式修改需要维护多处 | `NumberStepper` 与训练页 `NumberControl` 并存；`SegmentedControl` 与 `.segments` / `.statistics-scope` 并存；Link Button 也通过局部封装或直接 class 重复 |
| 页面容器由多套局部实现维护 | Header、Padding、滚动和 Safe Area 容易随页面增长产生漂移 | `Page` / `focused-page`、`plan-page` / `plan-editor-page`、`training-page` 分别实现；最大宽度一致，但 Padding 与滚动规则分散 |
| 动画时长与 Reduced Motion 覆盖不完全一致 | 新动画容易继续引入独立参数，且无障碍降级不统一 | 基础反馈用 `140ms`，其余存在 `160/180/200/350/750/800ms`；`AnimatedNumber` 在项目代码层没有显式 Reduced Motion 分支 |

## 7. 开发约束

| 约束 | 具体要求 |
| --- | --- |
| 优先复用现有 UI 组件 | 新页面先使用 `src/ui/primitives.tsx` 与 `src/ui/Icon.tsx`，不要复制组件后创建相似版本 |
| 优先使用已有颜色变量和主题 Token | 禁止在可由现有 Token 表达时新增十六进制颜色；透明派生色也应先复用同语义现有值 |
| 控制新增设计参数 | 不新增无明确用途、无跨页面复用价值的颜色、圆角或动画参数 |
| 遵循现有页面类型 | 标准导航页参考 `DashboardPage` / `SettingsPage`；编辑与训练流程参考 `PlanEditorForm` / `TrainingSessionPage` |
| 保持内容宽度和留白 | 主内容继续使用 `--content-max`；移动端保留 Safe Area，桌面主断点沿用 `48rem` |
| 保持滚动模型 | 不恢复 `body` 外层滚动；长内容放入当前页面的内部滚动区，并避免与固定底部导航重叠 |
| 避免第三套同类控件 | 数值输入优先 `NumberStepper`，互斥选择优先 `SegmentedControl`，整页状态优先 `StatePanel` |
| 动画必须可降级 | 优先使用 `--motion-fast`；新增独立动画时说明必要性，并处理 `prefers-reduced-motion` |
| 同步维护规范 | 新增并稳定复用于多个页面的设计模式后，应同步更新 `DESIGN.md` |
