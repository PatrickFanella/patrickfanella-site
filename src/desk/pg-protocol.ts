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

export interface Run { plan: string[]; exec: number }
export interface Row { title: string; creator: string; votes: number }

export type PgEvent =
  | { ev: 'ready'; ms: number; version: string }
  | { ev: 'seed'; ms: number; rows: number }
  | { ev: 'bench'; kind: 'seq'; run: Run }
  | { ev: 'index'; ms: number }
  | { ev: 'bench'; kind: 'idx'; run: Run; rows: Row[]; total: number }
  | { ev: 'error'; message: string }
