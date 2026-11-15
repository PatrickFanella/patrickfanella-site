import { clprSearch, type CaseStudy } from './clpr-search'

// Owner direction: explain the choices and why they fit, with conditional alternatives (#22).
export const clprRanking: CaseStudy = {
  ...clprSearch,
  title: 'How Clpr ranks and pages a clip search',
  description: 'Four decisions behind Clpr’s PostgreSQL search: relevance before popularity, exact totals, phrase-specific snippets and numbered pages.',
  excerptStart: 174,
  excerptEnd: 221,
  notes: [
    {
      id: 'ranking', label: 'Rank first, then votes and recency', startLine: 174, endLine: 180,
      body: 'For relevance sorting, the query puts the text match first, then uses votes and recency to order equal ranks. That gives each signal a clear job: matching the query takes priority over popularity. Keeping the ordering in SQL lets PostgreSQL select the requested page in that order. Popular and newest-first sorts remain explicit options for a different browsing intent.',
      cost: 'This chooses a defined ordering of signals instead of blending them with adjustable weights. PostgreSQL must compute the rank for relevance sorting, and clips equal on all listed keys have no specified final order.',
      change: 'If the product needs a different balance between relevance and popularity, I would compare candidate rankings on queries with expected results before changing the policy. If stable ties become part of the pagination contract, I would add the clip ID as the final key.',
    },
    {
      id: 'count', label: 'Give the page an exact filtered total', startLine: 182, endLine: 188,
      body: 'The count query reuses the assembled filters, so its total describes the same selection as the page query. An exact total supports numbered-page navigation: the reader can know how much matched, rather than only whether another page exists. Keeping the count separate also makes that part of the response explicit.',
      cost: 'The repository waits for COUNT(*) before fetching the page, so the response includes a separate database operation. That is the work accepted for an exact total; its latency needs to be measured separately from fetching the rows.',
      change: 'If navigation changes to “load more,” the requirement changes with it. I would then consider fetching one extra row to report whether more results exist, while making the exact count optional. That would be a different response contract, not a drop-in replacement for numbered pages.',
    },
    {
      id: 'snippets', label: 'Build transcript snippets only for a phrase search', startLine: 190, endLine: 198,
      body: 'A transcript phrase calls for evidence of where it matched. This branch uses PostgreSQL’s phrase query and headline functions to select that context, with marker characters around matching words and a requested 8-to-24-word excerpt. Searches without a transcript phrase select NULL instead, keeping snippet generation tied to the feature that needs it.',
      cost: 'Phrase searches include a transcript lookup and headline generation in the result projection. That adds work where the excerpt is useful, while the non-phrase path avoids the expression. The marker format also gives the client a rendering contract to handle.',
      change: 'If the product needs several excerpts or richer transcript navigation, I would compare that requirement with the current single-snippet projection. I would measure headline generation before moving it elsewhere, and include checks for long transcripts, missing text and marker handling.',
    },
    {
      id: 'paging', label: 'Make numbered pages map directly to the query', startLine: 200, endLine: 221,
      body: 'LIMIT and OFFSET give a page number a direct meaning: skip (page − 1) × limit rows, then return the requested page. A reader can jump to a numbered page without first obtaining a cursor from the previous one. The query keeps the existing filters and sort and binds the pagination values alongside the other arguments.',
      cost: 'Larger page numbers request larger skips. The interface gets direct page access in exchange for that work; the query does not provide a frozen view of results while clips change. Whether deep pages are expensive enough to matter is a measurement question.',
      change: 'For a sequential feed where deep traversal matters more than page-number jumps, I would evaluate cursor paging. That design would carry the active sort values, query, filters and a unique tie-breaker. I would compare representative shallow and deep requests before trading away direct page access.',
    },
  ],
}
