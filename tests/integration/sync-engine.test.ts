import { afterEach, describe, expect, it } from 'vitest'
import {
  ForgeDatabase,
  MockSyncTransport,
  SyncConflictResolver,
  SyncEngine,
  SyncQueueRepository,
  SyncStateRepository,
  createSyncQueueItem,
  retryDelay,
} from '../../src/data'
import { SYNC_PRIORITY, type WorkoutSession } from '../../src/domain'

const now = Date.parse('2026-07-14T08:00:00.000Z')
const databases: ForgeDatabase[] = []

function database(name: string) {
  const value = new ForgeDatabase(name)
  databases.push(value)
  return value
}

function session(id = 'session-a'): WorkoutSession {
  return {
    id,
    planId: 'plan-a',
    scheduleOccurrenceKey: 'plan-a:2026-07-14',
    planName: 'Push Day',
    status: 'active',
    exercises: [],
    idempotencyKey: 'start-session-a',
    createdAt: '2026-07-14T07:00:00.000Z',
    updatedAt: '2026-07-14T08:00:00.000Z',
    sync: { status: 'pending', remoteVersion: 2 },
  }
}

afterEach(() => {
  for (const item of databases.splice(0)) item.close()
})

describe('同步引擎契约', () => {
  it('按训练、计划、统计优先级发送，并原样复用幂等键', async () => {
    const db = database('forge-t13-priority')
    const queue = new SyncQueueRepository(db)
    const transport = new MockSyncTransport()
    const engine = new SyncEngine(
      transport,
      queue,
      new SyncStateRepository(db),
      () => now,
    )
    const items = [
      createSyncQueueItem({ entityType: 'statistics', entityId: 'stats', operation: 'upsert', priority: SYNC_PRIORITY.statistics, idempotencyKey: 'stats-key' }),
      createSyncQueueItem({ entityType: 'training-plan', entityId: 'plan-a', operation: 'upsert', priority: SYNC_PRIORITY.trainingPlan, idempotencyKey: 'plan-key' }),
      createSyncQueueItem({ entityType: 'workout-session', entityId: 'session-a', operation: 'upsert', priority: SYNC_PRIORITY.workoutSession, idempotencyKey: 'workout-key' }),
    ].map((item, index) => ({
      ...item,
      createdAt: new Date(now + index).toISOString(),
      updatedAt: new Date(now + index).toISOString(),
      nextAttemptAt: new Date(now).toISOString(),
    }))
    await db.syncQueue.bulkPut(items)

    await engine.processReady()

    expect(transport.pushed.map((item) => [item.entityType, item.idempotencyKey])).toEqual([
      ['workout-session', 'workout-key'],
      ['training-plan', 'plan-key'],
      ['statistics', 'stats-key'],
    ])
    await expect(queue.listAll()).resolves.toEqual([])
  })

  it('暂时失败指数退避，永久失败只允许手动重试', async () => {
    expect([1, 2, 3].map(retryDelay)).toEqual([1_000, 2_000, 4_000])
    const db = database('forge-t13-retry')
    const queue = new SyncQueueRepository(db)
    const transient = new MockSyncTransport([
      { status: 'transient-failure', error: '暂时不可用' },
    ])
    const item = {
      ...createSyncQueueItem({ entityType: 'statistics', entityId: 'stats', operation: 'upsert', priority: 100 }),
      nextAttemptAt: new Date(now).toISOString(),
    }
    await queue.put(item)

    await new SyncEngine(transient, queue, new SyncStateRepository(db), () => now).processReady()

    await expect(queue.get(item.id)).resolves.toMatchObject({
      status: 'failed',
      attempts: 1,
      nextAttemptAt: '2026-07-14T08:00:01.000Z',
      lastError: '暂时不可用',
    })

    await queue.retry(item.id, new Date(now).toISOString())
    await new SyncEngine(
      new MockSyncTransport([{ status: 'permanent-failure', error: '请求无效' }]),
      queue,
      new SyncStateRepository(db),
      () => now,
    ).processReady()
    await expect(queue.get(item.id)).resolves.toMatchObject({
      status: 'failed',
      attempts: 2,
      nextAttemptAt: '9999-12-31T23:59:59.999Z',
      lastError: '请求无效',
    })
  })

  it('冲突停止自动重试，并支持接受远端或以远端版本为基线保留本地', async () => {
    const db = database('forge-t13-conflict')
    const queue = new SyncQueueRepository(db)
    const local = session()
    const remote = { ...local, planName: 'Remote Plan' }
    await db.workoutSessions.put(local)
    const item = {
      ...createSyncQueueItem({
        entityType: 'workout-session',
        entityId: local.id,
        operation: 'upsert',
        payload: local,
        priority: 300,
        idempotencyKey: 'original-key',
        baseRemoteVersion: 2,
      }),
      nextAttemptAt: new Date(now).toISOString(),
    }
    await queue.put(item)
    const conflict = {
      status: 'conflict' as const,
      conflict: { reason: '版本冲突', remoteVersion: 3, remotePayload: remote },
    }
    await new SyncEngine(
      new MockSyncTransport([conflict]),
      queue,
      new SyncStateRepository(db),
      () => now,
    ).processReady()
    const resolver = new SyncConflictResolver(db)

    await resolver.keepLocal(item.id)

    const kept = await queue.get(item.id)
    expect(kept).toMatchObject({ status: 'pending', baseRemoteVersion: 3, attempts: 0 })
    expect(kept?.idempotencyKey).not.toBe('original-key')

    await queue.put({ ...kept!, status: 'conflict', conflict: conflict.conflict })
    await resolver.acceptRemote(item.id)
    await expect(db.workoutSessions.get(local.id)).resolves.toMatchObject({
      planName: 'Remote Plan',
      sync: { status: 'synced', remoteVersion: 3 },
    })
    await expect(queue.get(item.id)).resolves.toBeUndefined()
  })

  it('同实体同操作保留最新 payload，训练组使用独立去重键不会丢失', async () => {
    const db = database('forge-t13-dedupe')
    const queue = new SyncQueueRepository(db)
    const first = createSyncQueueItem({ entityType: 'training-plan', entityId: 'plan-a', operation: 'upsert', payload: { revision: 1 }, priority: 200 })
    const latest = createSyncQueueItem({ entityType: 'training-plan', entityId: 'plan-a', operation: 'upsert', payload: { revision: 2 }, priority: 200 })
    const set = createSyncQueueItem({ entityType: 'workout-session', entityId: 'session-a', operation: 'upsert', payload: { set: 1 }, priority: 300, dedupeKey: 'session-a:set:1' })

    await queue.putLatest(first)
    await queue.putLatest(latest)
    await queue.putLatest(set)

    await expect(queue.listAll()).resolves.toEqual([
      expect.objectContaining({ dedupeKey: 'session-a:set:1' }),
      expect.objectContaining({ id: first.id, payload: { revision: 2 } }),
    ])
  })

  it('首次新写入原位升级旧版去重键，不产生重复队列项', async () => {
    const db = database('forge-t13-legacy-dedupe')
    const queue = new SyncQueueRepository(db)
    const legacy = {
      ...createSyncQueueItem({ entityType: 'training-plan', entityId: 'plan-a', operation: 'upsert', payload: { revision: 1 }, priority: 200 }),
      dedupeKey: 'training-plan:plan-a',
    }
    const latest = createSyncQueueItem({ entityType: 'training-plan', entityId: 'plan-a', operation: 'upsert', payload: { revision: 2 }, priority: 200 })
    await queue.put(legacy)

    await queue.putLatest(latest)

    await expect(queue.listAll()).resolves.toEqual([
      expect.objectContaining({
        id: legacy.id,
        dedupeKey: 'training-plan:plan-a:upsert',
        payload: { revision: 2 },
      }),
    ])
  })
})
