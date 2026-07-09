// ── Health probe — only non-SDK network call allowed to :6767 ─────────────────
// Reads baseURL from chrome.storage.local so the probe always targets the
// server the user actually configured (not a hardcoded localhost).

export const probeSupermemory = async (): Promise<boolean> => {
  const { baseURL = "http://localhost:6767" } = await chrome.storage.local.get({
    baseURL: "http://localhost:6767",
  })
  try {
    const res = await fetch(`${baseURL as string}/health`, {
      signal: AbortSignal.timeout(2000),
    })
    return res.ok
  } catch {
    return false
  }
}
