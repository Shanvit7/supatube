export interface UserProfile {
  primaryStack: string[] // languages/frameworks used most
  experienceLevel: "beginner" | "intermediate" | "senior"
  recentProjects: string[] // names of recent repos/dirs
  recentActivity: string // one-line human summary
  scannedAt: string // ISO timestamp — stale after 7 days
}

export interface Config {
  state_dir: string // ~/.poiesis by default
  scan_user?: boolean // undefined = not asked yet; true = opted in; false = opted out
  // ponytail: llm_model / editor_cmd / gemini_api_key removed with tutor/build stripdown
}
