import type {
  CompleteWorkoutSetCommand,
  CompleteWorkoutSetOutcome,
  WeightValue,
  WorkoutSession,
  WorkoutTimerState,
  WorkoutTransitionCommand,
} from '../../domain'
import { createTimerController, nowIso } from '../../domain'
import type { StartWorkoutInput } from '../../data'

export interface TrainingUiGateway {
  start(input: StartWorkoutInput): Promise<WorkoutSession>
  get(sessionId: string): Promise<WorkoutSession>
  transition(sessionId: string, command: WorkoutTransitionCommand): Promise<WorkoutSession>
  completeSet(command: CompleteWorkoutSetCommand, idempotencyKey: string): Promise<CompleteWorkoutSetOutcome>
  saveTimer?(sessionId: string, timer: WorkoutTimerState | undefined): Promise<WorkoutSession>
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

interface TimerTrainingViewBase {
  sessionId: string
  sessionStatus: 'active' | 'paused'
  planName: string
  exerciseResultId: string
  exerciseName: string
  exerciseNumber: number
  totalExercises: number
  activeSetNumber: number
  targetSets: number
  targetSeconds: number
  timer: WorkoutTimerState
  elapsedSeconds: number
  remainingSeconds: number
  targetReached: boolean
  overtimeSeconds: number
  nextExerciseName?: string
  progressPercent: number
}

export interface DurationTrainingView extends TimerTrainingViewBase {
  kind: 'duration'
}

export interface RestTrainingView extends TimerTrainingViewBase {
  kind: 'rest'
}

export interface UnavailableTrainingView {
  kind: 'unavailable'
  sessionId: string
  planName: string
  sessionStatus: WorkoutSession['status']
  reason: 'duration' | 'finished' | 'terminal'
  exerciseName?: string
}

export interface CompletedTrainingExerciseSummary {
  exerciseName: string
  completedSets: number
  totalSets: number
}

export interface CompletedTrainingView {
  kind: 'completed'
  sessionId: string
  planName: string
  sessionStatus: 'completed'
  startedAt?: string
  endedAt: string
  durationSeconds?: number
  totalSets: number
  exercises: CompletedTrainingExerciseSummary[]
}

export type TrainingView =
  | RepetitionTrainingView
  | DurationTrainingView
  | RestTrainingView
  | CompletedTrainingView
  | UnavailableTrainingView

export interface RepetitionSetInput {
  repetitions: number
  weight: WeightValue
}

export interface DurationSetInput {
  durationSeconds?: number
}

export type TrainingDecision = 'resume' | 'pause-and-exit' | 'cancel-and-exit'

export type TrainingDecisionOutcome =
  | { kind: 'stay'; view: TrainingView }
  | { kind: 'leave' }

export interface TrainingUiAdapter {
  open(request: OpenTrainingRequest): Promise<TrainingView>
  completeCurrentSet(
    view: RepetitionTrainingView | DurationTrainingView,
    input: RepetitionSetInput | DurationSetInput,
  ): Promise<TrainingView>
  finishRest(view: RestTrainingView): Promise<TrainingView>
  completeTraining(view: UnavailableTrainingView): Promise<CompletedTrainingView>
  refreshTimer(view: DurationTrainingView | RestTrainingView, now?: string): TrainingView
  decide(view: TrainingView, decision: TrainingDecision): Promise<TrainingDecisionOutcome>
}

export interface TrainingUiAdapterOptions {
  gateway: TrainingUiGateway
  createId(): string
  now?: () => string
}

const timerController = createTimerController()

function toTimerView(
  session: WorkoutSession,
  exerciseIndex: number,
  exercise: WorkoutSession['exercises'][number],
  timer: WorkoutTimerState,
  now: string,
): DurationTrainingView | RestTrainingView {
  const reading = timerController.read(timer, now)
  const base = {
    sessionId: session.id,
    sessionStatus: session.status as 'active' | 'paused',
    planName: session.planName,
    exerciseResultId: exercise.id,
    exerciseName: exercise.exercise.name,
    exerciseNumber: exerciseIndex + 1,
    totalExercises: session.exercises.length,
    activeSetNumber: session.activeSetNumber!,
    targetSets: exercise.target.targetSets,
    targetSeconds: timer.targetSeconds,
    timer,
    ...reading,
    nextExerciseName: session.exercises[exerciseIndex + 1]?.exercise.name,
    progressPercent:
      (session.exercises.reduce((count, item) => count + item.sets.length, 0) /
        session.exercises.reduce((count, item) => count + item.target.targetSets, 0)) *
      100,
  }
  return timer.phase === 'rest'
    ? { ...base, kind: 'rest' }
    : { ...base, kind: 'duration' }
}

function toTrainingView(session: WorkoutSession, now: string): TrainingView {
  if (session.status === 'completed' && session.endedAt) {
    return {
      kind: 'completed',
      sessionId: session.id,
      planName: session.planName,
      sessionStatus: 'completed',
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      durationSeconds:
        session.startedAt
          ? Math.max(
              0,
              Math.floor(
                (Date.parse(session.endedAt) - Date.parse(session.startedAt)) /
                  1000,
              ),
            )
          : undefined,
      totalSets: session.exercises.reduce(
        (count, exercise) => count + exercise.sets.length,
        0,
      ),
      exercises: [...session.exercises]
        .sort((left, right) => left.position - right.position)
        .map((exercise) => ({
          exerciseName: exercise.exercise.name,
          completedSets: exercise.sets.length,
          totalSets: exercise.target.targetSets,
        })),
    }
  }
  if (session.status !== 'active' && session.status !== 'paused') {
    return { kind: 'unavailable', sessionId: session.id, planName: session.planName, sessionStatus: session.status, reason: 'terminal' }
  }

  const exercises = [...session.exercises].sort((left, right) => left.position - right.position)
  const exerciseIndex = exercises.findIndex(({ id }) => id === session.activeExerciseResultId)
  const exercise = exercises[exerciseIndex]
  if (!exercise || session.activeSetNumber === undefined) {
    return { kind: 'unavailable', sessionId: session.id, planName: session.planName, sessionStatus: session.status, reason: 'finished' }
  }
  if (session.timer) return toTimerView(session, exerciseIndex, exercise, session.timer, now)
  if (exercise.target.type === 'duration') {
    return { kind: 'unavailable', sessionId: session.id, planName: session.planName, sessionStatus: session.status, reason: 'duration', exerciseName: exercise.exercise.name }
  }

  const completedSets = exercise.sets.flatMap((set) =>
    !set.skipped && set.repetitions !== undefined && set.weight
      ? [{ setNumber: set.setNumber, repetitions: set.repetitions, weight: set.weight }]
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
        exercises.reduce((count, item) => count + item.target.targetSets, 0)) * 100,
  }
}

