import { describe, expect, it } from 'vitest'
import { createPlanEditor } from '../../src/features/plans/plan-editor'

describe('计划编辑模块', () => {
  it('有效计划要求名称、训练日和动作', () => {
    const editor = createPlanEditor({
      defaultWeightUnit: 'kg',
      localDate: '2026-07-14',
      now: () => '2026-07-14T08:00:00.000Z',
      createId: (kind) => `${kind}-1`,
    })

    expect(editor.validate(editor.initial)).toMatchObject({
      valid: false,
      fields: {
        name: '请输入 1–80 个字符的计划名称',
        weekdays: '至少选择一个训练日',
        exercises: '至少添加一个训练动作',
      },
    })
  })

  it('按动作类型校验次数、时长、重量和休息范围', () => {
    const editor = createPlanEditor({
      defaultWeightUnit: 'kg',
      localDate: '2026-07-14',
      now: () => '2026-07-14T08:00:00.000Z',
      createId: (kind) => `${kind}-1`,
    })
    const exercise = {
      ...editor.createExercise(),
      name: '卧推',
      targetSets: 100,
      targetRepetitions: 0,
      weightValue: 1.2345,
      restSeconds: 3601,
    }

    expect(
      editor.validate(
        {
          ...editor.initial,
          name: 'Push Day',
          weekdays: [1],
          exercises: [exercise],
        },
      ),
    ).toMatchObject({
      valid: false,
      exercises: {
        'exercise-1': {
          targetSets: '组数必须是 1–99 的整数',
          targetRepetitions: '次数必须是 1–999 的整数',
          weightValue: '重量必须大于 0，且最多三位小数',
          restSeconds: '休息时间必须是 0–3600 秒的整数',
        },
      },
    })

    const duration = {
      ...exercise,
      id: 'duration-1',
      type: 'duration' as const,
      targetSets: 3,
      targetSeconds: 86401,
      restSeconds: 90,
    }
    const result = editor.validate(
      {
        ...editor.initial,
        name: 'Cardio',
        weekdays: [2],
        exercises: [duration],
      },
    )
    expect(result.exercises['duration-1']).toEqual({
      targetSeconds: '时长必须是 1–86400 秒的整数',
      weightValue: '重量必须大于 0，且最多三位小数',
    })
  })

  it('把编辑内容转换为排序稳定的领域聚合并识别脏状态', () => {
    let sequence = 0
    const editor = createPlanEditor({
      defaultWeightUnit: 'kg',
      localDate: '2026-07-14',
      now: () => '2026-07-14T08:00:00.000Z',
      createId: (kind) => `${kind}-${++sequence}`,
    })
    const bench = {
      ...editor.createExercise(),
      name: ' 卧推 ',
      weightMode: 'bodyweight' as const,
      weightValue: null,
    }
    const rope = {
      ...editor.createExercise(),
      name: '跳绳',
      type: 'duration' as const,
      targetSeconds: 600,
    }
    const draft = {
      ...editor.initial,
      name: ' Push Day ',
      weekdays: [1, 4] as Array<1 | 4>,
      exercises: [bench, rope],
    }

    expect(editor.isDirty(editor.initial)).toBe(false)
    expect(editor.isDirty(draft)).toBe(true)
    const reordered = editor.moveExercise(draft, rope.id, 'up')
    expect(reordered.exercises.map(({ name }) => name)).toEqual(['跳绳', ' 卧推 '])

    expect(editor.toAggregate(reordered)).toMatchObject({
      plan: {
        id: 'plan-1',
        name: 'Push Day',
        status: 'active',
        weekdays: [1, 4],
        effectiveLocalDate: '2026-07-14',
        sync: { status: 'local' },
      },
      exercises: [
        {
          exercise: { name: '跳绳', type: 'duration' },
          planExercise: {
            position: 0,
            target: { type: 'duration', targetSeconds: 600, targetSets: 3, weight: { mode: 'bodyweight' } },
          },
        },
        {
          exercise: { name: '卧推', type: 'repetitions' },
          planExercise: {
            position: 1,
            target: {
              type: 'repetitions',
              weight: { mode: 'bodyweight' },
            },
          },
        },
      ],
    })
  })

  it('编辑既有计划时保留动作备注和实体创建元数据', () => {
    let sequence = 0
    const options = {
      defaultWeightUnit: 'kg' as const,
      localDate: '2026-07-14',
      now: () => '2026-07-14T08:00:00.000Z',
      createId: (kind: 'plan' | 'exercise' | 'plan-exercise') => `${kind}-${++sequence}`,
    }
    const creator = createPlanEditor(options)
    const exercise = {
      ...creator.createExercise(),
      name: '卧推',
      weightValue: 80,
    }
    const aggregate = creator.toAggregate({
      ...creator.initial,
      name: 'Push Day',
      weekdays: [1],
      exercises: [exercise],
    })
    aggregate.exercises[0]!.exercise.notes = '保持肩胛稳定'

    const editor = createPlanEditor({ ...options, aggregate })
    const updated = editor.toAggregate({ ...editor.initial, name: 'Push A' })

    expect(updated.exercises[0]!.exercise).toMatchObject({
      notes: '保持肩胛稳定',
      createdAt: '2026-07-14T08:00:00.000Z',
    })
    expect(updated.exercises[0]!.planExercise.createdAt).toBe(
      '2026-07-14T08:00:00.000Z',
    )
  })
})
