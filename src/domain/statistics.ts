import type {
  PersonalRecord,
  StatisticsSummary,
  WeeklyTrendPoint,
  WorkoutSession,
} from './entities'

export interface StatisticsRange {
  start: string
  end: string
}

export function rollingEightWeekRange(now: Date = new Date()): StatisticsRange {
  const start = startOfLocalWeek(now)
  start.setDate(start.getDate() - 7 * 7)
  return { start: start.toISOString(), end: now.toISOString() }
}

export function calculateStatistics(
  range: StatisticsRange,
  history: WorkoutSession[],
): StatisticsSummary {
  const rangeEnd = new Date(range.end)
  const rangeStartTime = new Date(range.start).getTime()
  const rangeEndTime = rangeEnd.getTime()
  const weekStart = startOfLocalWeek(rangeEnd)
  const monthStart = new Date(
    rangeEnd.getFullYear(),
    rangeEnd.getMonth(),
    1,
  )
  const completedHistory = history.filter(
    (session) =>
      session.status === 'completed' &&
      session.endedAt &&
      new Date(session.endedAt).getTime() >= rangeStartTime &&
      new Date(session.endedAt).getTime() <= rangeEndTime,
  )
  const completedAt = completedHistory.map(
    (session) => new Date(session.endedAt!),
  )

  return {
    workoutCount: completedHistory.length,
    weeklyWorkoutCount: completedAt.filter((date) => date >= weekStart).length,
    monthlyWorkoutCount: completedAt.filter((date) => date >= monthStart).length,
    streakDays: calculateStreak(completedAt, rangeEnd),
    weeklyTrend: calculateWeeklyTrend(rangeEnd, completedAt),
    trainingVolumeKg: calculateTrainingVolume(
      completedHistory.filter(
        (session) => new Date(session.endedAt!) >= monthStart,
      ),
    ),
    personalRecords: calculatePersonalRecords(completedHistory),
  }
}

function calculatePersonalRecords(
  history: WorkoutSession[],
): PersonalRecord[] {
  const records = new Map<string, PersonalRecord>()

  for (const session of history) {
    for (const exercise of session.exercises) {
      for (const set of exercise.sets) {
        if (
          set.skipped ||
          !('repetitions' in set) ||
          set.weight.value === undefined
        ) {
          continue
        }

        const candidate: PersonalRecord = {
          exerciseId: exercise.exercise.exerciseId,
          exerciseName: exercise.exercise.name,
          weightKg: weightInKg(set.weight.value, set.weight.unit),
          achievedAt: set.completedAt,
        }
        const existing = records.get(candidate.exerciseId)
        if (
          !existing ||
          candidate.weightKg > existing.weightKg ||
          (candidate.weightKg === existing.weightKg &&
            candidate.achievedAt < existing.achievedAt)
        ) {
          records.set(candidate.exerciseId, candidate)
        }
      }
    }
  }

  return [...records.values()].sort((left, right) =>
    left.exerciseId.localeCompare(right.exerciseId),
  )
}

function calculateTrainingVolume(history: WorkoutSession[]): number {
  return history.reduce(
    (total, session) =>
      total +
      session.exercises.reduce(
        (exerciseTotal, exercise) =>
          exerciseTotal +
          exercise.sets.reduce((setTotal, set) => {
            if (
              set.skipped ||
              !('repetitions' in set) ||
              set.weight.value === undefined
            ) {
              return setTotal
            }
            return (
              setTotal +
              weightInKg(set.weight.value, set.weight.unit) * set.repetitions
            )
          }, 0),
        0,
      ),
    0,
  )
}

function weightInKg(value: number, unit: 'kg' | 'lb'): number {
  return unit === 'kg' ? value : value * 0.45359237
}

function calculateWeeklyTrend(
  rangeEnd: Date,
  completedAt: Date[],
): WeeklyTrendPoint[] {
  const finalWeek = startOfLocalWeek(rangeEnd)
  const firstWeek = new Date(finalWeek)
  firstWeek.setDate(firstWeek.getDate() - 7 * 7)
  const counts = new Map<string, number>()

  for (const completed of completedAt) {
    const key = localDateKey(startOfLocalWeek(completed))
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return Array.from({ length: 8 }, (_, index) => {
    const week = new Date(firstWeek)
    week.setDate(firstWeek.getDate() + index * 7)
    const weekStart = localDateKey(week)
    return { weekStart, workoutCount: counts.get(weekStart) ?? 0 }
  })
}

function calculateStreak(completedAt: Date[], rangeEnd: Date): number {
  const localDays = [...new Set(completedAt.map(localDateKey))].sort().reverse()
  const latest = localDays[0]
  if (!latest) return 0

  const yesterday = new Date(rangeEnd)
  yesterday.setDate(yesterday.getDate() - 1)
  if (![localDateKey(rangeEnd), localDateKey(yesterday)].includes(latest)) {
    return 0
  }

  let streak = 1
  let cursor = localDate(latest)
  for (const day of localDays.slice(1)) {
    cursor.setDate(cursor.getDate() - 1)
    if (day !== localDateKey(cursor)) break
    streak += 1
  }
  return streak
}

function startOfLocalWeek(value: Date): Date {
  const start = new Date(value.getFullYear(), value.getMonth(), value.getDate())
  const daysSinceMonday = (start.getDay() + 6) % 7
  start.setDate(start.getDate() - daysSinceMonday)
  return start
}

function localDateKey(value: Date): string {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function localDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}
