import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Link,
  useBeforeUnload,
  useBlocker,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom'
import type { PlanAggregate } from '../../data'
import type { DataError } from '../../data'
import { createEntityId, type Weekday } from '../../domain'
import { markNavDirection } from '../../router'
import { useForgeStore } from '../../store'
import {
  AnimatedNumber,
  Button,
  Card,
  Dialog,
  Field,
  NumberStepper,
  SegmentedControl,
  StatePanel,
} from '../../ui/primitives'
import { Icon } from '../../ui/Icon'
import { WeeklyTrainingSummary } from '../dashboard/WeeklyTraining'
import { useWeeklyDashboard } from '../dashboard/useWeeklyDashboard'
import {
  createPlanEditor,
  type PlanDraft,
  type PlanExerciseDraft,
  type PlanValidation,
} from './plan-editor'
import './plans.css'
import './plan-editor-enhancements.css'

const WEEKDAYS: Array<{ value: Weekday; label: string }> = [
  { value: 1, label: '一' },
  { value: 2, label: '二' },
  { value: 3, label: '三' },
  { value: 4, label: '四' },
  { value: 5, label: '五' },
  { value: 6, label: '六' },
  { value: 7, label: '日' },
]

const CATEGORY_LABELS = {
  strength: '力量训练',
  cardio: '有氧训练',
  mobility: '拉伸放松',
} as const

const EXERCISE_TYPES: ReadonlyArray<{ value: PlanExerciseDraft['type']; label: string }> = [
  { value: 'repetitions', label: '次数型' },
  { value: 'duration', label: '时间型' },
]

/** 编辑页由多处入口进入，退出时回到来源；深链或刷新丢失来源时退回计划列表。 */
function useEditorReturnPath() {
  const { state } = useLocation()
  return (state as { from?: string } | null)?.from ?? '/plans'
}

function dataErrorMessage(error: DataError | null) {
  if (!error) return ''
  if (error.code === 'active_session_exists') {
    return '该计划有进行中的训练，请先暂停或取消训练后再删除。'
  }
  if (error.code === 'not_found') return '计划不存在或已被删除。'
  if (error.code === 'storage_unavailable') return '本地存储暂时不可用，请稍后重试。'
  return '操作失败，请重试。'
}

function syncLabel(status: string) {
  if (status === 'pending' || status === 'local') return '待同步'
  if (status === 'failed') return '同步失败'
  if (status === 'conflict') return '存在冲突'
  return '已同步'
}

