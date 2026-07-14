import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Button, Card, Progress, StatePanel } from '../ui/primitives'
import { Icon } from '../ui/Icon'
import { useForgeStore } from '../store'
import {
  dashboardWeekRange,
  rollingEightWeekRange,
  type DashboardDay,
  type DashboardDayStatus,
  type DashboardOccurrence,
  type StatisticsCache,
  type WorkoutSession,
} from '../domain'
import {
  browserReminderScheduler,
  browserReminderService,
  trainingReminderSchedule,
  type NotificationCapability,
} from '../notifications'
import './shell-pages.css'
import './dashboard.css'

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
  const [searchParams, setSearchParams] = useSearchParams()
  const dashboard = useForgeStore((state) => state.dashboard)
  const online = useForgeStore((state) => state.online)
  const pendingSyncCount = useForgeStore((state) => state.pendingSyncCount)
  const loadDashboard = useForgeStore((state) => state.loadDashboard)
  const rebuildStatistics = useForgeStore((state) => state.rebuildStatistics)
  const settings = useForgeStore((state) => state.settings.value)
  const [reminderMessage, setReminderMessage] = useState<string | null>(null)
  const requestedDate = searchParams.get('date')
  const focusDate = isLocalDate(requestedDate) ? requestedDate : localDate()
  const range = dashboardWeekRange(dateFromLocalDate(focusDate))
  const selectedDate =
    focusDate >= range.start && focusDate <= range.end ? focusDate : range.today
  const dayRefs = useRef<Record<string, HTMLElement | null>>({})

  useEffect(() => {
    let current = true
    void (async () => {
      await rebuildStatistics(rollingEightWeekRange())
      if (current) {
        await loadDashboard({
          start: range.start,
          end: range.end,
          today: range.today,
        })
      }
    })()
    return () => {
      current = false
    }
  }, [loadDashboard, range.end, range.start, range.today, rebuildStatistics])

  const selectDate = (nextDate: string) => {
    setSearchParams(nextDate === range.today ? {} : { date: nextDate })
    dayRefs.current[nextDate]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const snapshot = dashboard.value

  useEffect(() => {
    browserReminderScheduler.cancelAll()
    if (!snapshot || !settings?.trainingReminderEnabled) return

    for (const reminder of trainingReminderSchedule(
      snapshot,
      settings.reminderLeadMinutes,
    )) {
      browserReminderScheduler.schedule(reminder, (message) => {
        setReminderMessage(browserReminderService.deliver(message).inAppMessage)
      })
    }

  }, [settings?.reminderLeadMinutes, settings?.trainingReminderEnabled, snapshot])
  const totalOccurrences = snapshot?.days.reduce(
    (count, day) => count + day.occurrences.length,
    0,
  ) ?? 0
  const completedOccurrences = snapshot?.days.reduce(
    (count, day) =>
      count + day.occurrences.filter((item) => item.status === 'completed').length,
    0,
  ) ?? 0

  return (
    <Page
      action={pendingSyncCount > 0 ? <span className="dashboard-sync-count">{pendingSyncCount} 项待同步</span> : null}
      eyebrow="LOCAL TRAINING"
      title="FORGE"
    >
      {!online || pendingSyncCount > 0 ? (
        <div className="dashboard-connectivity" role="status">
          {!online ? <span><Icon name="cloud-off" size={15} />离线模式，本地训练仍可使用</span> : null}
          {pendingSyncCount > 0 ? <span>{pendingSyncCount} 项更改等待同步</span> : null}
        </div>
      ) : null}
      {reminderMessage ? (
        <div className="dashboard-reminder" role="status">
          <Icon name="alert" size={15} />
          <span>{reminderMessage}</span>
        </div>
      ) : null}

      <Card className="hero-card dashboard-hero">
        <p className="hero-card__label">本周训练</p>
        <h2>{completedOccurrences} / {totalOccurrences}</h2>
        <p>{totalOccurrences === 0 ? '本周暂无训练安排' : `${completedOccurrences} 场已完成，保持节奏。`}</p>
        <Progress label="本周进度" value={totalOccurrences ? completedOccurrences / totalOccurrences * 100 : 0} />
      </Card>

      <nav aria-label="本周日历" className="week-calendar">
        {snapshot?.days.map((day) => (
          <button
            aria-current={day.localDate === selectedDate ? 'date' : undefined}
            className={`week-calendar__day week-calendar__day--${day.status}`}
            key={day.localDate}
            onClick={() => selectDate(day.localDate)}
          >
            <span>{weekdayLabel(day.weekday)}</span>
            <strong>{Number(day.localDate.slice(-2))}</strong>
            <i aria-label={dayStatusLabel(day.status)} />
          </button>
        ))}
      </nav>

      {dashboard.status === 'loading' && !snapshot ? (
        <StatePanel kind="loading" title="整理本周训练" description="正在从本地计划和会话派生日程。" />
      ) : dashboard.status === 'error' && !snapshot ? (
        <StatePanel kind="error" title="日程读取失败" description={dashboard.error?.message ?? '请稍后重试。'} />
      ) : snapshot ? (
        <>
          {dashboard.status === 'error' ? <p className="dashboard-stale" role="status">本次日程更新失败，正在显示最近的本地数据。</p> : null}
          <div className="dashboard-timeline">
            {snapshot.days.map((day) => (
              <DashboardDaySection
                day={day}
                isToday={day.localDate === range.today}
                key={day.localDate}
                sectionRef={(node) => { dayRefs.current[day.localDate] = node }}
              />
            ))}
          </div>
        </>
      ) : null}

      {snapshot ? (
        <RecentWorkoutCard
          session={snapshot.recentWorkout}
          weeklyCount={snapshot.statistics?.summary.weeklyWorkoutCount}
          streakDays={snapshot.statistics?.summary.streakDays}
        />
      ) : null}
    </Page>
  )
}

