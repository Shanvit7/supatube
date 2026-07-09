import "~globals.css"

import { useEffect, useState } from "react"

import { probeSupermemory } from "~services/http"

interface PopupState {
  connected: boolean | null // null = loading
  lastSavedAt: string | null
  savedToday: number
}

export default function Popup() {
  const [state, setState] = useState<PopupState>({
    connected: null,
    lastSavedAt: null,
    savedToday: 0,
  })

  useEffect(() => {
    // Probe server
    void probeSupermemory().then((connected) => setState((prev) => ({ ...prev, connected })))

    // Load capture stats
    const todayKey = `savedToday_${new Date().toISOString().slice(0, 10)}`
    chrome.storage.local.get({ lastSavedAt: null, [todayKey]: 0 }, (data) => {
      setState((prev) => ({
        ...prev,
        lastSavedAt: data.lastSavedAt as string | null,
        savedToday: (data[todayKey] as number) ?? 0,
      }))
    })
  }, [])

  const openSidePanel = () => {
    chrome.windows.getCurrent(({ id }) => {
      if (id !== undefined) {
        chrome.sidePanel.open({ windowId: id })
        window.close()
      }
    })
  }

  const openSettings = () => {
    chrome.runtime.openOptionsPage()
  }

  const formatLastSaved = (iso: string | null): string => {
    if (!iso) return "Never"
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60_000)
    if (mins < 1) return "Just now"
    if (mins < 60) return `${mins} min ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
  }

  return (
    <div className="w-72 p-4 font-sans">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xl">🧠</span>
        <span className="font-semibold text-gray-900 text-base">SupaTube</span>
      </div>

      {/* Connection status */}
      <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
        {state.connected === null ? (
          <span className="w-2 h-2 rounded-full bg-gray-300 animate-pulse" />
        ) : state.connected ? (
          <span className="w-2 h-2 rounded-full bg-green-500" />
        ) : (
          <span className="w-2 h-2 rounded-full bg-red-500" />
        )}
        <span className="text-xs text-gray-600">
          {state.connected === null
            ? "Checking…"
            : state.connected
              ? "Connected to local memory"
              : "Not connected — start supermemory-server"}
        </span>
      </div>

      {/* Open panel CTA */}
      <button
        type="button"
        onClick={openSidePanel}
        className="w-full bg-red-500 hover:bg-red-600 text-white text-sm font-medium py-2 rounded-lg transition-colors mb-3"
      >
        Open Memory Panel
      </button>

      {/* Stats */}
      <div className="flex justify-between text-xs text-gray-500 mb-4 px-1">
        <span>Last saved: {formatLastSaved(state.lastSavedAt)}</span>
        <span>
          Today: {state.savedToday} video{state.savedToday !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Settings link */}
      <button
        type="button"
        onClick={openSettings}
        className="w-full text-xs text-gray-400 hover:text-gray-600 py-1 transition-colors"
      >
        Settings
      </button>
    </div>
  )
}
