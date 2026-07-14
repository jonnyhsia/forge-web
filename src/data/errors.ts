export type DataErrorCode =
  | 'validation'
  | 'not_found'
  | 'invalid_transition'
  | 'duplicate'
  | 'conflict'
  | 'storage_unavailable'
  | 'transport_unavailable'
  | 'unknown'

export class DataError extends Error {
  readonly name = 'DataError'
  readonly code: DataErrorCode

  constructor(
    code: DataErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.code = code
  }
}

const STORAGE_ERROR_NAMES = new Set([
  'AbortError',
  'ConstraintError',
  'DatabaseClosedError',
  'InvalidStateError',
  'MissingAPIError',
  'OpenFailedError',
  'QuotaExceededError',
  'TimeoutError',
  'VersionError',
])

export function toDataError(error: unknown): DataError {
  if (error instanceof DataError) {
    return error
  }

  const code =
    error instanceof Error && STORAGE_ERROR_NAMES.has(error.name)
      ? 'storage_unavailable'
      : 'unknown'

  return new DataError(
    code,
    error instanceof Error ? error.message : 'Unknown data error',
    { cause: error },
  )
}
