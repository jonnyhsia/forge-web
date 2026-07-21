import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  useBlocker,
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom'
import { DataError, toDataError } from '../../data'
import { createEntityId, type WeightValue } from '../../domain'
import { useForgeStore } from '../../store'
import { browserReminderService } from '../../notifications'
import { Icon } from '../../ui/Icon'
import { Alert, Button, Card, Dialog, Progress, StatePanel } from '../../ui/primitives'
import {
  createTrainingUiAdapter,
  type DurationSetInput,
  type DurationTrainingView,
  type RestTrainingView,
  type CompletedTrainingView,
  type UnavailableTrainingView,
  type RepetitionTrainingView,
  type TrainingDecision,
  type TrainingUiAdapter,
  type TrainingView,
} from './training-ui-adapter'
import './training.css'

function createStoreTrainingAdapter(): TrainingUiAdapter {
  return createTrainingUiAdapter({
    createId: createEntityId,
    gateway: {
      start: (input) => useForgeStore.getState().startWorkout(input),
      async get(sessionId) {
        await useForgeStore.getState().loadWorkout(sessionId)
        const resource = useForgeStore.getState().workouts
        if (resource.error) throw resource.error
        if (!resource.value || resource.value.id !== sessionId) {
          throw new DataError(
            'not_found',
            `Workout session ${sessionId} was not found`,
          )
        }
        return resource.value
      },
      transition: (sessionId, command) =>
        useForgeStore.getState().transitionWorkout(sessionId, command),
      completeSet: (command, idempotencyKey) =>
        useForgeStore
          .getState()
          .completeWorkoutSet(command, idempotencyKey),
      saveTimer: (sessionId, timer) =>
        useForgeStore.getState().saveWorkoutTimer(sessionId, timer),
    },
  })
}

export function TrainingStartPage() {
  const [adapter] = useState(createStoreTrainingAdapter)
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const activeSession = useForgeStore((state) => state.workouts.value)
  const [error, setError] = useState<string | null>(null)
  const planId = searchParams.get('planId')
  const localDate = searchParams.get('localDate')
  const parameterError =
    (!planId || !localDate) && !activeSession
      ? '缺少训练计划或训练日期，请从训练入口重新开始。'
      : null

  useEffect(() => {
    let current = true

    if (!planId || !localDate) {
      if (activeSession) {
        navigate(`/training/${activeSession.id}`, { replace: true })
      }
      return () => {
        current = false
      }
    }

    void adapter
      .open({ type: 'start', planId, localDate })
      .then((view) => {
        if (current) navigate(`/training/${view.sessionId}`, { replace: true })
      })
      .catch((cause: unknown) => {
        if (current) setError(toDataError(cause).message)
      })

    return () => {
      current = false
    }
  }, [activeSession, adapter, localDate, navigate, planId])

  return (
    <div className="training-page training-page--state">
      {error || parameterError ? (
        <StatePanel
          action={<Button onClick={() => navigate('/')}>返回首页</Button>}
          description={error ?? parameterError ?? ''}
          kind="error"
          title="无法开始训练"
        />
      ) : (
        <StatePanel
          description="正在创建或恢复今天的训练会话。"
          kind="loading"
          title="准备训练"
        />
      )}
    </div>
  )
}

type ExitDialog = 'choice' | 'cancel-confirm' | null

