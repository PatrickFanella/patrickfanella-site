import { clprSearch, type CaseStudy } from './clpr-search'

// Proposed editorial judgments. Patrick must approve the rendered page before publication (#22).
export const clprRanking: CaseStudy = {
  ...clprSearch,
  title: 'How Clpr ranks and pages a clip search',
  description: 'The PostgreSQL search path, read through four choices: ranking, exact counts, transcript snippets and OFFSET paging.',
  excerptStart: 174,
  excerptEnd: 221,
  notes: [
    {
      id: 'ranking', label: 'Rank first, then votes and recency', startLine: 174, endLine: 180,
      body: 'Relevance sorting uses ts_rank only when the parsed query is nonempty. Equal ranks fall through to vote score and creation time. Popular sorting starts with votes; the default is newest first.',
      cost: 'The relevance branch asks PostgreSQL to order matches by a computed rank. These lines establish the sort policy, not its speed or whether readers prefer its results. None of the branches includes a unique final tie-breaker.',
      change: 'I would add the clip ID as the final sort key and test tied ranks, votes and timestamps. Then I would evaluate ranking changes against a small set of queries with expected results, rather than treating a faster query as better relevance.',
    },
    {
      id: 'count', label: 'Wait for an exact count before fetching a page', startLine: 182, endLine: 188,
      body: 'The repository executes COUNT(*) with the assembled filters and waits for that result before it submits the page query below. A count error ends the search here.',
      cost: 'The first page depends on completing a separate exact-total query. The source proves that sequencing; it does not tell us what fraction of request time the count consumes, and a count and a row query can use different plans.',
      change: 'I would measure count and page retrieval separately. If the interface only needs a next-page control, I would fetch one extra row and make exact totals optional, explicitly changing the response contract rather than presenting an estimate as exact.',
    },
    {
      id: 'snippets', label: 'Build transcript snippets only for a phrase search', startLine: 190, endLine: 198,
      body: 'Without a transcript phrase, the selected snippet column is NULL. With one, a correlated transcript lookup calls ts_headline with phraseto_tsquery. Bound options mark matches with U+E000 and U+E001 and request an 8-to-24-word excerpt.',
      cost: 'The phrase path asks for transcript lookup and headline generation in the result projection. The non-phrase path avoids that expression. These lines do not measure its cost, guarantee the displayed excerpt length, or show how the client renders the markers.',
      change: 'I would measure snippet work separately from matching, then test a missing transcript, a long transcript and text containing the marker characters. I would keep the markers as data and verify safe client rendering before changing the excerpt format.',
    },
    {
      id: 'paging', label: 'Use page numbers to calculate an OFFSET', startLine: 200, endLine: 221,
      body: 'The offset is (page − 1) × limit. The query reuses the filters and sort, binds limit and offset after the other arguments, and selects the clip fields plus the optional transcript snippet.',
      cost: 'The SQL requests that many ordered rows be skipped before the page is returned; deeper pages request larger skips. There is no cursor or snapshot shared with the earlier count in this excerpt. Source inspection cannot quantify deep-page latency or promise a stable view while clips change.',
      change: 'I would first add the unique tie-breaker above, then compare shallow and deep pages on representative data. If deep paging matters, I would prototype a cursor containing the active sort values and ID. Relevance cursors would also need to retain the query and filters; they would not preserve arbitrary page-number jumps.',
    },
  ],
}
