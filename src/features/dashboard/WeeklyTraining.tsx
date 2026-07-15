import type { DashboardSnapshot } from '../../domain'
import { AnimatedNumber, Card, Progress } from '../../ui/primitives'
import './weekly-training.css'

export function WeeklyTrainingSummary({
  snapshot,
  status,
  errorMessage,
}: {
  snapshot: DashboardSnapshot | null
  status: 'idle' | 'loading' | 'ready' | 'error'
  errorMessage?: string
}) {
  const totalOccurrences = snapshot?.days.reduce(
    (count, day) => count + day.occurrences.length,
    0,
  ) ?? 0
  const completedOccurrences = snapshot?.days.reduce(
    (count, day) =>
      count + day.occurrences.filter((item) => item.status === 'completed').length,
    0,
  ) ?? 0
  const loading = status === 'idle' || (status === 'loading' && !snapshot)
  const failed = status === 'error' && !snapshot
  const progress = totalOccurrences
    ? completedOccurrences / totalOccurrences * 100
    : 0

  return (
    <Card aria-busy={loading} className="hero-card weekly-training-summary">
      <p className="hero-card__label">本周训练</p>
      <h2>
        {loading || failed ? '— / —' : (
          <><AnimatedNumber value={completedOccurrences} /> / <AnimatedNumber value={totalOccurrences} /></>
        )}
      </h2>
      <p>
        {loading
          ? '正在整理本周训练…'
          : failed
            ? errorMessage ?? '本周训练读取失败，请稍后重试。'
            : totalOccurrences === 0
              ? '本周暂无训练安排'
              : `${completedOccurrences} 场已完成，保持节奏。`}
      </p>
      <Progress
        label="本周进度"
        value={progress}
      />
      {status === 'error' && snapshot ? (
        <small className="weekly-training-summary__stale">显示最近一次本地日程</small>
      ) : null}
    </Card>
  )
}