export function TrainingSessionPage() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const [adapter] = useState(createStoreTrainingAdapter)
  const [view, setView] = useState<TrainingView | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [exitDialog, setExitDialog] = useState<ExitDialog>(null)
  const [decisionPending, setDecisionPending] = useState(false)
  const [decisionError, setDecisionError] = useState<string | null>(null)
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      Boolean(
        view &&
          (view.sessionStatus === 'active' || view.sessionStatus === 'paused'),
      ) && currentLocation.pathname !== nextLocation.pathname,
  )

  const visibleExitDialog =
    exitDialog ?? (blocker.state === 'blocked' ? 'choice' : null)
  const routeError = sessionId ? null : '缺少训练会话编号。'

  useEffect(() => {
    let current = true
    if (!sessionId) return

    void adapter
      .open({ type: 'resume', sessionId })
      .then((nextView) => {
        if (current) setView(nextView)
      })
      .catch((cause: unknown) => {
        if (current) setLoadError(toDataError(cause).message)
      })

    return () => {
      current = false
    }
  }, [adapter, sessionId])

  const leaveAfterDecision = async (decision: TrainingDecision) => {
    if (!view) return
    setDecisionPending(true)
    setDecisionError(null)
    try {
      const outcome = await adapter.decide(view, decision)
      if (outcome.kind === 'stay') {
        setView(outcome.view)
        setExitDialog(null)
        if (blocker.state === 'blocked') blocker.reset()
      } else if (blocker.state === 'blocked') {
        blocker.proceed()
      } else {
        navigate('/', { replace: true })
      }
    } catch (cause) {
      setDecisionError(toDataError(cause).message)
      if (decision !== 'resume') setExitDialog('choice')
    } finally {
      setDecisionPending(false)
    }
  }

  const closeExitDialog = () => {
    setExitDialog(null)
    setDecisionError(null)
    if (blocker.state === 'blocked') blocker.reset()
  }

  if (loadError || routeError) {
    return (
      <div className="training-page training-page--state">
        <StatePanel
          action={<Button onClick={() => navigate('/')}>返回首页</Button>}
          description={loadError ?? routeError ?? ''}
          kind="error"
          title="无法恢复训练"
        />
      </div>
    )
  }
  if (!view) {
    return (
      <div className="training-page training-page--state">
        <StatePanel
          description="正在读取当前动作和已完成组。"
          kind="loading"
          title="恢复训练"
        />
      </div>
    )
  }

  return (
    <div className="training-page">
      <TrainingHeader
        onClose={() => navigate('/')}
        planName={view.planName}
        progress={view.kind === 'repetitions' ? view.progressPercent : 100}
        subtitle={
          view.kind === 'repetitions'
            ? `${view.exerciseNumber} / ${view.totalExercises}`
            : undefined
        }
      />

      {view.kind === 'repetitions' ? (
        <RepetitionWorkout
          adapter={adapter}
          key={view.exerciseResultId}
          onChange={setView}
          resumeError={decisionError}
          onResume={() => void leaveAfterDecision('resume')}
          view={view}
        />
      ) : view.kind === 'duration' ? (
        <DurationWorkout adapter={adapter} key={`${view.kind}:${view.exerciseResultId}:${view.activeSetNumber}:${view.sessionStatus}`} onChange={setView} onResume={() => void leaveAfterDecision('resume')} resumeError={decisionError} view={view} />
      ) : view.kind === 'rest' ? (
        <RestWorkout adapter={adapter} key={`${view.kind}:${view.exerciseResultId}:${view.activeSetNumber}:${view.sessionStatus}`} onChange={setView} onResume={() => void leaveAfterDecision('resume')} resumeError={decisionError} view={view} />
      ) : view.kind === 'completed' ? (
        <CompletedWorkout view={view} />
      ) : (
        <UnavailableWorkout adapter={adapter} onChange={setView} view={view} />
      )}

      <Dialog
        actions={
          visibleExitDialog === 'cancel-confirm' ? (
            <>
              <Button disabled={decisionPending} onClick={() => setExitDialog('choice')} variant="secondary">
                返回
              </Button>
              <Button disabled={decisionPending} onClick={() => void leaveAfterDecision('cancel-and-exit')} variant="danger">
                确认取消
              </Button>
            </>
          ) : (
            <div className="training-exit-actions">
              <Button disabled={decisionPending} onClick={closeExitDialog} variant="secondary">
                继续训练
              </Button>
              <Button disabled={decisionPending} onClick={() => void leaveAfterDecision('pause-and-exit')}>
                暂停并退出
              </Button>
              <Button disabled={decisionPending} onClick={() => setExitDialog('cancel-confirm')} variant="ghost">
                取消训练
              </Button>
            </div>
          )
        }
        onClose={closeExitDialog}
        open={visibleExitDialog !== null}
        title={visibleExitDialog === 'cancel-confirm' ? '确认取消训练？' : '退出当前训练？'}
      >
        <p>
          {visibleExitDialog === 'cancel-confirm'
            ? '取消后本次未完成训练不能继续，但今天仍可重新开始。'
            : '暂停会立即保存当前动作和组进度，下次可继续训练。'}
        </p>
        {decisionError ? (
          <p className="training-submit-error" role="alert">
            操作失败，请重试。{decisionError}
          </p>
        ) : null}
      </Dialog>
    </div>
  )
}

