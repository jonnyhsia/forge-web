import { describe, expect, it, vi } from 'vitest'
import { createFigmaFixtures, createFixtureFactory } from '../fixtures'
import {
  ManualClock,
  NetworkStateStub,
  SequenceIdGenerator,
  resetIndexedDb,
} from '../support'

describe('T01 test support', () => {
  it('controls time and IDs deterministically', () => {
    const clock = new ManualClock('2026-07-14T08:00:00.000Z')
    const ids = new SequenceIdGenerator('case')
    const fixtures = createFixtureFactory({ clock, ids })

    const first = fixtures.plan()
    clock.advanceBy(60_000)
    const second = fixtures.plan()

    expect(first.id).toBe('case-plan-0001')
    expect(first.createdAt).toBe('2026-07-14T08:00:00.000Z')
    expect(second.createdAt).toBe('2026-07-14T08:01:00.000Z')
  })

  it('constructs every shared fixture family', () => {
    const sample = createFigmaFixtures()

    expect(sample.pushPlan.exercises).toHaveLength(5)
    expect(sample.activeSession.scheduleOccurrenceKey).toBe(
      `${sample.pushPlan.id}:2026-07-14`,
    )
    expect(sample.activeSession.exercises[0]?.exercise).toBe(
      sample.pushPlan.exercises[0]?.exercise,
    )
    expect(sample.history.exercises).not.toHaveLength(0)
    expect(sample.statistics.summary.personalRecords).not.toHaveLength(0)
    expect(sample.pendingSync.payload).toBe(sample.activeSession)
  })

  it('notifies network transitions and supports unsubscribe', () => {
    const network = new NetworkStateStub()
    const listener = vi.fn()
    const unsubscribe = network.subscribe(listener)

    network.set('offline')
    unsubscribe()
    network.set('recovering')

    expect(listener).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledWith('offline')
    expect(network.current()).toBe('recovering')
    expect(network.isOnline()).toBe(false)
  })

  it('provides an isolated fake IndexedDB', async () => {
    const request = indexedDB.open('t01-smoke', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('items')

    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    database.close()

    expect((await indexedDB.databases()).map(({ name }) => name)).toContain(
      't01-smoke',
    )
    await resetIndexedDb('t01-smoke')
    expect((await indexedDB.databases()).map(({ name }) => name)).not.toContain(
      't01-smoke',
    )
  })
})
