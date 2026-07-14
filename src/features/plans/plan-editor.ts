import type {
  ExerciseTarget,
  PlanCategory,
  PlanStatus,
  Weekday,
  WeightUnit,
} from '../../domain'
import type { PlanAggregate } from '../../data'

export interface PlanDraft {
  id: string
  name: string
  description: string
  category: PlanCategory
  weekdays: Weekday[]
  localTime: string
  exercises: PlanExerciseDraft[]
}

export interface PlanExerciseDraft {
  id: string
  planExerciseId: string
  name: string
  type: 'repetitions' | 'duration'
  targetSets: number
  targetRepetitions: number
  targetSeconds: number
  weightMode: 'external' | 'bodyweight'
  weightValue: number | null
  weightUnit: WeightUnit
  restSeconds: number
}

export interface PlanValidation {
  valid: boolean
  fields: Partial<Record<'name' | 'weekdays' | 'exercises', string>>
  exercises: Record<string, Record<string, string>>
}

export interface PlanEditorOptions {
  aggregate?: PlanAggregate
  defaultWeightUnit: WeightUnit
  localDate: string
  now: () => string
  createId: (kind: 'plan' | 'exercise' | 'plan-exercise') => string
}

export interface PlanEditor {
  initial: PlanDraft
  createExercise(): PlanExerciseDraft
  validate(draft: PlanDraft, status: PlanStatus): PlanValidation
  isDirty(draft: PlanDraft): boolean
  moveExercise(
    draft: PlanDraft,
    exerciseId: string,
    direction: 'up' | 'down',
  ): PlanDraft
  toAggregate(draft: PlanDraft, status: PlanStatus): PlanAggregate
}

function isIntegerBetween(value: number, minimum: number, maximum: number) {
  return Number.isInteger(value) && value >= minimum && value <= maximum
}

function isValidWeight(value: number | null, required: boolean) {
  if (value === null) return !required
  return value > 0 && Math.round(value * 1000) === value * 1000
}

