// The SQL benchmark's arithmetic and wording: how a time is shown at the clock's resolution, how
// EXPLAIN's plan is tidied for the pane, and what the comparison says. No DOM and no worker, so
// benchmark.test.ts calls it directly.
import type { Run } from './pg-protocol'

const fmt = (n: number) => n.toLocaleString('en-US')

/** A measured time with only the decimals the clock supports. Each reading is off by up to one tick,
 *  so a mean of n readings `step` apart is good to about step / 2√n at worst. Below that bound the
 *  figure is shown as "< bound", not as a number. */
export const measured = (exec: number, step: number, runs = 1) => {
  const bound = step / (2 * Math.sqrt(runs))
  const dp = Math.min(2, Math.max(0, Math.ceil(-Math.log10(bound))))
  // A ratio needs both times well clear of the bound: at five times it, a time is good to about 20%.
  return { text: exec < bound ? `< ${bound.toFixed(dp)}` : exec.toFixed(dp), below: exec < bound, rough: exec < 5 * bound }
}

/** The clock's step as the pane states it: one significant figure. */
export const tick = (step: number) => Number(step.toPrecision(1))

/** What the plan read the table with, as the timing panel names it. */
export const scanName = (plan: string[]) => /Seq Scan/.test(plan.join('\n')) ? 'seq scan' : /Index Scan/.test(plan.join('\n')) ? 'index scan' : 'scan'

/** EXPLAIN's node lines, filter counts and the two timing lines, with costs, buffers and loops left
 *  out and the six-space indent per level tightened to two, so the plan fits the pane.
 *
 *  A measured plan is the last run of the median batch, read on a coarse clock, so its node times
 *  often read 0.000. Given the clock's `step`, the node times are dropped, as TIMING OFF would, and
 *  Planning Time is shown at the clock's resolution. */
export function tidyPlan(plan: string[], step?: number): string[] {
  const out: string[] = []
  for (const raw of plan) {
    const lead = raw.length - raw.trimStart().length
    let text = raw.trim().replace(/\s*\(cost=[^)]*\)/, '').replace(/ loops=1\)/, ')').replace(/rows=(\d+)\.00/g, 'rows=$1').replace(/\s{2,}/g, ' ')
    if (step) {
      text = text.replace(/actual time=[\d.]+\.\.[\d.]+ /, 'actual ')
      const planning = /^Planning Time: ([\d.]+) ms$/.exec(text)
      if (planning) text = `Planning Time: ${measured(parseFloat(planning[1]), step).text} ms`
    }
    // A node at depth d starts its arrow at 2 + 6(d - 1); its detail lines start at 2 + 6d.
    const d = Math.max(0, Math.round((lead - 2) / 6))
    if (text.startsWith('->')) out.push(` ${'  '.repeat(d + 1)}-> ${text.slice(2).trim()}`)
    else if (lead === 0 && !/^Planning:?$/.test(text)) out.push(` ${text}`)
    else if (/^Rows Removed by Filter/.test(text)) out.push(` ${d ? `${'  '.repeat(d + 1)}   ` : '  '}${text}`)
  }
  return out
}

/** Both figures of the comparison and the sentence that relates them. There is no ratio when either
 *  time is too close to the clock's resolution, and two significant figures at most otherwise: the
 *  ratio of two means is rougher than either. */
export function compare(seq: Run, idx: Run, step: number, rows: number) {
  const a = measured(seq.exec, step, seq.runs), b = measured(idx.exec, step, idx.runs)
  const x = seq.exec / idx.exec, sig = (v: number) => String(Number(v.toPrecision(2)))
  const ratio = a.rough || b.rough ? 'One time is too close to what this tab\'s clock can resolve, so there is no ratio.'
    : `The index answers ${x >= 1 ? `about ${sig(x)} times faster` : `about ${sig(1 / x)} times slower`} on the same ${fmt(rows)} rows.`
  return { seq: a.text, idx: b.text, ratio }
}