function DurationWorkout({ adapter, view, onChange, onResume, resumeError }: { adapter: TrainingUiAdapter; view: DurationTrainingView; onChange: (view: TrainingView) => void; onResume: () => void; resumeError: string | null }) {
  const [current, setCurrent] = useState(view)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const systemReminderEnabled = useForgeStore((state) => state.settings.value?.trainingReminderEnabled ?? false)
  const reminderMessage = useTimerTargetReminder(current, systemReminderEnabled)
  useEffect(() => {
    const interval = window.setInterval(() => setCurrent((previous) => adapter.refreshTimer(previous) as DurationTrainingView), 250)
    return () => window.clearInterval(interval)
  }, [adapter])
  const saveCurrentSet = async () => {
    if (current.elapsedSeconds <= 0) return
    setPending(true)
    setError(null)
    try {
      onChange(await adapter.completeCurrentSet(current, { durationSeconds: current.elapsedSeconds } satisfies DurationSetInput))
    } catch (cause) {
      setError(toDataError(cause).message)
    } finally {
      setPending(false)
    }
  }
  const complete = () => {
    if (current.elapsedSeconds <= 0) return
    if (!current.targetReached) {
      setConfirmOpen(true)
      return
    }
    void saveCurrentSet()
  }
  return (
    <>
      <TimerWorkoutShell current={current} label="实际时长" reminderMessage={reminderMessage}>
        <Button disabled={pending || current.elapsedSeconds <= 0} fullWidth onClick={complete}>{pending ? '正在保存…' : current.targetReached ? '完成本组' : '提前结束并记录'}</Button>
        {error ? <p className="training-submit-error" role="alert">保存失败，请重试。{error}</p> : null}
        {current.sessionStatus === 'paused' ? <PausedOverlay error={resumeError} onResume={onResume} /> : null}
      </TimerWorkoutShell>
      <Alert
        cancelLabel="取消"
        confirmLabel="确认记录"
        description="当前尚未达到目标时长，是否提前结束并记录当前实际时长？"
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false)
          void saveCurrentSet()
        }}
        open={confirmOpen}
        title="提前结束本组？"
      />
    </>
  )
}

function RestWorkout({ adapter, view, onChange, onResume, resumeError }: { adapter: TrainingUiAdapter; view: RestTrainingView; onChange: (view: TrainingView) => void; onResume: () => void; resumeError: string | null }) {
  const [current, setCurrent] = useState(view)
  const [pending, setPending] = useState(false)
  const systemReminderEnabled = useForgeStore((state) => state.settings.value?.restReminderEnabled ?? false)
  const reminderMessage = useTimerTargetReminder(current, systemReminderEnabled)
  useEffect(() => {
    const interval = window.setInterval(() => setCurrent((previous) => adapter.refreshTimer(previous) as RestTrainingView), 250)
    return () => window.clearInterval(interval)
  }, [adapter])
  const finish = async () => {
    setPending(true)
    try { onChange(await adapter.finishRest(current)) } finally { setPending(false) }
  }
  return (
    <TimerWorkoutShell current={current} label={current.targetReached ? '休息完成' : '剩余时间'} reminderMessage={reminderMessage}>
      <Button disabled={pending} fullWidth onClick={() => void finish()}>{pending ? '正在保存…' : current.targetReached ? '继续下一组' : '跳过休息'}</Button>
      {current.sessionStatus === 'paused' ? <PausedOverlay error={resumeError} onResume={onResume} /> : null}
    </TimerWorkoutShell>
  )
}

function TimerWorkoutShell({ current, label, reminderMessage, children }: { current: DurationTrainingView | RestTrainingView; label: string; reminderMessage: string | null; children: ReactNode }) {
  return (
    <main className="training-content training-timer-content">
      <section className="training-exercise-heading"><p>{current.kind === 'rest' ? '组间休息' : '当前动作'}</p><h1>{current.exerciseName}</h1><span>第 {current.activeSetNumber} 组 / 共 {current.targetSets} 组</span></section>
      <Card className="training-timer-card"><small>{label}</small><strong>{formatDuration(current.kind === 'rest' ? current.remainingSeconds : current.elapsedSeconds)}</strong><span>目标 {formatDuration(current.targetSeconds)}</span>{current.targetReached && current.kind === 'duration' ? <em>已达到目标{current.overtimeSeconds ? `，超出 ${formatDuration(current.overtimeSeconds)}` : ''}</em> : null}</Card>
      {reminderMessage ? <p className="training-reminder" role="status">{reminderMessage}</p> : null}
      {children}
    </main>
  )
}

