import { z } from "zod"

export const settingsSchema = z.object({
  apiKey: z.string().min(1, "API key is required"),
  baseURL: z.string().url().default("http://localhost:6767"), // SDK singleton + health probe
  containerTag: z.string().min(1).default("user_default"),
  gateThreshold: z.number().min(0).max(1).default(0.6), // 0–1; same scale for both gates
})

export type Settings = z.infer<typeof settingsSchema>

// ── Storage helpers ───────────────────────────────────────────────────────────

export const SETTINGS_DEFAULTS: Settings = {
  apiKey: "",
  baseURL: "http://localhost:6767",
  containerTag: "user_default",
  gateThreshold: 0.6,
}

export const loadSettings = (): Promise<Settings> =>
  new Promise((resolve) =>
    chrome.storage.local.get(SETTINGS_DEFAULTS, (data) => resolve(data as Settings))
  )

export const saveSettings = (partial: Partial<Settings>): Promise<void> =>
  new Promise((resolve) => chrome.storage.local.set(partial, resolve))
