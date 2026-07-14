import type {
  PlanCategory,
  StatisticsCache,
  TrainingPlan,
  Weekday,
  WorkoutSession,
} from './entities'

export type DashboardDayStatus =
  | 'rest'
  | 'planned'
  | 'in_progress'
  | 'partially_completed'
  | 'completed'

export type DashboardOccurrenceStatus =
  | 'planned'
  | 'in_progress'
  | 'completed'

export interface DashboardRange {
  start: string
  end: string
  today: string
}

interface DashboardOccurrenceDetails {
  key: string
  localDate: string
  planId: string
  planName: string
  category?: PlanCategory
  localTime?: string
  completedExercises: number
  totalExercises: number
}

export type DashboardOccurrence = DashboardOccurrenceDetails &
  (
    | { status: 'planned'; sessionId?: never }
    | { status: 'in_progress' | 'completed'; sessionId: string }
  )

export interface DashboardDay {
  localDate: string
  weekday: Weekday
  status: DashboardDayStatus
  occurrences: DashboardOccurrence[]
}

export interface DashboardSnapshot {
  range: DashboardRange
  days: DashboardDay[]
  recentWorkout: WorkoutSession | null
  statistics: StatisticsCache | null
}

export interface DeriveDashboardScheduleInput {
  range: DashboardRange
  plans: TrainingPlan[]
  sessions: WorkoutSession[]
}

export function dashboardWeekRange(
  date = new Date(),
  todayDate = new Date(),
): DashboardRange {
  const today = toLocalDate(todayDate)
  const day = date.getDay() || 7
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  monday.setDate(monday.getDate() - day + 1)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return { start: toLocalDate(monday), end: toLocalDate(sunday), today }
}

export function deriveDashboardSchedule({
  range,
  plans,
  sessions,
}: DeriveDashboardScheduleInput): DashboardDay[] {
  const sessionsByOccurrence = new Map<string, WorkoutSession>()

  for (const session of sessions) {
    if (session.deletedAt) continue
    const localDate = occurrenceLocalDate(session)
    if (!localDate || localDate < range.start || localDate > range.end) continue
    const current = sessionsByOccurrence.get(session.scheduleOccurrenceKey)
    if (!current || current.updatedAt < session.updatedAt) {
      sessionsByOccurrence.set(session.scheduleOccurrenceKey, session)
    }
  }

  return localDates(range.start, range.end).map((localDate) => {
    const occurrences = new Map<string, DashboardOccurrence>()

    if (localDate >= range.today) {
      for (const plan of plans) {
        if (!planMatchesDate(plan, localDate)) continue
        const key = `${plan.id}:${localDate}`
        occurrences.set(key, occurrenceFromPlan(plan, localDate))
      }
    }

    for (const session of sessionsByOccurrence.values()) {
      if (occurrenceLocalDate(session) !== localDate) continue
      occurrences.set(
        session.scheduleOccurrenceKey,
        occurrenceFromSession(session),
      )
    }

    const sorted = [...occurrences.values()].sort(
      (left, right) =>
        (left.localTime ?? '99:99').localeCompare(right.localTime ?? '99:99') ||
        left.planName.localeCompare(right.planName) ||
        left.key.localeCompare(right.key),
    )

    return {
      localDate,
      weekday: weekdayFor(localDate),
      status: dashboardDayStatus(sorted),
      occurrences: sorted,
    }
  })
}

function occurrenceFromPlan(
  plan: TrainingPlan,
  localDate: string,
): DashboardOccurrence {
  return {
    key: `${plan.id}:${localDate}`,
    localDate,
    planId: plan.id,
    planName: plan.name,
    category: plan.category,
    localTime: plan.localTime,
    status: 'planned',
    completedExercises: 0,
    totalExercises: 0,
  }
}

function occurrenceFromSession(session: WorkoutSession): DashboardOccurrence {
  const completedExercises = session.exercises.filter((exercise) => {
    const completedSets = new Set(exercise.sets.map((set) => set.setNumber))
    return completedSets.size >= exercise.target.targetSets
  }).length

  const details: DashboardOccurrenceDetails = {
    key: session.scheduleOccurrenceKey,
    localDate: occurrenceLocalDate(session)!,
    planId: session.planId,
    planName: session.planName,
    localTime: timeFromIso(session.startedAt),
    completedExercises,
    totalExercises: session.exercises.length,
  }
  if (session.status === 'completed') {
    return { ...details, status: 'completed', sessionId: session.id }
  }
  if (session.status === 'active' || session.status === 'paused') {
    return { ...details, status: 'in_progress', sessionId: session.id }
  }
  return { ...details, status: 'planned' }
}

function dashboardDayStatus(
  occurrences: DashboardOccurrence[],
): DashboardDayStatus {
  if (occurrences.length === 0) return 'rest'
  const completed = occurrences.filter(
    (occurrence) => occurrence.status === 'completed',
  ).length
  if (completed === occurrences.length) return 'completed'
  if (completed > 0) return 'partially_completed'
  if (occurrences.some((occurrence) => occurrence.status === 'in_progress')) {
    return 'in_progress'
  }
  return 'planned'
}

function planMatchesDate(plan: TrainingPlan, localDate: string): boolean {
  return (
    plan.status === 'active' &&
    !plan.deletedAt &&
    plan.effectiveLocalDate <= localDate &&
    plan.weekdays.includes(weekdayFor(localDate))
  )
}

function occurrenceLocalDate(session: WorkoutSession): string | undefined {
  const value = session.scheduleOccurrenceKey.slice(-10)
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined
}

function weekdayFor(localDate: string): Weekday {
  const date = dateFromLocalDate(localDate)
  return (date.getDay() || 7) as Weekday
}

function localDates(start: string, end: string): string[] {
  const dates: string[] = []
  const current = dateFromLocalDate(start)
  const last = dateFromLocalDate(end)
  while (current <= last) {
    dates.push(toLocalDate(current))
    current.setDate(current.getDate() + 1)
  }
  return dates
}

function dateFromLocalDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day, 12)
}

function toLocalDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function timeFromIso(value?: string): string | undefined {
  if (!value) return undefined
  const date = new Date(value)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}