function useTimerTargetReminder(
  current: DurationTrainingView | RestTrainingView,
  systemReminderEnabled: boolean,
) {
  const [message, setMessage] = useState<string | null>(null)
  const deliveredKey = useRef<string | null>(null)
  const key = `${current.kind}:${current.sessionId}:${current.exerciseResultId}:${current.activeSetNumber}`

  useEffect(() => {
    if (!current.targetReached || deliveredKey.current === key) return
    deliveredKey.current = key
    const reminder = current.kind === 'rest'
      ? { kind: 'rest' as const, title: '休息完成', body: '休息时间已到，可以继续下一组。' }
      : { kind: 'exercise' as const, title: '计时目标完成', body: `${current.exerciseName} 已达到计时目标。` }
    const inAppMessage = systemReminderEnabled
      ? browserReminderService.deliver(reminder).inAppMessage
      : reminder.body
    setMessage(inAppMessage)
  }, [current.exerciseName, current.kind, current.targetReached, key, systemReminderEnabled])

  return message
}

function PausedOverlay({ error, onResume }: { error: string | null; onResume: () => void }) {
  return <div className="training-paused" role="status"><Card><h2>训练已暂停</h2><p>进度已保存，继续后可恢复计时。</p>{error ? <p className="training-submit-error" role="alert">恢复失败，请重试。{error}</p> : null}<Button fullWidth onClick={onResume}>继续训练</Button></Card></div>
}

