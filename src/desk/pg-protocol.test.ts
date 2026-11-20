import { expect, test } from 'vitest'
import { searchTerms } from './pg-protocol'

test('search words cannot supply tsquery operators', () => {
  expect(searchTerms("world & record:*')); DROP TABLE clips; --")).toBe("'world':* & 'record':* & 'DROP':* & 'TABLE':* & 'clips':*")
  expect(searchTerms('???')).toBe('')
})
