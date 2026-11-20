// @ts-check
// Counts in page copy come from the catalog, so the words cannot drift from the lists they describe.
const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty']

/** The count as a word up to twenty, as digits above that. @param {number} n */
export function numberWord(n) {
  return Number.isInteger(n) && n >= 0 && n < words.length ? words[n] : String(n)
}

/** The same, starting a sentence. @param {number} n */
export function NumberWord(n) {
  const word = numberWord(n)
  return word.charAt(0).toUpperCase() + word.slice(1)
}

/** Names as prose: "A", "A and B", "A, B and C". @param {string[]} names */
export function listNames(names) {
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}