function formatDuration(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

function TrainingHeader({
  planName,
  subtitle,
  progress,
  onClose,
}: {
  planName: string
  subtitle?: string
  progress: number
  onClose: () => void
}) {
  return (
    <header className="training-header">
      <button aria-label="退出训练" className="training-close" onClick={onClose}>
        <span aria-hidden="true">×</span>
      </button>
      <div>
        <strong>{planName}</strong>
        {subtitle ? <small>{subtitle}</small> : null}
      </div>
      <span className="training-header__spacer" />
      <Progress value={progress} />
    </header>
  )
}

function RepetitionWorkout({
  adapter,
  view,
  onChange,
  onResume,
  resumeError,
}: {
  adapter: TrainingUiAdapter
  view: RepetitionTrainingView
  onChange: (view: TrainingView) => void
  onResume: () => void
  resumeError: string | null
}) {
  const defaultUnit = useForgeStore(
    (state) => state.settings.value?.defaultWeightUnit ?? 'kg',
  )
  const [repetitions, setRepetitions] = useState(view.targetRepetitions)
  const [weight, setWeight] = useState(view.targetWeight.value ?? 0)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const unit = view.targetWeight.unit ?? defaultUnit
  const step = unit === 'kg' ? 2.5 : 5

  const complete = async () => {
    setPending(true)
    setError(null)
    try {
      const resultWeight: WeightValue =
        view.targetWeight.mode === 'bodyweight'
          ? weight > 0
            ? { mode: 'bodyweight', value: weight, unit }
            : { mode: 'bodyweight' }
          : { mode: 'external', value: weight, unit }
      onChange(
        await adapter.completeCurrentSet(view, {
          repetitions,
          weight: resultWeight,
        }),
      )
    } catch (cause) {
      setError(toDataError(cause).message)
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="training-content">
      <section className="training-exercise-heading">
        <p>当前动作</p>
        <h1>{view.exerciseName}</h1>
        <span>
          第 {view.activeSetNumber} 组 / 共 {view.targetSets} 组
        </span>
      </section>

      <div aria-label="组进度" className="training-set-progress">
        {Array.from({ length: view.targetSets }, (_, index) => (
          <span
            className={index < view.completedSets.length ? 'training-set-progress__done' : ''}
            key={index}
          />
        ))}
      </div>

      {view.completedSets.length ? (
        <Card className="training-completed-sets">
          {view.completedSets.map((set) => (
            <div key={set.setNumber}>
              <small>SET {set.setNumber}</small>
              <strong>
                {formatWeight(set.weight)} × {set.repetitions}
              </strong>
              <span><Icon name="check" size={11} /></span>
            </div>
          ))}
        </Card>
      ) : null}

      <div className="training-controls">
        <NumberControl
          disabled={pending || error !== null}
          decrease={() => setWeight((value) => Math.max(0, value - step))}
          increase={() => setWeight((value) => value + step)}
          label="重量"
          unit={view.targetWeight.mode === 'bodyweight' && weight === 0 ? '体重' : unit}
          value={weight}
        />
        <NumberControl
          disabled={pending || error !== null}
          decrease={() => setRepetitions((value) => Math.max(1, value - 1))}
          increase={() => setRepetitions((value) => Math.min(999, value + 1))}
          label="次数"
          unit="次"
          value={repetitions}
        />
      </div>

      {error ? <p className="training-submit-error" role="alert">保存失败，请重试。{error}</p> : null}
      <Button
        disabled={
          pending ||
          repetitions < 1 ||
          (view.targetWeight.mode === 'external' && weight <= 0)
        }
        fullWidth
        leadingIcon="check"
        onClick={() => void complete()}
      >
        {pending ? '正在保存…' : '完成本组'}
      </Button>

      {view.nextExerciseName ? (
        <Card className="training-next">
          <small>NEXT</small>
          <strong>{view.nextExerciseName}</strong>
          <Icon name="chevron-right" size={14} />
        </Card>
      ) : null}

      {view.sessionStatus === 'paused' ? (
        <div className="training-paused" role="status">
          <Card>
            <h2>训练已暂停</h2>
            <p>进度已保存，继续后可完成当前组。</p>
            {resumeError ? (
              <p className="training-submit-error" role="alert">
                恢复失败，请重试。{resumeError}
              </p>
            ) : null}
            <Button fullWidth onClick={onResume}>继续训练</Button>
          </Card>
        </div>
      ) : null}
    </main>
  )
}

function NumberControl({
  label,
  value,
  unit,
  decrease,
  increase,
  disabled,
}: {
  label: string
  value: number
  unit: string
  decrease: () => void
  increase: () => void
  disabled?: boolean
}) {
  return (
    <Card className="training-number-control">
      <small>{label}</small>
      <div>
        <button aria-label={`减少${label}`} disabled={disabled} onClick={decrease}>−</button>
        <output aria-label={label}>
          <strong>{value}</strong>
          <span>{unit}</span>
        </output>
        <button aria-label={`增加${label}`} disabled={disabled} onClick={increase}>＋</button>
      </div>
    </Card>
  )
}

function UnavailableWorkout({ adapter, onChange, view }: { adapter: TrainingUiAdapter; onChange: (view: TrainingView) => void; view: UnavailableTrainingView }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const content =
    view.reason === 'duration'
      ? {
          title: view.exerciseName ?? '时间型动作',
          description: '当前已推进到时间型动作，计时交互将在下一切片接入。',
        }
      : view.reason === 'finished'
        ? {
            title: '当前组已全部完成',
            description: '所有训练组已记录，确认后将保存本次训练并生成总结。',
          }
        : {
            title: '训练已经结束',
            description: '该会话不能继续记录新的训练组。',
          }

  return (
    <>
      <main className="training-content training-content--state">
        <StatePanel
          action={
            view.reason === 'finished' ? (
              <Button disabled={pending} onClick={() => setConfirmOpen(true)}>
                {pending ? '正在保存…' : '完成训练'}
              </Button>
            ) : undefined
          }
          description={error ? `${content.description} ${error}` : content.description}
          kind={error ? 'error' : 'empty'}
          title={content.title}
        />
      </main>
      <Alert
        cancelLabel="取消"
        confirmLabel="确认完成"
        description="完成后将保存本次训练记录并生成训练总结。"
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false)
          setPending(true)
          setError(null)
          void adapter
            .completeTraining(view)
            .then(onChange)
            .catch((cause: unknown) => setError(toDataError(cause).message))
            .finally(() => setPending(false))
        }}
        open={confirmOpen}
        pending={pending}
        title="确认完成训练？"
      />
    </>
  )
}

function CompletedWorkout({ view }: { view: CompletedTrainingView }) {
  return (
    <main className="training-content training-content--state">
      <StatePanel
        action={<LinkButton to={`/history/${view.sessionId}`}>查看训练详情</LinkButton>}
        description={`共完成 ${view.totalSets} 组${view.durationSeconds !== undefined ? ` · 用时 ${formatDuration(view.durationSeconds)}` : ''}。`}
        kind="empty"
        title="训练已完成"
      />
      <Card className="training-summary">
        {view.exercises.map((exercise) => (
          <div key={exercise.exerciseName}>
            <strong>{exercise.exerciseName}</strong>
            <span>{exercise.completedSets} / {exercise.totalSets} 组</span>
          </div>
        ))}
      </Card>
    </main>
  )
}

function LinkButton({ to, children }: { to: string; children: ReactNode }) {
  return <Link className="ui-button ui-button--primary" to={to}>{children}</Link>
}

function formatWeight(weight: WeightValue) {
  if (weight.mode === 'bodyweight' && weight.value === undefined) return '体重'
  return `${weight.mode === 'bodyweight' ? '+' : ''}${weight.value}${weight.unit}`
}
