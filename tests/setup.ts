import 'fake-indexeddb/auto'
import { afterEach } from 'vitest'
import { forgeDatabase } from '../src/data/database'
import { resetIndexedDb } from './support/indexed-db'

afterEach(async () => {
  forgeDatabase.close()
  await resetIndexedDb()
})
