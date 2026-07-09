import Supermemory from "supermemory"

import { createLogger } from "~lib/logger"

const logger = createLogger("supermemory")

// ── Client cache ──────────────────────────────────────────────────────────────
// Cached per service-worker lifetime. Keyed by apiKey so that if the user
// updates their key, the next call re-creates the client automatically.

let cachedClient: Supermemory | null = null
let cachedApiKey: string | null = null

// ── SDK singleton ─────────────────────────────────────────────────────────────
// Always reads from chrome.storage.local at call time — never at module level.
// The SW may start before storage is populated.

export const getSupermemoryClient = async (): Promise<Supermemory> => {
  const { apiKey = "", baseURL = "http://localhost:6767" } = await chrome.storage.local.get({
    apiKey: "",
    baseURL: "http://localhost:6767",
  })

  if (cachedClient && cachedApiKey === apiKey) {
    return cachedClient
  }

  logger.info({ baseURL }, "creating Supermemory client")

  cachedClient = new Supermemory({
    apiKey: apiKey as string,
    baseURL: (baseURL as string) || "http://localhost:6767",
  })
  cachedApiKey = apiKey as string

  return cachedClient
}

// ── Invalidate cache (e.g. when storage changes) ──────────────────────────────
export const invalidateSupermemoryClient = () => {
  cachedClient = null
  cachedApiKey = null
}
