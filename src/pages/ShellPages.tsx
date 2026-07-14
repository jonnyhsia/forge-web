import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Card, Progress, StatePanel } from '../ui/primitives'
import { Icon } from '../ui/Icon'
import './shell-pages.css'

function Page({ eyebrow, title, action, children }: { eyebrow?: string; title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="page">
      <header className="page-header">
        <div>
          {eyebrow ? <p className="page-eyebrow">{eyebrow}</p> : null}
          <h1>{title}</h1>
        </div>
        {action}
      </header>
      <div className="page-body">{children}</div>
    </div>
  )
}

function BackHeader({ to, label, title }: { to: string; label: string; title: string }) {
  return (
    <header className="focused-header">
      <Link aria-label={label} className="back-link" to={to}><Icon name="arrow-left" size={18} /></Link>
      <div><p>{label}</p><h1>{title}</h1></div>
    </header>
  )
}

export function DashboardPage() {
  return (
    <Page eyebrow="LOCAL TRAINING" title="FORGE">
      <Card className="hero-card">
        <p className="hero-card__label">今日训练</p>
        <h2>训练空间已就绪</h2>
        <p>日程与今日进度将在 Dashboard 切片接入。</p>
        <Progress label="本周进度" value={0} />
      </Card>
      <StatePanel kind="empty" title="今天还没有训练安排" description="创建训练计划后，今天的训练会显示在这里。" />
    </Page>
  )
}

export function PlansPage() {
  return (
    <Page action={<Link aria-label="新建计划" className="round-action" to="/plans/new"><Icon name="plus" size={18} /></Link>} title="训练计划">
      <StatePanel
        action={<Link className="ui-button ui-button--primary" to="/plans/new"><Icon name="plus" size={17} />新建训练计划</Link>}
        description="建立第一个计划，安排每周训练。"
        kind="empty"
        title="暂无训练计划"
      />
    </Page>
  )
}

export function PlanCreatePage() {
  return <FocusedPlaceholder backTo="/plans" eyebrow="返回计划" title="新建计划" description="计划与动作表单将在 T05 接入此页面壳。" />
}

export function PlanDetailPage() {
  const { planId } = useParams()
  return <FocusedPlaceholder backTo="/plans" eyebrow="返回计划" title="编辑计划" description={`计划 ${planId ?? ''} 的编辑表单将在 T05 接入。`} />
}

export function HistoryPage() {
  return (
    <Page title="记录">
      <RecordSegments active="history" />
      <StatePanel kind="empty" title="暂无训练记录" description="完成第一场训练后，记录会显示在这里。" />
    </Page>
  )
}

export function HistoryDetailPage() {
  const { sessionId } = useParams()
  return <FocusedPlaceholder backTo="/history" eyebrow="返回记录" title="训练详情" description={`会话 ${sessionId ?? ''} 的完成快照将在 T09 接入。`} />
}

export function StatisticsPage() {
  return (
    <Page title="记录">
      <RecordSegments active="statistics" />
      <StatePanel kind="empty" title="暂无统计数据" description="完成训练后，这里将展示训练频率、连续训练和个人最佳。" />
    </Page>
  )
}

export function SettingsPage() {
  return (
    <Page title="设置">
      <Card className="settings-preview">
        <div><span>本地用户</span><strong>训练者</strong></div>
        <div><span>数据模式</span><strong>本地优先</strong></div>
      </Card>
      <StatePanel kind="empty" title="设置壳已就绪" description="单位、提醒与同步状态将在后续切片接入。" />
    </Page>
  )
}

export function TrainingStartPage() {
  return <TrainingShell title="准备训练" description="选择计划并创建训练会话后，将进入全屏训练执行。" />
}

export function TrainingSessionPage() {
  const { sessionId } = useParams()
  return <TrainingShell title="训练进行中" description={`会话 ${sessionId ?? ''} 的状态机将在 T06 接入。`} />
}

export function NotFoundPage() {
  return (
    <div className="focused-page">
      <StatePanel action={<Link className="ui-button ui-button--primary" to="/">返回首页</Link>} description="这个地址不存在，或页面已经移动。" kind="not-found" title="找不到页面" />
    </div>
  )
}

export function RouteErrorPage() {
  return (
    <div className="focused-page">
      <StatePanel action={<Link className="ui-button ui-button--primary" to="/">返回首页</Link>} description="页面暂时无法显示，请返回首页后重试。" kind="error" title="页面加载失败" />
    </div>
  )
}

function FocusedPlaceholder({ backTo, eyebrow, title, description }: { backTo: string; eyebrow: string; title: string; description: string }) {
  return (
    <div className="focused-page">
      <BackHeader label={eyebrow} title={title} to={backTo} />
      <StatePanel description={description} kind="empty" title="页面壳已就绪" />
    </div>
  )
}

function TrainingShell({ title, description }: { title: string; description: string }) {
  return (
    <div className="training-shell">
      <BackHeader label="退出训练" title={title} to="/" />
      <div className="training-shell__stage">
        <span className="training-shell__ring"><span>0%</span></span>
        <StatePanel description={description} kind="empty" title="训练壳已就绪" />
      </div>
    </div>
  )
}

function RecordSegments({ active }: { active: 'history' | 'statistics' }) {
  return (
    <nav aria-label="记录类型" className="segments">
      <Link aria-current={active === 'history' ? 'page' : undefined} className={active === 'history' ? 'segments__active' : ''} to="/history">训练记录</Link>
      <Link aria-current={active === 'statistics' ? 'page' : undefined} className={active === 'statistics' ? 'segments__active' : ''} to="/statistics">数据统计</Link>
    </nav>
  )
}
