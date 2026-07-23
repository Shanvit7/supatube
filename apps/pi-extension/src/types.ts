// ── Chapter / Progress types ──────────────────────────────────────────────

export type ChapterKind = "code" | "theory"

export interface ChapterMeta {
  type: ChapterKind
  testsFile: string | null // null = theory chapter
  testsPass: boolean | null // null = theory; false = failing; true = passing
}

export interface Progress {
  current: number
  total: number
  completed: number[]
  startedAt: string
  lastActiveAt: string
  chapters: Record<string, ChapterMeta>
}

// ── User / Config types ─────────────────────────────────────────────────────

export interface RecentProject {
  name: string // repo or dir name
  summary: string // one sentence: what was built, key tech used
  stack: string[] // languages/frameworks in this project
}

export interface UserProfile {
  primaryStack: string[] // languages/frameworks used most across all projects
  recentProjects: RecentProject[] // up to 8 projects with context
  recentActivity: string // one-line human summary of recent work
  scannedAt: string // ISO timestamp — stale after 7 days
}

export interface Config {
  state_dir: string // ~/.poiesis by default
  scan_user?: boolean // undefined = not asked yet; true = opted in; false = opted out
  // ponytail: llm_model / editor_cmd / gemini_api_key removed with tutor/build stripdown
}

// ── Chapter step state ────────────────────────────────────────────────────────

export type ChapterStep = "classify" | "prereq" | "theory" | "plan" | "write-tests" | "implement"

export interface ChapterState {
  step: ChapterStep
  prereqResult: "familiar" | "primed" | null
  testsFile: string | null
  testsPlan: Array<{ name: string; why: string }>
  testsPass: boolean
  startedAt: string
}

// ── Roadmap types ─────────────────────────────────────────────────────────────

export interface RoadmapChapter {
  n: number
  title: string
  duration: string
  done: boolean
  kind: ChapterKind | null
}

export interface Roadmap {
  name: string
  chapters: RoadmapChapter[]
}
