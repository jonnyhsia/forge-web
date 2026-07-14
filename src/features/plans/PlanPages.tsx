import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Link,
  useBeforeUnload,
  useBlocker,
  useNavigate,
  useParams,
} from 'react-router-dom'
import type { PlanAggregate } from '../../data'
import type { DataError } from '../../data'
import type { PlanStatus, Weekday } from '../../domain'
import { useForgeStore } from '../../store'
import { Button, Card, Dialog, Field, StatePanel } from '../../ui/primitives'
import { Icon } from '../../ui/Icon'
import {
  createPlanEditor,
  type PlanDraft,
  type PlanExerciseDraft,
  type PlanValidation,
} from './plan-editor'
import './plans.css'

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
        <Link aria-label="新建计划" className="round-action" to="/plans/new"><Icon name="plus" size={18} /></Link>
      </header>

      <div className="plan-list">
        {plans.status === 'loading' && plans.items.length === 0 ? (
          <StatePanel kind="loading" title="正在加载计划" description="正在读取本地训练计划。" />
        ) : plans.status === 'error' && plans.items.length === 0 ? (
          <StatePanel action={<Button leadingIcon="refresh" onClick={() => void loadPlans({ reset: true })}>重试</Button>} description={dataErrorMessage(plans.error)} kind="error" title="无法加载计划" />
        ) : plans.items.length === 0 ? (
          <StatePanel action={<Link className="ui-button ui-button--primary" to="/plans/new"><Icon name="plus" size={17} />新建训练计划</Link>} description="建立第一个计划，安排每周训练。" kind="empty" title="暂无训练计划" />
        ) : (
          plans.items.map((plan) => {
            const open = expanded === plan.id
            const detail = planDetails[plan.id]
            return (
              <Card className="plan-card" key={plan.id}>
                <button aria-expanded={open} className="plan-card__summary" onClick={() => togglePlan(plan.id)}>
                  <span><strong>{plan.name}</strong><small>{CATEGORY_LABELS[plan.category]} · {plan.weekdays.length} 个训练日</small></span>
                  <span className="plan-card__meta"><em>{plan.status === 'draft' ? '草稿' : syncLabel(plan.sync.status)}</em><Icon className={open ? 'plan-card__chevron plan-card__chevron--open' : 'plan-card__chevron'} name="chevron-right" size={17} /></span>
                </button>
                {open ? (
                  <div className="plan-card__detail">
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
                        <Link className="plan-edit-link" to={`/plans/${plan.id}`}>编辑计划<Icon name="chevron-right" size={15} /></Link>
                      </>
                    ) : null}
                  </div>
                ) : null}
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

  useEffect(() => {
    if (planId && !detail) void loadPlan(planId)
  }, [detail, loadPlan, planId])

  if (!detail || detail.status === 'loading') return <div className="focused-page"><StatePanel kind="loading" title="正在加载计划" description="正在读取计划与动作。" /></div>
  if (detail.status === 'error' || !detail.value) return <div className="focused-page"><StatePanel action={<Button leadingIcon="refresh" onClick={() => void loadPlan(planId)}>重试</Button>} description={dataErrorMessage(detail.error)} kind="error" title="无法打开计划" /></div>
  if (detail.value.plan.status === 'archived') return <div className="focused-page"><StatePanel action={<Link className="ui-button ui-button--primary" to="/plans">返回计划</Link>} description="归档计划当前为只读状态。" kind="empty" title="计划已归档" /></div>
  if (detail.value.plan.sync.status === 'conflict') return <div className="focused-page"><StatePanel action={<Link className="ui-button ui-button--primary" to="/plans">返回计划</Link>} description="该计划存在同步冲突，处理冲突前不能编辑。" kind="error" title="计划暂时只读" /></div>
  return <PlanEditorForm aggregate={detail.value} defaultWeightUnit={defaultWeightUnit} />
}

function targetSummary(target: PlanAggregate['exercises'][number]['planExercise']['target']) {
  if (target.type === 'duration') return `${target.targetSets} 组 × ${target.targetSeconds} 秒`
  const weight = target.weight.mode === 'external' ? `${target.weight.value} ${target.weight.unit}` : target.weight.value ? `自重 + ${target.weight.value} ${target.weight.unit}` : '自重'
  return `${target.targetSets} 组 × ${target.targetRepetitions} 次 · ${weight}`
}

function PlanEditorForm({ aggregate, defaultWeightUnit }: { aggregate?: PlanAggregate; defaultWeightUnit: 'kg' | 'lb' }) {
  const navigate = useNavigate()
  const savePlan = useForgeStore((state) => state.savePlan)
  const deletePlan = useForgeStore((state) => state.deletePlan)
  const plansError = useForgeStore((state) => state.plans.error)
  const allowNavigation = useRef(false)
  const editor = useMemo(() => createPlanEditor({
    aggregate,
    defaultWeightUnit,
    localDate: new Date().toLocaleDateString('en-CA'),
    now: () => new Date().toISOString(),
    createId: () => crypto.randomUUID(),
  }), [aggregate, defaultWeightUnit])
  const [draft, setDraft] = useState(editor.initial)
  const [validation, setValidation] = useState<PlanValidation>({ valid: true, fields: {}, exercises: {} })
  const [editingExercise, setEditingExercise] = useState<PlanExerciseDraft | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const blocker = useBlocker(
    () =>
      !allowNavigation.current &&
      (Boolean(editingExercise) || deleteOpen || editor.isDirty(draft)),
  )

  useEffect(() => {
    if (blocker.state !== 'blocked' || (!editingExercise && !deleteOpen)) return
    // Router navigation is external state; Back closes the topmost dialog first.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEditingExercise(null)
    setDeleteOpen(false)
    blocker.reset()
  }, [blocker, deleteOpen, editingExercise])

  useBeforeUnload(useCallback((event) => {
    if (editor.isDirty(draft) && !allowNavigation.current) event.preventDefault()
  }, [draft, editor]))

  const persist = async (status: PlanStatus) => {
    const result = editor.validate(draft, status)
    setValidation(result)
    if (!result.valid) {
      setSubmitError('请先修正表单错误后再保存。')
      return false
    }
    setSubmitting(true)
    setSubmitError('')
    try {
      await savePlan(editor.toAggregate(draft, status))
      return true
    } catch (error) {
      setSubmitError(dataErrorMessage(error as DataError))
      return false
    } finally {
      setSubmitting(false)
    }
  }

  const saveAndStay = async (status: PlanStatus) => {
    if (!(await persist(status))) return
    if (!aggregate) {
      allowNavigation.current = true
      navigate(`/plans/${draft.id}`, { replace: true })
    }
  }

  const saveDraftAndLeave = async () => {
    if (await persist('draft')) {
      allowNavigation.current = true
      blocker.proceed?.()
    }
  }

  const saveExercise = (exercise: PlanExerciseDraft) => {
    const result = editor.validate({ ...draft, name: 'Valid', weekdays: [1], exercises: [exercise] }, 'active')
    if (result.exercises[exercise.id]) return result.exercises[exercise.id]
    setDraft((current) => ({
      ...current,
      exercises: current.exercises.some((item) => item.id === exercise.id)
        ? current.exercises.map((item) => item.id === exercise.id ? exercise : item)
        : [...current.exercises, exercise],
    }))
    setEditingExercise(null)
    return null
  }

  const removeExercise = (exerciseId: string) => {
    setDraft((current) => ({ ...current, exercises: current.exercises.filter((item) => item.id !== exerciseId) }))
    setEditingExercise(null)
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
      navigate('/plans', { replace: true })
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
        <Link aria-label="返回计划" className="back-link" to="/plans"><Icon name="arrow-left" size={18} /></Link>
        <div><p>{aggregate ? '编辑计划' : '新建计划'}</p><h1>{draft.name.trim() || '未命名计划'}</h1></div>
        {aggregate ? <span className="plan-status-badge">{aggregate.plan.status === 'draft' ? '草稿' : syncLabel(aggregate.plan.sync.status)}</span> : null}
      </header>

      <div className="plan-editor-body">
        <section className="plan-editor-section">
          <Field error={validation.fields.name} label="计划名称" maxLength={80} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          <label className="plan-textarea-label">计划描述（可选）<textarea maxLength={240} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
          <div className="plan-grid">
            <label>训练类别<select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as PlanDraft['category'] })}>{Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label>训练时间（可选）<input type="time" value={draft.localTime} onChange={(event) => setDraft({ ...draft, localTime: event.target.value })} /></label>
          </div>
        </section>

        <section className="plan-editor-section">
          <div className="plan-section-heading"><div><p>TRAINING DAYS</p><h2>训练日</h2></div>{validation.fields.weekdays ? <span>{validation.fields.weekdays}</span> : null}</div>
          <div className="weekday-picker">{WEEKDAYS.map(({ value, label }) => {
            const selected = draft.weekdays.includes(value)
            return <button aria-pressed={selected} className={selected ? 'weekday-picker__active' : ''} key={value} onClick={() => setDraft({ ...draft, weekdays: selected ? draft.weekdays.filter((day) => day !== value) : [...draft.weekdays, value].sort() })}>{label}</button>
          })}</div>
        </section>

        <section className="plan-editor-section">
          <div className="plan-section-heading"><div><p>EXERCISES</p><h2>训练动作</h2></div><Button leadingIcon="plus" variant="secondary" onClick={() => setEditingExercise(editor.createExercise())}>添加动作</Button></div>
          {validation.fields.exercises ? <p className="plan-field-error">{validation.fields.exercises}</p> : null}
          {draft.exercises.length === 0 ? <div className="exercise-empty">尚未添加动作</div> : (
            <div className="exercise-list">{draft.exercises.map((exercise, index) => (
              <div className="exercise-row" draggable key={exercise.id} onDragStart={() => setDraggingId(exercise.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => dropExercise(exercise.id)}>
                <span aria-hidden="true" className="drag-handle">⋮⋮</span>
                <button className="exercise-row__main" onClick={() => setEditingExercise(exercise)}><strong>{exercise.name}</strong><small>{exerciseDraftSummary(exercise)}</small></button>
                <div className="exercise-row__moves"><button aria-label={`上移 ${exercise.name}`} disabled={index === 0} onClick={() => setDraft(editor.moveExercise(draft, exercise.id, 'up'))}>↑</button><button aria-label={`下移 ${exercise.name}`} disabled={index === draft.exercises.length - 1} onClick={() => setDraft(editor.moveExercise(draft, exercise.id, 'down'))}>↓</button></div>
              </div>
            ))}</div>
          )}
        </section>

        {submitError || plansError ? <div className="plan-submit-error" role="alert">{submitError || dataErrorMessage(plansError)}</div> : null}
        {aggregate ? <Button variant="danger" onClick={() => setDeleteOpen(true)}>删除计划</Button> : null}
      </div>

      <footer className="plan-editor-actions">
        <Button disabled={submitting} variant="secondary" onClick={() => void saveAndStay('draft')}>保存草稿</Button>
        <Button disabled={submitting} onClick={() => void saveAndStay('active')}>{submitting ? '保存中…' : '保存计划'}</Button>
      </footer>

      {editingExercise ? <ExerciseDialog exercise={editingExercise} onClose={() => setEditingExercise(null)} onDelete={() => removeExercise(editingExercise.id)} onSave={saveExercise} /> : null}
      <Dialog actions={<><Button fullWidth variant="secondary" onClick={() => setDeleteOpen(false)}>取消</Button><Button fullWidth variant="danger" disabled={submitting} onClick={() => void confirmDelete()}>确认删除</Button></>} onClose={() => setDeleteOpen(false)} open={deleteOpen} title="删除训练计划"><p>删除后计划将从列表隐藏，并在联网后同步删除。此操作无法撤销。</p></Dialog>
      <Dialog actions={<><Button fullWidth variant="secondary" onClick={() => blocker.reset?.()}>继续编辑</Button><Button fullWidth variant="ghost" onClick={() => { allowNavigation.current = true; blocker.proceed?.() }}>丢弃修改</Button><Button fullWidth onClick={() => void saveDraftAndLeave()}>保存草稿</Button></>} onClose={() => blocker.reset?.()} open={blocker.state === 'blocked' && !editingExercise && !deleteOpen} title="保存未提交的修改？"><p>{submitError || '你可以保存为草稿、丢弃修改，或继续编辑。'}</p></Dialog>
    </div>
  )
}

function exerciseDraftSummary(exercise: PlanExerciseDraft) {
  if (exercise.type === 'duration') return `${exercise.targetSets} 组 × ${exercise.targetSeconds} 秒`
  const weight = exercise.weightMode === 'external' ? `${exercise.weightValue ?? '—'} ${exercise.weightUnit}` : exercise.weightValue ? `自重 + ${exercise.weightValue} ${exercise.weightUnit}` : '自重'
  return `${exercise.targetSets} 组 × ${exercise.targetRepetitions} 次 · ${weight}`
}

function ExerciseDialog({ exercise, onSave, onDelete, onClose }: { exercise: PlanExerciseDraft; onSave: (exercise: PlanExerciseDraft) => Record<string, string> | null; onDelete: () => void; onClose: () => void }) {
  const [draft, setDraft] = useState(exercise)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const save = () => {
    const result = onSave(draft)
    if (result) setErrors(result)
  }
  return (
    <Dialog actions={<>{exercise.name ? <Button variant="danger" onClick={onDelete}>删除</Button> : null}<Button fullWidth onClick={save}>保存动作</Button></>} onClose={onClose} open title={exercise.name ? '编辑动作' : '添加动作'}>
      <div className="exercise-form">
        <Field error={errors.name} label="动作名称" maxLength={80} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
        <label>动作类型<select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as PlanExerciseDraft['type'] })}><option value="repetitions">次数型</option><option value="duration">时间型</option></select></label>
        <Field error={errors.targetSets} label="目标组数" min={1} max={99} type="number" value={draft.targetSets} onChange={(event) => setDraft({ ...draft, targetSets: Number(event.target.value) })} />
        {draft.type === 'repetitions' ? <>
          <Field error={errors.targetRepetitions} label="每组次数" min={1} max={999} type="number" value={draft.targetRepetitions} onChange={(event) => setDraft({ ...draft, targetRepetitions: Number(event.target.value) })} />
          <label>重量模式<select value={draft.weightMode} onChange={(event) => setDraft({ ...draft, weightMode: event.target.value as PlanExerciseDraft['weightMode'], weightValue: null })}><option value="external">外加重量</option><option value="bodyweight">自重</option></select></label>
          <div className="plan-grid"><Field error={errors.weightValue} label={draft.weightMode === 'external' ? '目标重量' : '附加重量（可选）'} min="0" step="0.001" type="number" value={draft.weightValue ?? ''} onChange={(event) => setDraft({ ...draft, weightValue: event.target.value === '' ? null : Number(event.target.value) })} /><label>单位<select value={draft.weightUnit} onChange={(event) => setDraft({ ...draft, weightUnit: event.target.value as 'kg' | 'lb' })}><option value="kg">kg</option><option value="lb">lb</option></select></label></div>
        </> : <Field error={errors.targetSeconds} label="每组时长（秒）" min={1} max={86400} step={30} type="number" value={draft.targetSeconds} onChange={(event) => setDraft({ ...draft, targetSeconds: Number(event.target.value) })} />}
        <Field error={errors.restSeconds} label="组间休息（秒）" min={0} max={3600} step={30} type="number" value={draft.restSeconds} onChange={(event) => setDraft({ ...draft, restSeconds: Number(event.target.value) })} />
      </div>
    </Dialog>
  )
}
