import type {
  WeightValue,
  WorkoutSession,
  WorkoutSetResult,
} from './entities'
import { createTimerController } from './timer-controller'

export type WorkoutTransitionCommand =
  | { type: 'start' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'cancel' }
  | { type: 'complete' }

export class InvalidWorkoutTransitionError extends Error {
  readonly name = 'InvalidWorkoutTransitionError'
}

export class InvalidWorkoutSetError extends Error {
  readonly name = 'InvalidWorkoutSetError'
}

export type WorkoutSetCompletion =
  | { skipped: true }
  | { skipped: false; repetitions: number; weight: WeightValue }
  | { skipped: false; durationSeconds: number }

export interface CompleteWorkoutSetCommand {
  sessionId: string
  exerciseResultId: string
  setNumber: number
  result: WorkoutSetCompletion
}

export interface CompleteWorkoutSetOutcome {
  session: WorkoutSession
  set: WorkoutSetResult
}

export interface WorkoutSetMetadata {
  id: string
  completedAt: string
  idempotencyKey: string
}

function firstIncompleteSet(session: WorkoutSession) {
  for (const exercise of [...session.exercises].sort(
    (left, right) => left.position - right.position,
  )) {
    const completed = new Set(exercise.sets.map((set) => set.setNumber))
    for (
      let setNumber = 1;
      setNumber <= exercise.target.targetSets;
      setNumber += 1
    ) {
      if (!completed.has(setNumber)) {
        return { exerciseResultId: exercise.id, setNumber }
      }
    }
  }
  return null
}

export function completeWorkoutSet(
  session: WorkoutSession,
  command: CompleteWorkoutSetCommand,
  metadata: WorkoutSetMetadata,
): CompleteWorkoutSetOutcome {
  const idempotentReplay = session.exercises
    .flatMap((exercise) => exercise.sets)
    .find((set) => set.idempotencyKey === metadata.idempotencyKey)
  if (idempotentReplay) return { session, set: idempotentReplay }

  const exercise = session.exercises.find(
    (item) => item.id === command.exerciseResultId,
  )
  if (!exercise) {
    throw new InvalidWorkoutTransitionError(
      `Workout exercise ${command.exerciseResultId} was not found`,
    )
  }
  const completedSet = exercise.sets.find(
    (set) => set.setNumber === command.setNumber,
  )
  if (completedSet) return { session, set: completedSet }

  if (
    session.status !== 'active' ||
    session.activeExerciseResultId !== command.exerciseResultId ||
    session.activeSetNumber !== command.setNumber
  ) {
    throw new InvalidWorkoutTransitionError(
      `Cannot complete set ${command.setNumber} for workout session ${session.id}`,
    )
  }

  validateWorkoutSet(exercise.target.type, command.result)

  const set: WorkoutSetResult = {
    id: metadata.id,
    setNumber: command.setNumber,
    completedAt: metadata.completedAt,
    idempotencyKey: metadata.idempotencyKey,
    ...command.result,
  }
  const withResult: WorkoutSession = {
    ...session,
    exercises: session.exercises.map((item) =>
      item.id === exercise.id ? { ...item, sets: [...item.sets, set] } : item,
    ),
    timer: undefined,
    updatedAt: metadata.completedAt,
  }
  const progress = firstIncompleteSet(withResult)
  const advanced: WorkoutSession = {
    ...withResult,
    activeExerciseResultId: progress?.exerciseResultId,
    activeSetNumber: progress?.setNumber,
  }
  if (
    progress &&
    progress.exerciseResultId === exercise.id &&
    exercise.restSeconds &&
    exercise.restSeconds > 0
  ) {
    advanced.timer = createTimerController().start({
      phase: 'rest',
      exerciseResultId: exercise.id,
      setNumber: command.setNumber,
      targetSeconds: exercise.restSeconds,
      startedAt: metadata.completedAt,
    })
  }
  return { session: advanced, set }
}

function validateWorkoutSet(
  exerciseType: 'repetitions' | 'duration',
  result: WorkoutSetCompletion,
) {
  if (result.skipped) return

  if (exerciseType === 'duration') {
    if (
      !('durationSeconds' in result) ||
      !Number.isInteger(result.durationSeconds) ||
      result.durationSeconds <= 0
    ) {
      throw new InvalidWorkoutSetError(
        'Duration exercise requires a positive whole-second result',
      )
    }
    return
  }

  if (
    !('repetitions' in result) ||
    !Number.isInteger(result.repetitions) ||
    result.repetitions < 1 ||
    result.repetitions > 999 ||
    !isValidWeight(result.weight)
  ) {
    throw new InvalidWorkoutSetError(
      'Repetition exercise requires valid repetitions and weight',
    )
  }
}

function isValidWeight(weight: WeightValue) {
  if (weight.mode === 'bodyweight' && weight.value === undefined) return true
  return (
    weight.value > 0 &&
    Math.round(weight.value * 1000) === weight.value * 1000 &&
    (weight.unit === 'kg' || weight.unit === 'lb')
  )
}

export function transitionWorkout(
  session: WorkoutSession,
  command: WorkoutTransitionCommand,
  timestamp: string,
): WorkoutSession {
  if (command.type === 'complete' && session.status === 'completed') {
    return session
  }
  if (command.type === 'start' && session.status === 'draft') {
    const progress = firstIncompleteSet(session)
    if (!progress) {
      throw new InvalidWorkoutTransitionError(
        `Cannot start completed draft workout session ${session.id}`,
      )
    }
    return {
      ...session,
      status: 'active',
      startedAt: session.startedAt ?? timestamp,
      activeExerciseResultId: progress.exerciseResultId,
      activeSetNumber: progress.setNumber,
      updatedAt: timestamp,
    }
  }
  if (command.type === 'pause' && session.status === 'active') {
    return {
      ...session,
      status: 'paused',
      timer: session.timer
        ? createTimerController().pause(session.timer, timestamp)
        : undefined,
      updatedAt: timestamp,
    }
  }
  if (command.type === 'resume' && session.status === 'paused') {
    return {
      ...session,
      status: 'active',
      timer: session.timer
        ? createTimerController().resume(session.timer, timestamp)
        : undefined,
      updatedAt: timestamp,
    }
  }
  if (
    command.type === 'cancel' &&
    ['draft', 'active', 'paused'].includes(session.status)
  ) {
    return {
      ...session,
      status: 'cancelled',
      endedAt: timestamp,
      activeExerciseResultId: undefined,
      activeSetNumber: undefined,
      timer: undefined,
      updatedAt: timestamp,
    }
  }
  if (
    command.type === 'complete' &&
    ['active', 'paused'].includes(session.status)
  ) {
    return {
      ...session,
      status: 'completed',
      endedAt: timestamp,
      activeExerciseResultId: undefined,
      activeSetNumber: undefined,
      timer: undefined,
      updatedAt: timestamp,
    }
  }

  throw new InvalidWorkoutTransitionError(
    `Cannot ${command.type} workout session ${session.id} from ${session.status}`,
  )
}
