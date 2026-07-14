import type {
  CompleteWorkoutSetCommand,
  CompleteWorkoutSetOutcome,
  WeightValue,
  WorkoutSession,
  WorkoutTransitionCommand,
} from '../../domain'
import type { StartWorkoutInput } from '../../data'

export interface TrainingUiGateway {
  start(input: StartWorkoutInput): Promise<WorkoutSession>
  get(sessionId: string): Promise<WorkoutSession>
  transition(
    sessionId: string,
    command: WorkoutTransitionCommand,
  ): Promise<WorkoutSession>
  completeSet(
    command: CompleteWorkoutSetCommand,
    idempotencyKey: string,
  ): Promise<CompleteWorkoutSetOutcome>
}

export type OpenTrainingRequest =
  | { type: 'start'; planId: string; localDate: string }
  | { type: 'resume'; sessionId: string }

export interface CompletedRepetitionSetView {
  setNumber: number
  repetitions: number
  weight: WeightValue
}

export interface RepetitionTrainingView {
  kind: 'repetitions'
  sessionId: string
  sessionStatus: 'active' | 'paused'
  planName: string
  exerciseResultId: string
  exerciseName: string
  exerciseNumber: number
  totalExercises: number
  activeSetNumber: number
  targetSets: number
  targetRepetitions: number
  targetWeight: WeightValue
  completedSets: CompletedRepetitionSetView[]
  nextExerciseName?: string
  progressPercent: number
}

export interface UnavailableTrainingView {
  kind: 'unavailable'
  sessionId: string
  planName: string
  sessionStatus: WorkoutSession['status']
  reason: 'duration' | 'finished' | 'terminal'
  exerciseName?: string
}

export type TrainingView = RepetitionTrainingView | UnavailableTrainingView

export interface RepetitionSetInput {
  repetitions: number
  weight: WeightValue
}

export type TrainingDecision =
  | 'resume'
  | 'pause-and-exit'
  | 'cancel-and-exit'

export type TrainingDecisionOutcome =
  | { kind: 'stay'; view: TrainingView }
  | { kind: 'leave' }

export interface TrainingUiAdapter {
  open(request: OpenTrainingRequest): Promise<TrainingView>
  completeCurrentSet(
    view: RepetitionTrainingView,
    input: RepetitionSetInput,
  ): Promise<TrainingView>
  decide(
    view: TrainingView,
    decision: TrainingDecision,
  ): Promise<TrainingDecisionOutcome>
}

export interface TrainingUiAdapterOptions {
  gateway: TrainingUiGateway
  createId(): string
}

function toTrainingView(session: WorkoutSession): TrainingView {
  if (session.status !== 'active' && session.status !== 'paused') {
    return {
      kind: 'unavailable',
      sessionId: session.id,
      planName: session.planName,
      sessionStatus: session.status,
      reason: 'terminal',
    }
  }

  const exercises = [...session.exercises].sort(
    (left, right) => left.position - right.position,
  )
  const exerciseIndex = exercises.findIndex(
    ({ id }) => id === session.activeExerciseResultId,
  )
  const exercise = exercises[exerciseIndex]

  if (!exercise || session.activeSetNumber === undefined) {
    return {
      kind: 'unavailable',
      sessionId: session.id,
      planName: session.planName,
      sessionStatus: session.status,
      reason: 'finished',
    }
  }
  if (exercise.target.type === 'duration') {
    return {
      kind: 'unavailable',
      sessionId: session.id,
      planName: session.planName,
      sessionStatus: session.status,
      reason: 'duration',
      exerciseName: exercise.exercise.name,
    }
  }

  const completedSets = exercise.sets.flatMap((set) =>
    !set.skipped && set.repetitions !== undefined && set.weight
      ? [
          {
            setNumber: set.setNumber,
            repetitions: set.repetitions,
            weight: set.weight,
          },
        ]
      : [],
  )

  return {
    kind: 'repetitions',
    sessionId: session.id,
    sessionStatus: session.status,
    planName: session.planName,
    exerciseResultId: exercise.id,
    exerciseName: exercise.exercise.name,
    exerciseNumber: exerciseIndex + 1,
    totalExercises: exercises.length,
    activeSetNumber: session.activeSetNumber,
    targetSets: exercise.target.targetSets,
    targetRepetitions: exercise.target.targetRepetitions,
    targetWeight: exercise.target.weight,
    completedSets,
    nextExerciseName: exercises[exerciseIndex + 1]?.exercise.name,
    progressPercent:
      (exercises.reduce((count, item) => count + item.sets.length, 0) /
        exercises.reduce(
          (count, item) => count + item.target.targetSets,
          0,
        )) *
      100,
  }
}

export function createTrainingUiAdapter(
  options: TrainingUiAdapterOptions,
): TrainingUiAdapter {
  const attempts = new Map<
    string,
    { idempotencyKey: string; input: RepetitionSetInput }
  >()
  const pending = new Map<string, Promise<TrainingView>>()
  const startKeys = new Map<string, string>()
  const pendingStarts = new Map<string, Promise<TrainingView>>()

  return {
    async open(request) {
      if (request.type === 'resume') {
        return toTrainingView(await options.gateway.get(request.sessionId))
      }

      const occurrence = `${request.planId}:${request.localDate}`
      const existing = pendingStarts.get(occurrence)
      if (existing) return existing

      const idempotencyKey = startKeys.get(occurrence) ?? options.createId()
      startKeys.set(occurrence, idempotencyKey)
      const start = options.gateway
        .start({
          planId: request.planId,
          localDate: request.localDate,
          idempotencyKey,
        })
        .then((session) => {
          startKeys.delete(occurrence)
          return toTrainingView(session)
        })
        .finally(() => pendingStarts.delete(occurrence))

      pendingStarts.set(occurrence, start)
      return start
    },

    completeCurrentSet(view, input) {
      const target = `${view.sessionId}:${view.exerciseResultId}:${view.activeSetNumber}`
      const existing = pending.get(target)
      if (existing) return existing

      const attempt = attempts.get(target) ?? {
        idempotencyKey: options.createId(),
        input,
      }
      attempts.set(target, attempt)
      const completion = options.gateway
        .completeSet(
          {
            sessionId: view.sessionId,
            exerciseResultId: view.exerciseResultId,
            setNumber: view.activeSetNumber,
            result: {
              skipped: false,
              repetitions: attempt.input.repetitions,
              weight: attempt.input.weight,
            },
          },
          attempt.idempotencyKey,
        )
        .then(({ session }) => {
          attempts.delete(target)
          return toTrainingView(session)
        })
        .finally(() => pending.delete(target))

      pending.set(target, completion)
      return completion
    },

    async decide(view, decision) {
      if (decision === 'pause-and-exit' && view.sessionStatus === 'paused') {
        return { kind: 'leave' }
      }

      const command =
        decision === 'resume'
          ? ({ type: 'resume' } as const)
          : decision === 'pause-and-exit'
            ? ({ type: 'pause' } as const)
            : ({ type: 'cancel' } as const)
      const session = await options.gateway.transition(view.sessionId, command)

      return decision === 'resume'
        ? { kind: 'stay', view: toTrainingView(session) }
        : { kind: 'leave' }
    },
  }
}