export function createPlanEditor(options: PlanEditorOptions): PlanEditor {
  const initial: PlanDraft = options.aggregate
    ? {
        id: options.aggregate.plan.id,
        name: options.aggregate.plan.name,
        description: options.aggregate.plan.description ?? '',
        category: options.aggregate.plan.category,
        weekdays: [...options.aggregate.plan.weekdays],
        localTime: options.aggregate.plan.localTime ?? '',
        exercises: options.aggregate.exercises.map(
          ({ exercise, planExercise }) => {
            const target = planExercise.target
            return {
              id: exercise.id,
              planExerciseId: planExercise.id,
              name: exercise.name,
              type: target.type,
              targetSets: target.targetSets,
              targetRepetitions:
                target.type === 'repetitions' ? target.targetRepetitions : 10,
              targetSeconds:
                target.type === 'duration' ? target.targetSeconds : 60,
              weightMode:
                target.type === 'repetitions'
                  ? target.weight.mode
                  : 'external',
              weightValue:
                target.type === 'repetitions'
                  ? (target.weight.value ?? null)
                  : null,
              weightUnit:
                target.type === 'repetitions'
                  ? (target.weight.unit ?? options.defaultWeightUnit)
                  : options.defaultWeightUnit,
              restSeconds: planExercise.restSeconds ?? 0,
            }
          },
        ),
      }
    : {
        id: options.createId('plan'),
        name: '',
        description: '',
        category: 'strength',
        weekdays: [],
        localTime: '',
        exercises: [],
      }
  const initialSnapshot = JSON.stringify(initial)

  return {
    initial,
    createExercise() {
      return {
        id: options.createId('exercise'),
        planExerciseId: options.createId('plan-exercise'),
        name: '',
        type: 'repetitions',
        targetSets: 3,
        targetRepetitions: 10,
        targetSeconds: 60,
        weightMode: 'external',
        weightValue: null,
        weightUnit: options.defaultWeightUnit,
        restSeconds: 90,
      }
    },
    isDirty(draft) {
      return JSON.stringify(draft) !== initialSnapshot
    },
    moveExercise(draft, exerciseId, direction) {
      const currentIndex = draft.exercises.findIndex(
        (exercise) => exercise.id === exerciseId,
      )
      const nextIndex =
        direction === 'up' ? currentIndex - 1 : currentIndex + 1
      if (
        currentIndex < 0 ||
        nextIndex < 0 ||
        nextIndex >= draft.exercises.length
      ) {
        return draft
      }
      const exercises = [...draft.exercises]
      ;[exercises[currentIndex], exercises[nextIndex]] = [
        exercises[nextIndex],
        exercises[currentIndex],
      ]
      return { ...draft, exercises }
    },
    toAggregate(draft, status) {
      const timestamp = options.now()
      const originalPlan = options.aggregate?.plan
      const description = draft.description.trim()
      const localTime = draft.localTime.trim()

      return {
        plan: {
          ...originalPlan,
          id: draft.id,
          name: draft.name.trim(),
          description: description || undefined,
          status,
          category: draft.category,
          weekdays: [...draft.weekdays].sort((left, right) => left - right),
          ...(localTime ? { localTime } : {}),
          effectiveLocalDate:
            originalPlan?.effectiveLocalDate ?? options.localDate,
          createdAt: originalPlan?.createdAt ?? timestamp,
          updatedAt: timestamp,
          sync: originalPlan?.sync ?? { status: 'local' },
        },
        exercises: draft.exercises.map((item, position) => {
          const original = options.aggregate?.exercises.find(
            ({ exercise }) => exercise.id === item.id,
          )
          const target: ExerciseTarget =
            item.type === 'duration'
              ? {
                  type: 'duration',
                  targetSets: item.targetSets,
                  targetSeconds: item.targetSeconds,
                }
              : {
                  type: 'repetitions',
                  targetSets: item.targetSets,
                  targetRepetitions: item.targetRepetitions,
                  weight:
                    item.weightMode === 'external'
                      ? {
                          mode: 'external',
                          value: item.weightValue!,
                          unit: item.weightUnit,
                        }
                      : item.weightValue === null
                        ? { mode: 'bodyweight' }
                        : {
                            mode: 'bodyweight',
                            value: item.weightValue,
                            unit: item.weightUnit,
                          },
                }

          return {
            exercise: {
              ...original?.exercise,
              id: item.id,
              name: item.name.trim(),
              type: item.type,
              defaultUnit:
                item.type === 'duration' ? 'second' : 'repetition',
              createdAt: original?.exercise.createdAt ?? timestamp,
              updatedAt: timestamp,
              sync: original?.exercise.sync ?? { status: 'local' },
            },
            planExercise: {
              ...original?.planExercise,
              id: item.planExerciseId,
              planId: draft.id,
              exerciseId: item.id,
              position,
              target,
              restSeconds: item.restSeconds,
              createdAt: original?.planExercise.createdAt ?? timestamp,
              updatedAt: timestamp,
              sync: original?.planExercise.sync ?? { status: 'local' },
            },
          }
        }),
      }
    },
    validate(draft, status) {
      const fields: PlanValidation['fields'] = {}
      const exercises: PlanValidation['exercises'] = {}
      const nameLength = draft.name.trim().length
      if (nameLength < 1 || nameLength > 80) {
        fields.name = '请输入 1–80 个字符的计划名称'
      }
      if (status === 'active' && draft.weekdays.length === 0) {
        fields.weekdays = '至少选择一个训练日'
      }
      if (status === 'active' && draft.exercises.length === 0) {
        fields.exercises = '至少添加一个训练动作'
      }

      for (const exercise of draft.exercises) {
        const errors: Record<string, string> = {}
        const exerciseNameLength = exercise.name.trim().length
        if (exerciseNameLength < 1 || exerciseNameLength > 80) {
          errors.name = '请输入 1–80 个字符的动作名称'
        }
        if (!isIntegerBetween(exercise.targetSets, 1, 99)) {
          errors.targetSets = '组数必须是 1–99 的整数'
        }
        if (!isIntegerBetween(exercise.restSeconds, 0, 3600)) {
          errors.restSeconds = '休息时间必须是 0–3600 秒的整数'
        }
        if (exercise.type === 'repetitions') {
          if (!isIntegerBetween(exercise.targetRepetitions, 1, 999)) {
            errors.targetRepetitions = '次数必须是 1–999 的整数'
          }
          if (
            !isValidWeight(
              exercise.weightValue,
              exercise.weightMode === 'external',
            )
          ) {
            errors.weightValue = '重量必须大于 0，且最多三位小数'
          }
        } else if (!isIntegerBetween(exercise.targetSeconds, 1, 86_400)) {
          errors.targetSeconds = '时长必须是 1–86400 秒的整数'
        }
        if (Object.keys(errors).length > 0) exercises[exercise.id] = errors
      }

      return {
        valid:
          Object.keys(fields).length === 0 &&
          Object.keys(exercises).length === 0,
        fields,
        exercises,
      }
    },
  }
}
