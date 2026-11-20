import { describe, expect, it } from 'vitest'
import { listNames, numberWord, NumberWord } from './number-words.mjs'

describe('number words', () => {
  it('spells counts up to twenty and uses digits above', () => {
    expect(numberWord(4)).toBe('four')
    expect(numberWord(12)).toBe('twelve')
    expect(NumberWord(4)).toBe('Four')
    expect(numberWord(21)).toBe('21')
    expect(NumberWord(21)).toBe('21')
  })
  it('joins names as prose', () => {
    expect(listNames(['Clpr'])).toBe('Clpr')
    expect(listNames(['Clpr', 'Clustr'])).toBe('Clpr and Clustr')
    expect(listNames(['Clpr', 'Clustr', 'Undertow'])).toBe('Clpr, Clustr and Undertow')
  })
})
