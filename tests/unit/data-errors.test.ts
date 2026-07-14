import { expect, it } from 'vitest'
import { toDataError } from '../../src/data/errors'

it('does not misclassify an unexpected implementation error as unavailable storage', () => {
  expect(toDataError(new TypeError('Unexpected state'))).toMatchObject({
    code: 'unknown',
    message: 'Unexpected state',
  })
})
