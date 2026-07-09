import { useEffect, useState } from "react"

import { SETTINGS_DEFAULTS, type Settings } from "~schemas/settings.schema"

// ── Shared settings hook ──────────────────────────────────────────────────────
// Reads from chrome.storage.local. Keeps in sync via onChanged listener.

export const useSettings = (): Settings => {
  const [settings, setSettings] = useState<Settings>(SETTINGS_DEFAULTS)

  useEffect(() => {
    chrome.storage.local.get(SETTINGS_DEFAULTS, (data) => {
      setSettings(data as Settings)
    })

    const listener = (changes: Record<string, chrome.storage.StorageChange>) => {
      const relevant = Object.keys(SETTINGS_DEFAULTS)
      if (relevant.some((k) => k in changes)) {
        chrome.storage.local.get(SETTINGS_DEFAULTS, (data) => {
          setSettings(data as Settings)
        })
      }
    }

    chrome.storage.onChanged.addListener(listener)
    return () => chrome.storage.onChanged.removeListener(listener)
  }, [])

  return settings
}
