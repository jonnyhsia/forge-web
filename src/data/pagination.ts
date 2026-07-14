import { DataError } from './errors'

export type PageCursor = string

export interface PageRequest<TFilter = undefined> {
  cursor?: PageCursor | null
  limit?: number
  filter?: TFilter
}

export interface Page<TItem> {
  items: TItem[]
  nextCursor: PageCursor | null
}

interface CursorValue {
  sortValue: string
  id: string
}

export function encodeCursor(value: CursorValue): PageCursor {
  return encodeURIComponent(JSON.stringify(value))
}

export function decodeCursor(cursor: PageCursor): CursorValue {
  let value: unknown

  try {
    value = JSON.parse(decodeURIComponent(cursor))
  } catch (error) {
    throw new DataError('validation', 'Invalid page cursor', { cause: error })
  }

  if (
    typeof value !== 'object' ||
    value === null ||
    !('sortValue' in value) ||
    typeof value.sortValue !== 'string' ||
    !('id' in value) ||
    typeof value.id !== 'string'
  ) {
    throw new DataError('validation', 'Invalid page cursor')
  }

  return { sortValue: value.sortValue, id: value.id }
}

export function isBeforeCursor(
  sortValue: string,
  id: string,
  cursor: CursorValue,
): boolean {
  return (
    sortValue < cursor.sortValue ||
    (sortValue === cursor.sortValue && id < cursor.id)
  )
}
