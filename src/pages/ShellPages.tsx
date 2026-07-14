import { useEffect, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Card, Progress, StatePanel } from '../ui/primitives'
import { Icon } from '../ui/Icon'
import { useForgeStore } from '../store'
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

export function HistoryPage() {
  const history = useForgeStore((state) => state.history)
  const loadHistory = useForgeStore((state) => state.loadHistory)

  useEffect(() => {
    void loadHistory({ reset: true })
  }, [loadHistory])

  return (
    <Page title="记录">
      <RecordSegments active="history" />
      {history.status === 'loading' && history.items.length === 0 ? (
        <StatePanel kind="loading" title="读取训练记录" description="正在读取本地完成快照。" />
      ) : history.status === 'error' ? (
        <StatePanel kind="error" title="记录读取失败" description={history.error?.message ?? '请重试。'} />
      ) : history.items.length === 0 ? (
        <StatePanel kind="empty" title="暂无训练记录" description="完成第一场训练后，记录会显示在这里。" />
      ) : (
        <div className="history-list">
          {history.items.map((session) => (
            <Link className="history-card" key={session.id} to={`/history/${session.id}`}>
              <span>
                <strong>{session.planName}</strong>
                <small>{formatDateTime(session.endedAt)}</small>
              </span>
              <span className="history-card__meta">
                <small>{session.exercises.reduce((count, exercise) => count + exercise.sets.length, 0)} 组</small>
                <Icon name="chevron-right" size={14} />
              </span>
            </Link>
          ))}
          {history.nextCursor ? <button className="ui-button ui-button--secondary" onClick={() => void loadHistory()}>加载更多</button> : null}
        </div>
      )}
    </Page>
  )
}

export function HistoryDetailPage() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const resource = useForgeStore((state) => sessionId ? state.historyDetails[sessionId] : undefined)
  const loadHistoryDetail = useForgeStore((state) => state.loadHistoryDetail)

  useEffect(() => {
    if (sessionId) void loadHistoryDetail(sessionId)
  }, [loadHistoryDetail, sessionId])

  if (!sessionId || resource?.status === 'error') {
    return <FocusedPlaceholder backTo="/history" eyebrow="返回记录" title="训练详情" description={resource?.error?.message ?? '缺少训练记录编号。'} />
  }
  if (resource?.status !== 'ready' || !resource.value) {
    return <div className="focused-page"><StatePanel kind="loading" title="读取训练详情" description="正在读取完成快照。" /></div>
  }

  const session = resource.value
  return (
    <div className="focused-page">
      <BackHeader label="返回记录" title="训练详情" to="/history" />
      <div className="history-detail">
        <Card className="history-detail__hero">
          <p className="page-eyebrow">COMPLETED WORKOUT</p>
          <h2>{session.planName}</h2>
          <p>{formatDateTime(session.endedAt)} · {session.exercises.reduce((count, exercise) => count + exercise.sets.length, 0)} 组</p>
        </Card>
        {session.exercises.map((exercise) => (
          <Card className="history-detail__exercise" key={exercise.id}>
            <div className="history-detail__heading"><strong>{exercise.exercise.name}</strong><span>{exercise.sets.length} / {exercise.target.targetSets} 组</span></div>
            {exercise.sets.map((set) => (
              <div className="history-detail__set" key={set.id}>
                <span>第 {set.setNumber} 组</span>
                <strong>{formatSet(set)}</strong>
              </div>
            ))}
          </Card>
        ))}
        <button className="ui-button ui-button--secondary" onClick={() => navigate('/history')}>返回历史记录</button>
      </div>
    </div>
  )
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

function RecordSegments({ active }: { active: 'history' | 'statistics' }) {
  return (
    <nav aria-label="记录类型" className="segments">
      <Link aria-current={active === 'history' ? 'page' : undefined} className={active === 'history' ? 'segments__active' : ''} to="/history">训练记录</Link>
      <Link aria-current={active === 'statistics' ? 'page' : undefined} className={active === 'statistics' ? 'segments__active' : ''} to="/statistics">数据统计</Link>
    </nav>
  )
}

function formatDateTime(value?: string) {
  return value ? new Intl.DateTimeFormat('zh-TW', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '时间未知'
}

function formatSet(set: import('../domain').WorkoutSetResult) {
  if (set.skipped) return '已跳过'
  if ('durationSeconds' in set) return `${set.durationSeconds} 秒`
  const weight = set.weight.mode === 'bodyweight' && set.weight.value === undefined
    ? '体重'
    : `${set.weight.mode === 'bodyweight' ? '+' : ''}${set.weight.value}${set.weight.unit}`
  return `${weight} × ${set.repetitions} 次`
}
