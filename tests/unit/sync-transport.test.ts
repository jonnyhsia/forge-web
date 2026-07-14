import { describe, expect, it, vi } from 'vitest'
import { RestSyncTransport, createSyncQueueItem } from '../../src/data'

function item() {
  return createSyncQueueItem({
    entityType: 'workout-session',
    entityId: 'session-a',
    operation: 'upsert',
    payload: { set: 1 },
    priority: 300,
    idempotencyKey: 'stable-key',
    baseRemoteVersion: 2,
    clientUpdatedAt: '2026-07-14T08:00:00.000Z',
  })
}

describe('REST 同步 Transport', () => {
  it('按冻结契约发送请求并解析成功响应', async () => {
    const fetcher = vi.fn(async (input: string, init: RequestInit) => {
      void input
      void init
      return {
        status: 201,
        json: async () => ({ status: 'synced', remoteVersion: 3, syncedAt: '2026-07-14T08:00:01.000Z' }),
      }
    })
    const transport = new RestSyncTransport('/v1/sync/items', fetcher)

    await expect(transport.push(item())).resolves.toEqual({
      status: 'success',
      value: { remoteVersion: 3, syncedAt: '2026-07-14T08:00:01.000Z' },
    })
    expect(fetcher).toHaveBeenCalledWith('/v1/sync/items', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'Idempotency-Key': 'stable-key' }),
    }))
    expect(JSON.parse(fetcher.mock.calls[0]![1].body as string)).toMatchObject({
      entityType: 'workout-session',
      entityId: 'session-a',
      baseRemoteVersion: 2,
      clientUpdatedAt: '2026-07-14T08:00:00.000Z',
    })
  })

  it('区分冲突、暂时失败和永久失败', async () => {
    const responses = [
      { status: 409, body: { status: 'conflict', reason: '版本冲突', remoteVersion: 4, remotePayload: { remote: true } } },
      { status: 503, body: { reason: '维护中' } },
      { status: 422, body: { reason: '数据无效' } },
    ]
    const fetcher = vi.fn(async (input: string, init: RequestInit) => {
      void input
      void init
      const response = responses.shift()!
      return { status: response.status, json: async () => response.body }
    })
    const transport = new RestSyncTransport('/v1/sync/items', fetcher)

    await expect(transport.push(item())).resolves.toEqual({
      status: 'conflict',
      conflict: { reason: '版本冲突', remoteVersion: 4, remotePayload: { remote: true } },
    })
    await expect(transport.push(item())).resolves.toEqual({ status: 'transient-failure', error: '维护中' })
    await expect(transport.push(item())).resolves.toEqual({ status: 'permanent-failure', error: '数据无效' })
  })
})