function DashboardDaySection({
  day,
  isToday,
  sectionRef,
}: {
  day: DashboardDay
  isToday: boolean
  sectionRef: (node: HTMLElement | null) => void
}) {
  const completed = day.occurrences.filter((item) => item.status === 'completed').length
  return (
    <section className="dashboard-day" ref={sectionRef}>
      <header className={isToday ? 'dashboard-day__header dashboard-day__header--today' : 'dashboard-day__header'}>
        <strong>{isToday ? 'TODAY' : weekdayLabel(day.weekday)}</strong>
        <span>{formatLocalDate(day.localDate)}</span>
        <i />
        <small>{day.occurrences.length ? `${completed}/${day.occurrences.length} · ${dayStatusLabel(day.status)}` : dayStatusLabel(day.status)}</small>
      </header>
      {day.occurrences.length ? (
        <div className="dashboard-occurrences">
          {day.occurrences.map((occurrence) => <DashboardWorkoutCard key={occurrence.key} occurrence={occurrence} />)}
        </div>
      ) : (
        <div className="dashboard-rest"><span>REST DAY</span><small>好好恢复</small></div>
      )}
    </section>
  )
}

function DashboardWorkoutCard({ occurrence }: { occurrence: DashboardOccurrence }) {
  const progress = occurrence.totalExercises
    ? occurrence.completedExercises / occurrence.totalExercises * 100
    : 0
  const category = categoryLabel(occurrence.category)
  const status = occurrenceStatusLabel(occurrence.status)
  const destination = occurrence.status === 'planned'
    ? `/training/start?planId=${encodeURIComponent(occurrence.planId)}&localDate=${occurrence.localDate}`
    : occurrence.status === 'completed'
      ? `/history/${occurrence.sessionId}`
      : `/training/${occurrence.sessionId}`

  return (
    <article className={`dashboard-workout dashboard-workout--${occurrence.status}`}>
      <div className="dashboard-workout__time">{occurrence.localTime ?? '灵活'}</div>
      <Card className="dashboard-workout__card">
        <header>
          <div><strong>{occurrence.planName}</strong><small>{category}</small></div>
          <span>{status}</span>
        </header>
        {occurrence.totalExercises > 0 ? (
          <Progress label={`${occurrence.completedExercises} / ${occurrence.totalExercises} 个动作`} value={progress} />
        ) : null}
        <div className="dashboard-workout__actions">
          {occurrence.status === 'planned' ? <Link to={`/plans/${occurrence.planId}`}>编辑计划</Link> : <span />}
          <Link className="ui-button ui-button--primary" to={destination}>
            {occurrence.status === 'planned' ? '开始训练' : occurrence.status === 'in_progress' ? '继续训练' : '查看记录'}
          </Link>
        </div>
      </Card>
    </article>
  )
}

