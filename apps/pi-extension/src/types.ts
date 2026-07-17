export interface Chapter {
  n: number
  title: string
  start: number // seconds
  end: number // seconds
  topics: string[]
}

export interface IngestResult {
  title: string
  channel: string
  duration_sec: number
  detected_stack: string[]
  prereqs: string[]
  chapters: Chapter[]
  is_coding_tutorial: boolean
  notes: string
  slug: string // derived by ingest.ts, not from LLM
  yt_url: string
}

export interface Plan {
  slug: string
  repo_name: string
  project_dir: string // absolute path — chosen during grill
  stack: string[]
  depth: "literal-mirror" | "minimal-mvp" | "extended"
  tdd: boolean
  skip_chapters: number[]
  notes: string
  chapters: Chapter[] // filtered — skip_chapters removed
}

export interface Config {
  state_dir: string // ingest/plan/logs cache (default: ~/.poiesis)
  llm_model: string
  editor_cmd: string
  gemini_api_key?: string // stored here if GEMINI_API_KEY env var is not set
  // ponytail: github_owner + default_visibility added when GitHub push is wired (post-v0)
}
