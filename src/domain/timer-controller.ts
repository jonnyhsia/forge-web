import type { IsoDateTime, WorkoutTimerState } from './entities'

export interface TimerReading {
  elapsedSeconds: number
  remainingSeconds: number
  targetReached: boolean
  overtimeSeconds: number
}

export interface TimerController {
  start(input: Omit<WorkoutTimerState, 'segmentStartedAt' | 'accumulatedSeconds' | 'status'> & { startedAt: IsoDateTime }): WorkoutTimerState
  read(state: WorkoutTimerState, now: IsoDateTime): TimerReading
  pause(state: WorkoutTimerState, now: IsoDateTime): WorkoutTimerState
  resume(state: WorkoutTimerState, now: IsoDateTime): WorkoutTimerState
  finish(state: WorkoutTimerState, now: IsoDateTime): number
}

function secondsBetween(start: IsoDateTime, end: IsoDateTime) {
  const elapsed = (Date.parse(end) - Date.parse(start)) / 1000
  return Math.max(0, Math.floor(elapsed))
}

function elapsedSeconds(state: WorkoutTimerState, now: IsoDateTime) {
  return state.accumulatedSeconds +
    (state.status === 'running'
      ? secondsBetween(state.segmentStartedAt, now)
      : 0)
}

export function createTimerController(): TimerController {
  return {
    start(input) {
      return {
        ...input,
        segmentStartedAt: input.startedAt,
        accumulatedSeconds: 0,
        status: 'running',
      }
    },

    read(state, now) {
      const elapsed = elapsedSeconds(state, now)
      return {
        elapsedSeconds: elapsed,
        remainingSeconds: Math.max(0, state.targetSeconds - elapsed),
        targetReached: elapsed >= state.targetSeconds,
        overtimeSeconds: Math.max(0, elapsed - state.targetSeconds),
      }
    },

    pause(state, now) {
      if (state.status === 'paused') return state
      return {
        ...state,
        accumulatedSeconds: elapsedSeconds(state, now),
        status: 'paused',
      }
    },

    resume(state, now) {
      if (state.status === 'running') return state
      return {
        ...state,
        segmentStartedAt: now,
        status: 'running',
      }
    },

    finish(state, now) {
      return elapsedSeconds(state, now)
    },
  }
}
