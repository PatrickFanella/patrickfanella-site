import sourceText from './search_repository.go?raw'

export interface CaseStudyNote {
  id: string
  label: string
  startLine: number
  endLine: number
  summary?: string
  body: string
  cost?: string
  change?: string
}

export interface CaseStudy {
  title: string
  description: string
  source: string
  commit: string
  path: string
  sourceText: string
  sha256: string
  excerptStart: number
  excerptEnd: number
  notes: readonly CaseStudyNote[]
}

export const clprSearch: CaseStudy = {
  title: 'A search request becomes four independent result sets',
  description: 'A short reading of Clpr’s pinned PostgreSQL search repository.',
  source: 'https://github.com/PatrickFanella/clpr/blob/1eab1a62535e562e327fbf4b197c094e81abe619/backend/internal/repository/search_repository.go',
  commit: '1eab1a62535e562e327fbf4b197c094e81abe619',
  path: 'backend/internal/repository/search_repository.go',
  sourceText,
  sha256: '073e770bbd98884ad051bf7f906776f746fa0a6568c7da62142cbd4b786d10fc',
  excerptStart: 26,
  excerptEnd: 47,
  notes: [
    { id: 'initialize-response', label: 'Initialize response', startLine: 28, endLine: 35, body: 'The response preserves the submitted query and page settings, and starts with empty result collections.' },
    { id: 'normalize-query', label: 'Normalize query', startLine: 38, endLine: 39, body: 'The request text is converted to a PostgreSQL tsquery before type-specific repository calls.' },
    { id: 'select-result-types', label: 'Select result types', startLine: 41, endLine: 46, body: 'An empty or “all” type enables clips, creators, games, and tags; a specific type enables its matching branch.' },
  ],
}
