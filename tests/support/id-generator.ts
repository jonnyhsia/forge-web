export class SequenceIdGenerator {
  private readonly namespace: string
  private sequence: number

  constructor(namespace = 'test', initialSequence = 1) {
    if (!Number.isInteger(initialSequence) || initialSequence < 0) {
      throw new TypeError('Initial sequence must be a non-negative integer')
    }

    this.namespace = namespace
    this.sequence = initialSequence
  }

  next(label = 'id'): string {
    const value = `${this.namespace}-${label}-${String(this.sequence).padStart(4, '0')}`
    this.sequence += 1
    return value
  }
}
