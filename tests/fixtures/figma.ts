import { createFixtureFactory } from './builders'
import type { PlanExerciseFixture } from './types'

export function createFigmaFixtures() {
  const fixtures = createFixtureFactory()
  const planId = 'figma-plan-push'
  const definitions = [
    ['卧推', 5, 5, { mode: 'external', value: 80, unit: 'kg' }],
    ['斜卧推', 4, 8, { mode: 'external', value: 70, unit: 'kg' }],
    ['双杠臂屈伸', 3, 10, { mode: 'bodyweight' }],
    ['肩推', 4, 10, { mode: 'external', value: 30, unit: 'kg' }],
    ['三头绳下压', 3, 12, { mode: 'external', value: 20, unit: 'kg' }],
  ] as const
  const planExercises: PlanExerciseFixture[] = definitions.map(
    ([name, targetSets, targetRepetitions, weight], position) =>
      fixtures.planExercise({
        planId,
        position,
        exercise: fixtures.exercise({ name }),
        target: {
          type: 'repetitions',
          targetSets,
          targetRepetitions,
          weight,
        },
      }),
  )
  const pushPlan = fixtures.plan({ id: planId, exercises: planExercises })
  const exerciseResults = planExercises.map((planExercise, position) =>
    fixtures.workoutExercise({
      sourcePlanExerciseId: planExercise.id,
      exercise: planExercise.exercise,
      position,
      target: planExercise.target,
      sets:
        position < 3
          ? Array.from({ length: planExercise.target.targetSets }, (_, index) =>
              fixtures.workoutSet({
                setNumber: index + 1,
                repetitions:
                  planExercise.target.type === 'repetitions'
                    ? planExercise.target.targetRepetitions
                    : undefined,
                weight:
                  planExercise.target.type === 'repetitions'
                    ? planExercise.target.weight
                    : undefined,
              }),
            )
          : [],
    }),
  )
  const activeSession = fixtures.session({
    planId: pushPlan.id,
    planName: pushPlan.name,
    scheduleOccurrenceKey: `${pushPlan.id}:2026-07-14`,
    activeExerciseResultId: exerciseResults[3]?.id,
    exercises: exerciseResults,
  })

  return {
    pushPlan,
    activeSession,
    history: fixtures.history(),
    statistics: fixtures.statistics(),
    pendingSync: fixtures.syncQueue({
      entityId: activeSession.id,
      payload: activeSession,
    }),
  }
}
