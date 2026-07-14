export class ManualClock {
  private current: Date

  constructor(initial = '2026-07-14T08:00:00.000Z') {
    this.current = new Date(initial)
    this.assertValid(this.current)
  }

  now(): Date {
    return new Date(this.current)
  }

  nowIso(): string {
    return this.current.toISOString()
  }

  set(value: string | Date): void {
    const next = new Date(value)
    this.assertValid(next)
    this.current = next
  }

  advanceBy(milliseconds: number): void {
    if (!Number.isFinite(milliseconds)) {
      throw new TypeError('Clock advance must be a finite number')
    }

    this.current = new Date(this.current.getTime() + milliseconds)
  }

  private assertValid(value: Date): void {
    if (Number.isNaN(value.getTime())) {
      throw new TypeError('Clock value must be a valid date')
    }
  }
}