export function createTrainingUiAdapter(options: TrainingUiAdapterOptions): TrainingUiAdapter {
  const now = options.now ?? nowIso
  const attempts = new Map<string, { idempotencyKey: string; input: RepetitionSetInput | DurationSetInput }>()
  const pending = new Map<string, Promise<TrainingView>>()
  const startKeys = new Map<string, string>()
  const pendingStarts = new Map<string, Promise<TrainingView>>()

  const saveTimer = async (sessionId: string, timer: WorkoutTimerState | undefined) => {
    if (!options.gateway.saveTimer) throw new Error('Timer persistence is unavailable')
    return options.gateway.saveTimer(sessionId, timer)
  }

  const ensureDurationTimer = async (session: WorkoutSession): Promise<WorkoutSession> => {
    if (
      (session.status === 'active' || session.status === 'paused') &&
      !session.timer &&
      session.activeExerciseResultId
    ) {
      const exercise = session.exercises.find((item) => item.id === session.activeExerciseResultId)
      if (exercise?.target.type === 'duration' && session.activeSetNumber !== undefined) {
        const timestamp = now()
        const startedTimer = timerController.start({
          phase: 'exercise',
          exerciseResultId: exercise.id,
          setNumber: session.activeSetNumber,
          targetSeconds: exercise.target.targetSeconds,
          startedAt: timestamp,
        })
        const timer = session.status === 'paused'
          ? timerController.pause(startedTimer, timestamp)
          : startedTimer
        session = await saveTimer(session.id, timer)
      }
    }
    return session
  }

  const openSession = async (session: WorkoutSession): Promise<TrainingView> => {
    session = await ensureDurationTimer(session)
    return toTrainingView(session, now())
  }

  return {
    async open(request) {
      if (request.type === 'resume') return openSession(await options.gateway.get(request.sessionId))
      const occurrence = `${request.planId}:${request.localDate}`
      const existing = pendingStarts.get(occurrence)
      if (existing) return existing
      const idempotencyKey = startKeys.get(occurrence) ?? options.createId()
      startKeys.set(occurrence, idempotencyKey)
      const start = options.gateway.start({ planId: request.planId, localDate: request.localDate, idempotencyKey })
        .then((session) => openSession(session))
        .finally(() => { startKeys.delete(occurrence); pendingStarts.delete(occurrence) })
      pendingStarts.set(occurrence, start)
      return start
    },

    completeCurrentSet(view, input) {
      const target = `${view.sessionId}:${view.exerciseResultId}:${view.activeSetNumber}`
      const existing = pending.get(target)
      if (existing) return existing
      const attempt = attempts.get(target) ?? { idempotencyKey: options.createId(), input }
      attempts.set(target, attempt)
      const result = view.kind === 'duration'
        ? { skipped: false as const, durationSeconds: (attempt.input as DurationSetInput).durationSeconds ?? timerController.finish(view.timer, now()) }
        : { skipped: false as const, repetitions: (attempt.input as RepetitionSetInput).repetitions, weight: (attempt.input as RepetitionSetInput).weight }
      const completion = options.gateway.completeSet({ sessionId: view.sessionId, exerciseResultId: view.exerciseResultId, setNumber: view.activeSetNumber, result }, attempt.idempotencyKey)
        .then(async ({ session }) => {
          const nextSession = await ensureDurationTimer(session)
          attempts.delete(target)
          return toTrainingView(nextSession, now())
        })
        .finally(() => pending.delete(target))
      pending.set(target, completion)
      return completion
    },

    async finishRest(view) {
      const session = await saveTimer(view.sessionId, undefined)
      return toTrainingView(await ensureDurationTimer(session), now())
    },

    async completeTraining(view) {
      if (view.reason !== 'finished') {
        throw new Error('Training is not ready to complete')
      }
      return toTrainingView(
        await options.gateway.transition(view.sessionId, { type: 'complete' }),
        now(),
      ) as CompletedTrainingView
    },

    refreshTimer(view, timestamp = now()) {
      return { ...view, ...timerController.read(view.timer, timestamp) }
    },

    async decide(view, decision) {
      if (decision === 'pause-and-exit' && view.sessionStatus === 'paused') return { kind: 'leave' }
      const command = decision === 'resume' ? { type: 'resume' as const } : decision === 'pause-and-exit' ? { type: 'pause' as const } : { type: 'cancel' as const }
      const session = await options.gateway.transition(view.sessionId, command)
      return decision === 'resume' ? { kind: 'stay', view: toTrainingView(session, now()) } : { kind: 'leave' }
    },
  }
}