function RecentWorkoutCard({
  session,
  weeklyCount,
  streakDays,
}: {
  session: WorkoutSession | null
  weeklyCount?: number
  streakDays?: number
}) {
  if (!session) {
    return <StatePanel kind="empty" title="暂无最近训练" description="完成第一场训练后，这里会显示训练摘要。" />
  }
  const sets = session.exercises.reduce((count, exercise) => count + exercise.sets.length, 0)
  return (
    <Card className="recent-workout">
      <header><div><p>最近训练</p><h2>{session.planName}</h2></div><Link to={`/history/${session.id}`}>查看详情</Link></header>
      <p>{formatDateTime(session.endedAt)}</p>
      <div>
        <span><strong>{sets}</strong><small>完成组数</small></span>
        <span><strong>{workoutMinutes(session)}</strong><small>训练分钟</small></span>
        <span><strong>{weeklyCount ?? '—'}</strong><small>本周场次</small></span>
        <span><strong>{streakDays ?? '—'}</strong><small>连续天数</small></span>
      </div>
    </Card>
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
  const [searchParams, setSearchParams] = useSearchParams()
  const statistics = useForgeStore((state) => state.statistics)
  const online = useForgeStore((state) => state.online)
  const rebuildStatistics = useForgeStore((state) => state.rebuildStatistics)
  const scope = searchParams.get('scope') === 'remote' ? 'remote' : 'cached'
  const cache = statistics.value.find((item) => item.scope === scope)

  useEffect(() => {
    void rebuildStatistics(rollingEightWeekRange())
  }, [rebuildStatistics])

  const selectScope = (nextScope: StatisticsCache['scope']) => {
    setSearchParams(nextScope === 'remote' ? { scope: 'remote' } : {})
  }

  return (
    <Page title="记录">
      <RecordSegments active="statistics" />
      <div aria-label="统计来源" className="statistics-scope">
        <button aria-pressed={scope === 'cached'} onClick={() => selectScope('cached')}>当前缓存</button>
        <button aria-pressed={scope === 'remote'} onClick={() => selectScope('remote')}>服务端最新</button>
      </div>
      {statistics.status === 'loading' && !cache ? (
        <StatePanel kind="loading" title="计算训练统计" description="正在从完成历史重建本地缓存。" />
      ) : statistics.status === 'error' && !cache ? (
        <StatePanel kind="error" title="统计读取失败" description={statistics.error?.message ?? '请稍后重试。'} />
      ) : !cache ? (
        <StatePanel
          kind={scope === 'remote' && !online ? 'offline' : 'empty'}
          title={scope === 'remote' ? '暂无服务端统计' : '暂无统计缓存'}
          description={scope === 'remote'
            ? online ? '服务端统计将在同步能力接入后显示；当前可切回本地缓存。' : '当前离线，无法读取服务端最新统计；可切回本地缓存。'
            : '完成训练后，这里会从本地历史生成统计。'}
        />
      ) : (
        <StatisticsContent cache={cache} stale={statistics.status === 'error'} />
      )}
    </Page>
  )
}

function StatisticsContent({ cache, stale }: { cache: StatisticsCache; stale: boolean }) {
  const summary = cache.summary
  const maxTrend = Math.max(...summary.weeklyTrend.map((item) => item.workoutCount), 1)

  return (
    <div className="statistics-content">
      <p className="statistics-cache-meta">
        {cache.source === 'history' ? '本地历史缓存' : '服务端统计'} · {formatDate(cache.rangeStart)}–{formatDate(cache.rangeEnd)} · 更新于 {formatDateTime(cache.generatedAt)}
        {stale ? ' · 本次更新失败，显示最近缓存' : ''}
      </p>
      {summary.workoutCount === 0 ? (
        <StatePanel kind="empty" title="暂无统计数据" description="缓存范围内还没有已完成训练。" />
      ) : (
        <>
          <div className="statistics-summary">
            <StatisticMetric label="本月训练" value={summary.monthlyWorkoutCount} unit="次" />
            <StatisticMetric label="本周训练" value={summary.weeklyWorkoutCount} unit="次" />
            <StatisticMetric label="连续打卡" value={summary.streakDays} unit="天" />
          </div>
          <Card className="statistics-trend">
            <p className="statistics-label">训练频率</p>
            <h2>近 8 周</h2>
            <div aria-label="近 8 周训练次数" className="statistics-chart">
              {summary.weeklyTrend.map((item) => (
                <div className="statistics-chart__week" key={item.weekStart}>
                  <span className="statistics-chart__count">{item.workoutCount}</span>
                  <span className="statistics-chart__bar" style={{ height: `${item.workoutCount / maxTrend * 100}%` }} />
                  <small>{formatWeek(item.weekStart)}</small>
                </div>
              ))}
            </div>
          </Card>
          <Card className="statistics-prs">
            <header><p className="statistics-label">个人最佳</p></header>
            {summary.personalRecords.length === 0 ? (
              <p className="statistics-empty-row">尚无外加重量 PR</p>
            ) : summary.personalRecords.map((record) => (
              <div className="statistics-pr" key={record.exerciseId}>
                <strong>{record.exerciseName}</strong>
                <span><b>{formatNumber(record.weightKg)} kg</b><small>{formatDate(record.achievedAt)}</small></span>
              </div>
            ))}
          </Card>
          <Card className="statistics-volume">
            <p className="statistics-label">本月总训练量</p>
            <strong>{formatNumber(summary.trainingVolumeKg)}</strong>
            <span>kg</span>
          </Card>
        </>
      )}
    </div>
  )
}

function StatisticMetric({ label, value, unit }: { label: string; value: number; unit: string }) {
  return <Card className="statistics-metric"><span>{label}</span><strong>{value}</strong><small>{unit}</small></Card>
}

export function SettingsPage() {
  const settings = useForgeStore((state) => state.settings)
  const plans = useForgeStore((state) => state.plans.items)
  const loadSettings = useForgeStore((state) => state.loadSettings)
  const updateSettings = useForgeStore((state) => state.updateSettings)
  const [pending, setPending] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const capability = browserReminderService.inspect()

  useEffect(() => {
    if (
      !settings.value ||
      settings.status === 'loading' ||
      settings.value.notificationPermission === capability.permission
    ) {
      return
    }
    void updateSettings({ notificationPermission: capability.permission }).catch(
      () => setSaveError('通知状态暂时无法保存；站内提醒仍可使用。'),
    )
  }, [capability.permission, settings.status, settings.value, updateSettings])

  if (!settings.value) {
    return (
      <Page title="设置">
        <StatePanel
          action={settings.status === 'error' ? <Button onClick={() => void loadSettings()}>重试</Button> : undefined}
          description={settings.status === 'error' ? '本地设置暂时无法读取，请重试。' : '正在读取本地训练偏好。'}
          kind={settings.status === 'error' ? 'error' : 'loading'}
          title={settings.status === 'error' ? '无法读取设置' : '正在加载设置'}
        />
      </Page>
    )
  }

  const value = settings.value
  const hasTimedPlan = plans.some(
    (plan) => plan.status === 'active' && !plan.deletedAt && Boolean(plan.localTime),
  )

  const save = async (
    key: string,
    patch: Parameters<typeof updateSettings>[0],
  ) => {
    setPending(key)
    setSaveError(null)
    try {
      await updateSettings(patch)
      if (key === 'reminderLeadMinutes') browserReminderScheduler.cancelAll()
    } catch {
      setSaveError('设置保存失败，请重试。')
    } finally {
      setPending(null)
    }
  }

  const toggleReminder = async (
    key: 'trainingReminderEnabled' | 'restReminderEnabled',
  ) => {
    const enabled = !value[key]
    if (!enabled) {
      if (key === 'trainingReminderEnabled') browserReminderScheduler.cancelAll()
      await save(key, { [key]: false })
      return
    }

    setPending(key)
    setSaveError(null)
    try {
      const permission = await browserReminderService.requestPermission()
      await updateSettings({ [key]: true, notificationPermission: permission })
    } catch {
      setSaveError('提醒设置保存失败；站内计时仍可继续使用。')
    } finally {
      setPending(null)
    }
  }

  return (
    <Page title="设置">
      <Card className="settings-profile">
        <span aria-hidden="true"><Icon name="settings" size={22} /></span>
        <div><strong>训练者</strong><small>Forge 本地用户</small></div>
      </Card>

      <section className="settings-section" aria-labelledby="training-preferences-title">
        <h2 id="training-preferences-title">训练偏好</h2>
        <Card className="settings-list">
          <div className="settings-row">
            <div><strong>默认重量单位</strong><small>仅影响新建目标与编辑控件，不改写历史记录。</small></div>
            <div aria-label="默认重量单位" className="settings-unit" role="group">
              {(['kg', 'lb'] as const).map((unit) => (
                <button
                  aria-pressed={value.defaultWeightUnit === unit}
                  disabled={pending !== null}
                  key={unit}
                  onClick={() => void save('defaultWeightUnit', { defaultWeightUnit: unit })}
                  type="button"
                >
                  {unit === 'lb' ? 'lbs' : 'kg'}
                </button>
              ))}
            </div>
          </div>
          <ReminderToggle
            checked={value.trainingReminderEnabled}
            description="按计划时间提前提醒；无计划时间时不调度。"
            disabled={pending !== null}
            label="训练提醒"
            onChange={() => void toggleReminder('trainingReminderEnabled')}
          />
          <div className="settings-row">
            <label htmlFor="reminder-lead"><strong>提前提醒</strong><small>仅用于设置了本地训练时间的计划。</small></label>
            <select
              disabled={pending !== null || !value.trainingReminderEnabled}
              id="reminder-lead"
              onChange={(event) => void save('reminderLeadMinutes', { reminderLeadMinutes: Number(event.target.value) })}
              value={value.reminderLeadMinutes}
            >
              {[0, 5, 10, 15, 30, 60].map((minutes) => <option key={minutes} value={minutes}>{minutes === 0 ? '准时' : `${minutes} 分钟`}</option>)}
            </select>
          </div>
          <ReminderToggle
            checked={value.restReminderEnabled}
            description="组间休息到点后补充系统通知。"
            disabled={pending !== null}
            label="休息提醒"
            onChange={() => void toggleReminder('restReminderEnabled')}
          />
        </Card>
      </section>

      <section className="settings-section" aria-labelledby="notification-status-title">
        <h2 id="notification-status-title">通知状态</h2>
        <Card className={`settings-notification settings-notification--${capability.permission}`}>
          <strong>{notificationStatusTitle(capability)}</strong>
          <p>{notificationStatusDescription(capability)}</p>
          {value.trainingReminderEnabled && !hasTimedPlan ? <p>当前计划未设置训练时间，无法调度训练提醒；训练流程不受影响。</p> : null}
          <small>系统通知仅作增强；Forge 打开时始终保留站内提醒。</small>
        </Card>
      </section>

      {saveError ? <p className="settings-error" role="alert">{saveError}</p> : null}
    </Page>
  )
}

function ReminderToggle({ label, description, checked, disabled, onChange }: { label: string; description: string; checked: boolean; disabled: boolean; onChange: () => void }) {
  return (
    <div className="settings-row">
      <div><strong>{label}</strong><small>{description}</small></div>
      <button
        aria-checked={checked}
        aria-label={label}
        className="settings-switch"
        disabled={disabled}
        onClick={onChange}
        role="switch"
        type="button"
      ><span /></button>
    </div>
  )
}

function notificationStatusTitle(capability: NotificationCapability) {
  if (capability.permission === 'granted') return '系统通知已允许'
  if (capability.permission === 'denied') return '系统通知已被拒绝'
  if (capability.reason === 'ios_requires_install') return 'iOS 需要先添加到主屏'
  if (capability.permission === 'unsupported') return '此环境不支持系统通知'
  return '尚未请求系统通知'
}

function notificationStatusDescription(capability: NotificationCapability) {
  if (capability.permission === 'granted') return '训练与休息提醒可补充系统通知。'
  if (capability.permission === 'denied') return '可前往浏览器或系统设置恢复权限；当前仅使用站内提醒。'
  if (capability.reason === 'ios_requires_install') return 'iPhone 或 iPad 需将 Forge 添加到主屏，并由主屏图标启动后才能申请通知；当前仅使用站内提醒。'
  if (capability.permission === 'unsupported') return '当前浏览器无法提供 Notification API，仅使用站内提醒。'
  return '只有在你明确开启训练或休息提醒时，Forge 才会申请系统权限。'
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-TW', { month: '2-digit', day: '2-digit' }).format(new Date(value))
}

function formatWeek(localDate: string) {
  const [, month, day] = localDate.split('-')
  return `${Number(month)}/${Number(day)}`
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 2 }).format(value)
}

function isLocalDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  return localDate(dateFromLocalDate(value)) === value
}

function localDate(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function dateFromLocalDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day, 12)
}

function weekdayLabel(weekday: DashboardDay['weekday']) {
  return ['一', '二', '三', '四', '五', '六', '日'][weekday - 1]
}

function formatLocalDate(value: string) {
  const [, month, day] = value.split('-')
  return `${Number(month)}月${Number(day)}日`
}

function dayStatusLabel(status: DashboardDayStatus) {
  return {
    rest: '休息',
    planned: '计划中',
    in_progress: '进行中',
    partially_completed: '部分完成',
    completed: '已完成',
  }[status]
}

function occurrenceStatusLabel(status: DashboardOccurrence['status']) {
  return {
    planned: '计划中',
    in_progress: '进行中',
    completed: '已完成',
  }[status]
}

function categoryLabel(category: DashboardOccurrence['category']) {
  if (!category) return '训练'
  return {
    strength: '力量训练',
    cardio: '有氧训练',
    mobility: '拉伸放松',
  }[category]
}

function workoutMinutes(session: WorkoutSession) {
  if (!session.startedAt || !session.endedAt) return '—'
  return Math.max(
    1,
    Math.round(
      (new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()) /
        60_000,
    ),
  )
}

function formatSet(set: import('../domain').WorkoutSetResult) {
  if (set.skipped) return '已跳过'
  if ('durationSeconds' in set) return `${set.durationSeconds} 秒`
  const weight = set.weight.mode === 'bodyweight' && set.weight.value === undefined
    ? '体重'
    : `${set.weight.mode === 'bodyweight' ? '+' : ''}${set.weight.value}${set.weight.unit}`
  return `${weight} × ${set.repetitions} 次`
}
