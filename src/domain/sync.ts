import type { EntityId, IsoDateTime } from './entities'

export type SyncEntityType =
  | 'exercise'
  | 'training-plan'
  | 'workout-session'
  | 'statistics'

export type SyncOperationType = 'upsert' | 'delete'
export type SyncQueueStatus = 'pending' | 'processing' | 'failed' | 'conflict'

export const SYNC_PRIORITY = {
  workoutSession: 300,
  trainingPlan: 200,
  exercise: 200,
  statistics: 100,
} as const

export interface SyncQueueItem {
  id: EntityId
  entityType: SyncEntityType
  entityId: EntityId
  operation: SyncOperationType
  payload?: unknown
  idempotencyKey: string
  dedupeKey: string
  priority: number
  status: SyncQueueStatus
  attempts: number
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
  nextAttemptAt: IsoDateTime
  lastError?: string
}

export interface SyncPushResult {
  remoteVersion: number
  syncedAt: IsoDateTime
}

export interface SyncConflict {
  reason: string
  remotePayload?: unknown
}

export type SyncTransportResult =
  | { status: 'success'; value: SyncPushResult }
  | { status: 'conflict'; conflict: SyncConflict }

export interface SyncTransport {
  push(item: SyncQueueItem): Promise<SyncTransportResult>
}
