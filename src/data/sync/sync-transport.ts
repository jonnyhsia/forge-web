import type {
  SyncQueueItem,
  SyncTransport,
  SyncTransportResult,
} from '../../domain/sync'

export interface FetchResponse {
  status: number
  json(): Promise<unknown>
}

export type SyncFetch = (
  input: string,
  init: RequestInit,
) => Promise<FetchResponse>

function objectValue(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null
}

function responseError(body: Record<string, unknown> | null, fallback: string) {
  return typeof body?.reason === 'string' ? body.reason : fallback
}

export class RestSyncTransport implements SyncTransport {
  private readonly endpoint: string
  private readonly fetcher: SyncFetch
  private readonly headers: Readonly<Record<string, string>>

  constructor(
    endpoint: string,
    fetcher: SyncFetch = (input, init) => fetch(input, init),
    headers: Readonly<Record<string, string>> = {},
  ) {
    this.endpoint = endpoint
    this.fetcher = fetcher
    this.headers = headers
  }

  async push(item: SyncQueueItem): Promise<SyncTransportResult> {
    let response: FetchResponse
    try {
      response = await this.fetcher(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': item.idempotencyKey,
          ...this.headers,
        },
        body: JSON.stringify({
          itemId: item.id,
          entityType: item.entityType,
          entityId: item.entityId,
          operation: item.operation,
          payload: item.payload,
          baseRemoteVersion: item.baseRemoteVersion,
          clientUpdatedAt: item.clientUpdatedAt ?? item.updatedAt,
        }),
      })
    } catch (error) {
      return {
        status: 'transient-failure',
        error: error instanceof Error ? error.message : '网络请求失败',
      }
    }

    const body = objectValue(await response.json().catch(() => null))
    if (response.status === 200 || response.status === 201) {
      if (
        body?.status === 'synced' &&
        typeof body.remoteVersion === 'number' &&
        typeof body.syncedAt === 'string'
      ) {
        return {
          status: 'success',
          value: {
            remoteVersion: body.remoteVersion,
            syncedAt: body.syncedAt,
          },
        }
      }
      return { status: 'permanent-failure', error: '同步响应格式无效' }
    }

    if (
      response.status === 409 &&
      body?.status === 'conflict' &&
      typeof body.reason === 'string' &&
      typeof body.remoteVersion === 'number' &&
      'remotePayload' in body
    ) {
      return {
        status: 'conflict',
        conflict: {
          reason: body.reason,
          remoteVersion: body.remoteVersion,
          remotePayload: body.remotePayload,
        },
      }
    }

    const error = responseError(body, `同步请求失败（HTTP ${response.status}）`)
    return response.status === 408 || response.status === 429 || response.status >= 500
      ? { status: 'transient-failure', error }
      : { status: 'permanent-failure', error }
  }
}

export class MockSyncTransport implements SyncTransport {
  readonly pushed: SyncQueueItem[] = []
  private readonly results: SyncTransportResult[]

  constructor(results: SyncTransportResult[] = []) {
    this.results = [...results]
  }

  async push(item: SyncQueueItem): Promise<SyncTransportResult> {
    this.pushed.push(item)
    return (
      this.results.shift() ?? {
        status: 'success',
        value: { remoteVersion: 1, syncedAt: new Date().toISOString() },
      }
    )
  }
}
