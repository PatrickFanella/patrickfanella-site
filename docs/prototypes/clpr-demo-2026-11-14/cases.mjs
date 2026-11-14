// The scripted requests, shared by the recorder and the demo page. Throwaway prototype code.
export const CASES = [
  { id: 'relevance', label: 'Relevance search', url: '/api/v1/search?q=world+record&type=clips&sort=relevance' },
  { id: 'all', label: 'Every result type', url: '/api/v1/search?q=world&type=all&limit=5' },
  { id: 'symbols', label: 'Punctuation in the query', url: '/api/v1/search?q=rock+%26+roll&type=clips' },
  { id: 'missing', label: 'No query', url: '/api/v1/search?type=clips' },
  { id: 'bang', label: 'A query that cleans to nothing', url: '/api/v1/search?q=!&type=clips&limit=3' },
  { id: 'limit', label: 'Limit above the maximum', url: '/api/v1/search?q=world&type=clips&limit=500' },
  { id: 'hybrid-down', label: 'Hybrid search, OpenSearch down', url: '/demo/fault/hybrid?q=world&type=clips', simulated: true },
]
