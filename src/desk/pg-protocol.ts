// What the desk and its PostgreSQL worker share: Clpr's search query and the messages between them.

/** Clpr's clip search with a shorter column list: the same moderation filter, tsquery match and
 *  ranking as its production query, and its first page of 20. */
export const SEARCH_SQL = `SELECT c.id, c.title, c.creator_name, c.vote_score FROM clips c
 WHERE c.is_removed = false AND c.is_hidden = false
   AND c.dmca_removed = false
   AND c.search_vector @@ to_tsquery('english', $1)
 ORDER BY ts_rank(c.search_vector, to_tsquery('english', $1)) DESC,
          c.vote_score DESC, c.created_at DESC
 LIMIT 20`
export const COUNT_SQL = `SELECT count(*)::int AS n FROM clips c
 WHERE c.is_removed = false AND c.is_hidden = false AND c.dmca_removed = false
   AND c.search_vector @@ to_tsquery('english', $1)`
/** The search Clpr's demo recorded: "world record" as prefix terms. */
export const QUERY = "'world':* & 'record':*"

/** A plan and its Execution Time in ms. A measured run also says how many runs its time averages,
 *  and the median of three batches carries all three batch means, in the order they ran. */
export interface Run { plan: string[]; exec: number; runs?: number; batches?: number[] }
export interface Row { title: string; creator: string; votes: number }

export type PgEvent = (
  | { ev: 'ready'; ms: number; version: string; step: number }
  | { ev: 'seed'; ms: number; rows: number }
  | { ev: 'bench'; kind: 'seq'; run: Run }
  | { ev: 'index'; ms: number }
  | { ev: 'bench'; kind: 'idx'; run: Run; rows: Row[]; total: number }
  | { ev: 'search'; id: number; query: string; run: Run; rows: Row[]; total: number }
  | { ev: 'search-error'; id: number; message: string }
  | { ev: 'error'; message: string }
  | { ev: 'worker' }
  | { ev: 'schema'; ms: number }
  | { ev: 'stats'; bytes: number; queries: number }
) & { at?: number }

export type PgRequest = { ev: 'search'; id: number; words: string } | { ev: 'stats' }

/** Prefix terms, joined with AND as in Clpr; punctuation never becomes tsquery syntax. */
export function searchTerms(words: string): string {
  const terms = words.slice(0, 200).match(/[\p{L}\p{N}]+/gu) ?? []
  return terms.map((word) => `'${word}':*`).join(' & ')
}