export function PlansPage() {
  const plans = useForgeStore((state) => state.plans)
  const planDetails = useForgeStore((state) => state.planDetails)
  const loadPlans = useForgeStore((state) => state.loadPlans)
  const loadPlan = useForgeStore((state) => state.loadPlan)
  const [expanded, setExpanded] = useState<string | null>(null)
  const { dashboard } = useWeeklyDashboard()

  useEffect(() => {
    if (plans.status === 'idle') void loadPlans({ reset: true })
  }, [loadPlans, plans.status])

  const togglePlan = (planId: string) => {
    const next = expanded === planId ? null : planId
    setExpanded(next)
    if (next && !planDetails[next]) void loadPlan(next)
  }

  return (
    <div className="plan-page">
      <header className="plan-page__header">
        <div><p>TRAINING LIBRARY</p><h1>训练计划</h1></div>
        <Link aria-label="新建计划" className="round-action" onClick={() => markNavDirection('forward')} state={{ from: '/plans' }} to="/plans/new" viewTransition><Icon name="plus" size={18} /></Link>
      </header>

      <div className="plan-list">
        <WeeklyTrainingSummary
          errorMessage={dashboard.error?.message}
          snapshot={dashboard.value}
          status={dashboard.status}
        />
        {plans.status === 'loading' && plans.items.length === 0 ? (
          <StatePanel kind="loading" title="正在加载计划" description="正在读取本地训练计划。" />
        ) : plans.status === 'error' && plans.items.length === 0 ? (
          <StatePanel action={<Button leadingIcon="refresh" onClick={() => void loadPlans({ reset: true })}>重试</Button>} description={dataErrorMessage(plans.error)} kind="error" title="无法加载计划" />
        ) : plans.items.length === 0 ? (
          <StatePanel action={<Link className="ui-button ui-button--primary" onClick={() => markNavDirection('forward')} state={{ from: '/plans' }} to="/plans/new" viewTransition><Icon name="plus" size={17} />新建训练计划</Link>} description="建立第一个计划，安排每周训练。" kind="empty" title="暂无训练计划" />
        ) : (
          plans.items.map((plan) => {
            const open = expanded === plan.id
            const detail = planDetails[plan.id]
            const detailPhase = !detail || detail.status === 'loading'
              ? 'loading'
              : detail.status === 'error'
                ? 'error'
                : detail.value?.exercises.length === 0
                  ? 'empty'
                  : 'ready'
            return (
              <Card className="plan-card" key={plan.id}>
                <button aria-expanded={open} className="plan-card__summary" onClick={() => togglePlan(plan.id)}>
                  <span><strong>{plan.name}</strong><small>{CATEGORY_LABELS[plan.category]} · {plan.weekdays.length} 个训练日</small></span>
                  <span className="plan-card__meta"><em>{syncLabel(plan.sync.status)}</em><Icon className={open ? 'plan-card__chevron plan-card__chevron--open' : 'plan-card__chevron'} name="chevron-right" size={17} /></span>
                </button>
                <div
                  aria-hidden={!open}
                  className={open ? 'plan-card__detail-shell plan-card__detail-shell--open' : 'plan-card__detail-shell'}
                  inert={!open}
                >
                  <div className="plan-card__detail">
                    <div className="plan-card__detail-state" key={detailPhase}>
                      {detail?.status === 'loading' || !detail ? <p className="plan-inline-state">正在读取动作…</p> : detail.status === 'error' ? (
                        <div className="plan-inline-error"><span>{dataErrorMessage(detail.error)}</span><Button variant="ghost" onClick={() => void loadPlan(plan.id)}>重试</Button></div>
                      ) : detail.value ? (
                        <>
                          {detail.value.exercises.length === 0 ? <p className="plan-inline-state">尚未添加动作</p> : (
                            <ol className="plan-exercise-summary">
                              {detail.value.exercises.map(({ exercise, planExercise }) => (
                                <li key={planExercise.id}><span>{exercise.name}</span><small>{targetSummary(planExercise.target)}</small></li>
                              ))}
                            </ol>
                          )}
                          <Link className="plan-edit-link" onClick={() => markNavDirection('forward')} state={{ from: '/plans' }} to={`/plans/${plan.id}`} viewTransition>编辑计划<Icon name="chevron-right" size={15} /></Link>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
              </Card>
            )
          })
        )}

        {plans.status === 'error' && plans.items.length > 0 ? <div className="plan-list-error"><span>{dataErrorMessage(plans.error)}</span><Button variant="ghost" onClick={() => void loadPlans()}>重试</Button></div> : null}
        {plans.nextCursor ? <Button fullWidth variant="secondary" disabled={plans.status === 'loading'} onClick={() => void loadPlans()}>{plans.status === 'loading' ? '加载中…' : '加载更多'}</Button> : null}
      </div>
    </div>
  )
}

export function PlanCreatePage() {
  const defaultWeightUnit = useForgeStore((state) => state.settings.value?.defaultWeightUnit ?? 'kg')
  return <PlanEditorForm defaultWeightUnit={defaultWeightUnit} />
}

export function PlanDetailPage() {
  const { planId = '' } = useParams()
  const detail = useForgeStore((state) => state.planDetails[planId])
  const loadPlan = useForgeStore((state) => state.loadPlan)
  const defaultWeightUnit = useForgeStore((state) => state.settings.value?.defaultWeightUnit ?? 'kg')
  const returnTo = useEditorReturnPath()

  useEffect(() => {
    if (planId && !detail) void loadPlan(planId)
  }, [detail, loadPlan, planId])

  if (!detail || detail.status === 'loading') return <div className="focused-page"><StatePanel kind="loading" title="正在加载计划" description="正在读取计划与动作。" /></div>
  if (detail.status === 'error' || !detail.value) return <div className="focused-page"><StatePanel action={<Button leadingIcon="refresh" onClick={() => void loadPlan(planId)}>重试</Button>} description={dataErrorMessage(detail.error)} kind="error" title="无法打开计划" /></div>
  if (detail.value.plan.status === 'archived') return <div className="focused-page"><StatePanel action={<Link className="ui-button ui-button--primary" onClick={() => markNavDirection('back')} to={returnTo} viewTransition>返回</Link>} description="归档计划当前为只读状态。" kind="empty" title="计划已归档" /></div>
  if (detail.value.plan.sync.status === 'conflict') return <div className="focused-page"><StatePanel action={<Link className="ui-button ui-button--primary" onClick={() => markNavDirection('back')} to={returnTo} viewTransition>返回</Link>} description="该计划存在同步冲突，处理冲突前不能编辑。" kind="error" title="计划暂时只读" /></div>
  return <PlanEditorForm aggregate={detail.value} defaultWeightUnit={defaultWeightUnit} />
}

function targetSummary(target: PlanAggregate['exercises'][number]['planExercise']['target']) {
  if (target.type === 'duration') {
    const weight = target.weight?.mode === 'external' ? `${target.weight.value} ${target.weight.unit}` : target.weight?.value ? `自重 + ${target.weight.value} ${target.weight.unit}` : '自重'
    return `${target.targetSets} 组 × ${target.targetSeconds} 秒 · ${weight}`
  }
  const weight = target.weight.mode === 'external' ? `${target.weight.value} ${target.weight.unit}` : target.weight.value ? `自重 + ${target.weight.value} ${target.weight.unit}` : '自重'
  return `${target.targetSets} 组 × ${target.targetRepetitions} 次 · ${weight}`
}

function PlanEditorForm({ aggregate, defaultWeightUnit }: { aggregate?: PlanAggregate; defaultWeightUnit: 'kg' | 'lb' }) {
  const navigate = useNavigate()
  const returnTo = useEditorReturnPath()
  const savePlan = useForgeStore((state) => state.savePlan)
  const deletePlan = useForgeStore((state) => state.deletePlan)
  const plansError = useForgeStore((state) => state.plans.error)
  const allowNavigation = useRef(false)
  const editor = useMemo(() => createPlanEditor({
    aggregate,
    defaultWeightUnit,
    localDate: new Date().toLocaleDateString('en-CA'),
    now: () => new Date().toISOString(),
    createId: createEntityId,
  }), [aggregate, defaultWeightUnit])
  const [draft, setDraft] = useState(editor.initial)
  const [validation, setValidation] = useState<PlanValidation>({ valid: true, fields: {}, exercises: {} })
  const [editingExercise, setEditingExercise] = useState<PlanExerciseDraft | null>(null)
  const [exerciseDialogOpen, setExerciseDialogOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const weekdayGesture = useRef<{
    anchor: Weekday
    last: Weekday | null
    select: boolean
    baseline: readonly Weekday[]
  } | null>(null)
  const blocker = useBlocker(
    () =>
      !allowNavigation.current &&
      (Boolean(editingExercise) || deleteOpen || editor.isDirty(draft)),
  )

  useEffect(() => {
    if (blocker.state !== 'blocked' || (!editingExercise && !deleteOpen)) return
    // Router navigation is external state; Back closes the topmost dialog first.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExerciseDialogOpen(false)
    setDeleteOpen(false)
    blocker.reset()
  }, [blocker, deleteOpen, editingExercise])

  useBeforeUnload(useCallback((event) => {
    if (editor.isDirty(draft) && !allowNavigation.current) event.preventDefault()
  }, [draft, editor]))

  const persist = async () => {
    const result = editor.validate(draft)
    setValidation(result)
    if (!result.valid) {
      setSubmitError('请先修正表单错误后再保存。')
      return false
    }
    setSubmitting(true)
    setSubmitError('')
    try {
      await savePlan(editor.toAggregate(draft))
      return true
    } catch (error) {
      setSubmitError(dataErrorMessage(error as DataError))
      return false
    } finally {
      setSubmitting(false)
    }
  }

  const saveAndClose = async () => {
    if (!(await persist())) return
    allowNavigation.current = true
    markNavDirection('back')
    navigate(returnTo, { replace: true, viewTransition: true })
  }

  // 按「锚点 → 当前格」的区间重算，每次都从手势开始时的快照出发，
  // 因此回滑可以取消途中扫过的日子。
  const applyWeekdayGesture = (weekday: Weekday) => {
    const gesture = weekdayGesture.current
    if (!gesture || gesture.last === weekday) return
    gesture.last = weekday
    const from = Math.min(gesture.anchor, weekday)
    const to = Math.max(gesture.anchor, weekday)
    setDraft((current) => {
      const weekdays = new Set(gesture.baseline)
      for (let day = from; day <= to; day += 1) {
        if (gesture.select) weekdays.add(day as Weekday)
        else weekdays.delete(day as Weekday)
      }
      return { ...current, weekdays: [...weekdays].sort() }
    })
  }

  const startWeekdayGesture = (event: React.PointerEvent, weekday: Weekday) => {
    event.preventDefault()
    weekdayGesture.current = {
      anchor: weekday,
      last: null,
      select: !draft.weekdays.includes(weekday),
      baseline: draft.weekdays,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    applyWeekdayGesture(weekday)
  }

  const moveWeekdayGesture = (event: React.PointerEvent) => {
    if (!weekdayGesture.current) return
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLButtonElement>('[data-weekday]')
    const weekday = Number(target?.dataset.weekday) as Weekday
    if (weekday >= 1 && weekday <= 7) applyWeekdayGesture(weekday)
  }

  const endWeekdayGesture = () => { weekdayGesture.current = null }

  const saveExercise = (exercise: PlanExerciseDraft) => {
    const result = editor.validate({ ...draft, name: 'Valid', weekdays: [1], exercises: [exercise] })
    if (result.exercises[exercise.id]) return result.exercises[exercise.id]
    setDraft((current) => ({
      ...current,
      exercises: current.exercises.some((item) => item.id === exercise.id)
        ? current.exercises.map((item) => item.id === exercise.id ? exercise : item)
        : [...current.exercises, exercise],
    }))
    setExerciseDialogOpen(false)
    return null
  }

  const removeExercise = (exerciseId: string) => {
    setDraft((current) => ({ ...current, exercises: current.exercises.filter((item) => item.id !== exerciseId) }))
    setExerciseDialogOpen(false)
  }

  const editExercise = (exercise: PlanExerciseDraft) => {
    setEditingExercise(exercise)
    setExerciseDialogOpen(true)
  }

  const dropExercise = (targetId: string) => {
    if (!draggingId || draggingId === targetId) return
    setDraft((current) => {
      let next = current
      let from = next.exercises.findIndex(({ id }) => id === draggingId)
      const to = next.exercises.findIndex(({ id }) => id === targetId)
      while (from < to) { next = editor.moveExercise(next, draggingId, 'down'); from += 1 }
      while (from > to) { next = editor.moveExercise(next, draggingId, 'up'); from -= 1 }
      return next
    })
    setDraggingId(null)
  }

  const confirmDelete = async () => {
    setSubmitting(true)
    setSubmitError('')
    try {
      await deletePlan(draft.id)
      allowNavigation.current = true
      markNavDirection('back')
      navigate(returnTo, { replace: true, viewTransition: true })
    } catch (error) {
      setSubmitError(dataErrorMessage(error as DataError))
      setDeleteOpen(false)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="plan-editor-page">
      <header className="plan-editor-header">
        <Link aria-label="返回" className="back-link" onClick={() => markNavDirection('back')} to={returnTo} viewTransition><Icon name="arrow-left" size={18} /></Link>
        <div><p>{aggregate ? '编辑计划' : '新建计划'}</p><h1>{draft.name.trim() || '未命名计划'}</h1></div>
        {aggregate ? <div className="plan-editor-header__actions"><span className="plan-status-badge">{syncLabel(aggregate.plan.sync.status)}</span><button aria-label="删除计划" className="plan-delete-button" disabled={submitting} onClick={() => setDeleteOpen(true)} type="button"><Icon name="trash" size={18} /></button></div> : null}
      </header>

      <div className="plan-editor-body top-fading-edge">
        <section className="plan-editor-section">
          <Field error={validation.fields.name} label="计划名称" maxLength={80} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          <div className="plan-grid">
            <label>训练类别<select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as PlanDraft['category'] })}>{Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label>计划开始时间（可选）<input type="time" value={draft.localTime} onChange={(event) => setDraft({ ...draft, localTime: event.target.value })} /></label>
          </div>
        </section>

        <section className="plan-editor-section">
          <div className="plan-section-heading"><div><p>TRAINING DAYS</p><h2>训练日</h2></div>{validation.fields.weekdays ? <span>{validation.fields.weekdays}</span> : null}</div>
          <div className="weekday-picker" onPointerMove={moveWeekdayGesture} onPointerUp={endWeekdayGesture} onPointerCancel={endWeekdayGesture}>{WEEKDAYS.map(({ value, label }) => {
            const selected = draft.weekdays.includes(value)
            return <button aria-pressed={selected} className={selected ? 'weekday-picker__active' : ''} data-weekday={value} key={value} onClick={(event) => {
              if (event.detail !== 0) return
              setDraft((current) => ({ ...current, weekdays: current.weekdays.includes(value) ? current.weekdays.filter((day) => day !== value) : [...current.weekdays, value].sort() }))
            }} onPointerDown={(event) => startWeekdayGesture(event, value)}>{label}</button>
          })}</div>
        </section>

        <section className="plan-editor-section">
          <div className="plan-section-heading"><div><p>EXERCISES</p><h2>训练动作</h2></div>{draft.exercises.length > 0 ? <Button leadingIcon="plus" variant="secondary" onClick={() => editExercise(editor.createExercise())}>添加动作</Button> : null}</div>
          {validation.fields.exercises ? <p className="plan-field-error">{validation.fields.exercises}</p> : null}
          {draft.exercises.length === 0 ? <button className="exercise-empty" onClick={() => editExercise(editor.createExercise())}><Icon name="plus" size={20} /><span>尚未添加动作<small>点击添加</small></span></button> : (
            <div className="exercise-list">{draft.exercises.map((exercise, index) => (
              <div className="exercise-row" draggable key={exercise.id} onDragStart={() => setDraggingId(exercise.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => dropExercise(exercise.id)}>
                <span aria-hidden="true" className="drag-handle">⋮⋮</span>
                <button className="exercise-row__main" onClick={() => editExercise(exercise)}><strong>{exercise.name}</strong><small>{exerciseDraftSummary(exercise)}</small></button>
                <div className="exercise-row__moves"><button aria-label={`上移 ${exercise.name}`} disabled={index === 0} onClick={() => setDraft(editor.moveExercise(draft, exercise.id, 'up'))}>↑</button><button aria-label={`下移 ${exercise.name}`} disabled={index === draft.exercises.length - 1} onClick={() => setDraft(editor.moveExercise(draft, exercise.id, 'down'))}>↓</button></div>
              </div>
            ))}</div>
          )}
        </section>

        {submitError || plansError ? <div className="plan-submit-error" role="alert">{submitError || dataErrorMessage(plansError)}</div> : null}
      </div>

      <footer className="plan-editor-actions">
        <Button disabled={submitting} fullWidth onClick={() => void saveAndClose()}>{submitting ? '保存中…' : '保存计划'}</Button>
      </footer>

      {editingExercise ? <ExerciseDialog exercise={editingExercise} onAfterClose={() => setEditingExercise(null)} onClose={() => setExerciseDialogOpen(false)} onDelete={() => removeExercise(editingExercise.id)} onSave={saveExercise} open={exerciseDialogOpen} /> : null}
      <Dialog actions={<><Button fullWidth variant="secondary" onClick={() => setDeleteOpen(false)}>取消</Button><Button fullWidth variant="danger" disabled={submitting} onClick={() => void confirmDelete()}>确认删除</Button></>} onClose={() => setDeleteOpen(false)} open={deleteOpen} title="删除训练计划"><p>删除后计划将从列表隐藏，并在联网后同步删除。此操作无法撤销。</p></Dialog>
      <Dialog actions={<><Button fullWidth variant="secondary" onClick={() => blocker.reset?.()}>继续编辑</Button><Button fullWidth variant="ghost" onClick={() => { allowNavigation.current = true; markNavDirection('back'); blocker.proceed?.() }}>丢弃修改</Button></>} onClose={() => blocker.reset?.()} open={blocker.state === 'blocked' && !editingExercise && !deleteOpen} title="放弃未提交的修改？"><p>{submitError || '离开页面将丢弃未保存的修改。'}</p></Dialog>
    </div>
  )
}

function exerciseDraftSummary(exercise: PlanExerciseDraft) {
  const weight = exercise.weightMode === 'external' ? `${exercise.weightValue ?? '—'} ${exercise.weightUnit}` : exercise.weightValue ? `自重 + ${exercise.weightValue} ${exercise.weightUnit}` : '自重'
  if (exercise.type === 'duration') return `${exercise.targetSets} 组 × ${exercise.targetSeconds} 秒 · ${weight}`
  return `${exercise.targetSets} 组 × ${exercise.targetRepetitions} 次 · ${weight}`
}

function durationValue(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return <><AnimatedNumber value={minutes} /><span aria-hidden="true">:</span><AnimatedNumber prefix={remainder < 10 ? '0' : undefined} value={remainder} /></>
}

function renderWeightValue(value: number) {
  return (
    <span className="exercise-weight-value" data-bodyweight={value === 0}>
      <AnimatedNumber className="exercise-weight-value__number" fractionDigits={3} value={value} />
      <span aria-hidden="true" className="exercise-weight-value__bodyweight">自重</span>
    </span>
  )
}

function ExerciseSetting({
  label,
  hint,
  error,
  hidden = false,
  children,
}: {
  label: string
  hint: string
  error?: string
  hidden?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="exercise-setting" hidden={hidden}>
      <span><strong>{label}</strong><small>{hint}</small>{error ? <em role="alert">{error}</em> : null}</span>
      {children}
    </div>
  )
}

function ExerciseDialog({ exercise, open, onSave, onDelete, onClose, onAfterClose }: { exercise: PlanExerciseDraft; open: boolean; onSave: (exercise: PlanExerciseDraft) => Record<string, string> | null; onDelete: () => void; onClose: () => void; onAfterClose: () => void }) {
  const [draft, setDraft] = useState(exercise)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const save = () => {
    const result = onSave(draft)
    if (result) setErrors(result)
  }
  const weightValue = draft.weightValue ?? 0
  const updateWeight = (value: number) => setDraft({
    ...draft,
    weightMode: value === 0 ? 'bodyweight' : 'external',
    weightValue: value === 0 ? null : value,
  })
  return (
    <Dialog className="exercise-dialog" actions={<>{exercise.name.trim() ? <Button variant="danger" onClick={onDelete}>删除</Button> : null}<Button disabled={!draft.name.trim()} fullWidth onClick={save}>保存动作</Button></>} onAfterClose={onAfterClose} onClose={onClose} open={open} title={exercise.name ? '编辑动作' : '添加动作'}>
      <div className="exercise-form">
        <Field error={errors.name} label="动作名称" maxLength={80} placeholder="如：卧推、深蹲、跳绳…" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
        <SegmentedControl label="动作类型" onChange={(type) => setDraft({ ...draft, type })} options={EXERCISE_TYPES} value={draft.type} />
        <div className="exercise-settings">
          <ExerciseSetting error={errors.targetSets} hint="共几组" label="重复组数"><NumberStepper label="重复组数" max={99} min={1} onChange={(targetSets) => setDraft({ ...draft, targetSets })} value={draft.targetSets} /></ExerciseSetting>
          <ExerciseSetting error={errors.targetRepetitions} hidden={draft.type !== 'repetitions'} hint="目标重复次数" label="每组次数"><NumberStepper label="每组次数" max={999} min={1} onChange={(targetRepetitions) => setDraft({ ...draft, targetRepetitions })} value={draft.targetRepetitions} /></ExerciseSetting>
          <ExerciseSetting error={errors.targetSeconds} hidden={draft.type !== 'duration'} hint="每组持续时长" label="每组时长"><NumberStepper className="exercise-duration-stepper" label="每组时长" max={86400} min={30} onChange={(targetSeconds) => setDraft({ ...draft, targetSeconds })} renderValue={durationValue} step={30} value={draft.targetSeconds} /></ExerciseSetting>
          <ExerciseSetting error={errors.weightValue} hint={`${draft.weightUnit}，0 = 自重`} label="目标重量"><NumberStepper className="exercise-weight-stepper" fractionDigits={3} label="目标重量" max={9999} min={0} onChange={updateWeight} renderValue={renderWeightValue} step={2.5} value={weightValue} /></ExerciseSetting>
        </div>
        <div className="exercise-settings exercise-settings--rest">
          <ExerciseSetting error={errors.restSeconds} hint="每组完成后休息时长" label="组间休息"><NumberStepper className="exercise-duration-stepper" label="组间休息" max={3600} min={0} onChange={(restSeconds) => setDraft({ ...draft, restSeconds })} renderValue={durationValue} step={10} value={draft.restSeconds} /></ExerciseSetting>
        </div>
      </div>
    </Dialog>
  )
}
