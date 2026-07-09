import "~globals.css"

import { useState } from "react"

import { SettingsForm } from "~components/settings-form"
import { useMemoryDelete } from "~hooks/use-memory-delete"
import { useMemoryList } from "~hooks/use-memory-list"
import { useMemoryProfile } from "~hooks/use-memory-profile"
import { useMemorySearch } from "~hooks/use-memory-search"
import { useSettings } from "~hooks/use-settings"

// ── Tab type ──────────────────────────────────────────────────────────────────

type Tab = "recall" | "foryou" | "timeline" | "settings"

// ── Metadata accessor helper ──────────────────────────────────────────────────

const getMeta = (metadata: unknown, key: string): string => {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return ""
  return String((metadata as Record<string, unknown>)[key] ?? "")
}

// ── Recall Tab ────────────────────────────────────────────────────────────────

const RecallTab = ({ containerTag }: { containerTag: string }) => {
  const [q, setQ] = useState("")
  const [debouncedQ, setDebouncedQ] = useState("")
  const { data, isLoading } = useMemorySearch(debouncedQ, containerTag)

  const handleChange = (value: string) => {
    setQ(value)
    clearTimeout((handleChange as { timer?: ReturnType<typeof setTimeout> }).timer)
    ;(handleChange as { timer?: ReturnType<typeof setTimeout> }).timer = setTimeout(
      () => setDebouncedQ(value),
      300
    )
  }

  const openVideo = (url: string) => {
    chrome.tabs.create({ url })
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-gray-100">
        <input
          type="text"
          placeholder="Search your memories…"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-400"
          value={q}
          onChange={(e) => handleChange(e.target.value)}
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && <p className="text-xs text-gray-400 p-4">Searching…</p>}
        {!isLoading && debouncedQ && (!data || data.length === 0) && (
          <p className="text-xs text-gray-400 p-4">No memories found for "{debouncedQ}"</p>
        )}
        {!debouncedQ && (
          <p className="text-xs text-gray-400 p-4">Type to search your saved videos…</p>
        )}
        {data?.map((result) => (
          <button
            key={result.documentId}
            type="button"
            onClick={() =>
              openVideo(
                getMeta(result.metadata, "url") ||
                  `https://www.youtube.com/watch?v=${getMeta(result.metadata, "videoId")}`
              )
            }
            className="w-full text-left p-3 border-b border-gray-50 hover:bg-gray-50 transition-colors"
          >
            <p className="text-sm font-medium text-gray-900 line-clamp-1">
              {result.title ?? getMeta(result.metadata, "title")}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">{getMeta(result.metadata, "channel")}</p>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── For You Tab ───────────────────────────────────────────────────────────────

const ClusterRow = ({ cluster, containerTag }: { cluster: string; containerTag: string }) => {
  const { data } = useMemorySearch(cluster, containerTag)
  if (!data || data.length === 0) return null

  return (
    <div className="mb-4">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-3 mb-2">
        {cluster}
      </h3>
      <div className="flex gap-2 overflow-x-auto px-3 pb-2">
        {data.slice(0, 6).map((r) => {
          const thumb =
            getMeta(r.metadata, "thumbnailUrl") ||
            `https://img.youtube.com/vi/${getMeta(r.metadata, "videoId")}/mqdefault.jpg`
          const url = getMeta(r.metadata, "url")
          return (
            <button
              key={r.documentId}
              type="button"
              onClick={() => chrome.tabs.create({ url })}
              className="flex-shrink-0 w-36 text-left rounded-lg overflow-hidden border border-gray-100 hover:border-red-300 transition-colors"
            >
              <img src={thumb} alt="" className="w-full h-20 object-cover bg-gray-100" />
              <div className="p-1.5">
                <p className="text-xs font-medium text-gray-800 line-clamp-2 leading-tight">
                  {r.title ?? getMeta(r.metadata, "title")}
                </p>
                <p className="text-xs text-gray-400 mt-0.5 truncate">
                  {getMeta(r.metadata, "channel")}
                </p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

const ForYouTab = ({ containerTag }: { containerTag: string }) => {
  const { data, isLoading, refetch } = useMemoryProfile(containerTag)
  const clusters = data?.dynamic?.slice(0, 5) ?? []

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-3 border-b border-gray-100">
        <span className="text-xs font-semibold text-gray-700">Your interests</span>
        <button
          type="button"
          onClick={() => refetch()}
          className="text-xs text-red-500 hover:text-red-600"
        >
          ↻ Refresh
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {isLoading && <p className="text-xs text-gray-400 p-4">Building your taste profile…</p>}
        {!isLoading && clusters.length === 0 && (
          <p className="text-xs text-gray-400 p-4">Save 5+ videos to see personalized picks.</p>
        )}
        {clusters.map((cluster) => (
          <ClusterRow key={cluster} cluster={cluster} containerTag={containerTag} />
        ))}
      </div>
    </div>
  )
}

// ── Timeline Tab ──────────────────────────────────────────────────────────────

const TimelineTab = ({ containerTag }: { containerTag: string }) => {
  const { data, isLoading, setData } = useMemoryList(containerTag, 100)
  const { mutate: deleteDoc } = useMemoryDelete()

  const handleDelete = (id: string) => {
    setData((prev) => prev.filter((d) => d.id !== id))
    void deleteDoc(id)
  }
  const [channelFilter, setChannelFilter] = useState("")

  const memories = data ?? []
  const filtered = channelFilter
    ? memories.filter((m) =>
        getMeta(m.metadata, "channel").toLowerCase().includes(channelFilter.toLowerCase())
      )
    : memories

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-gray-100">
        <input
          type="text"
          placeholder="Filter by channel…"
          className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-red-400"
          value={channelFilter}
          onChange={(e) => setChannelFilter(e.target.value)}
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && <p className="text-xs text-gray-400 p-4">Loading…</p>}
        {!isLoading && filtered.length === 0 && (
          <p className="text-xs text-gray-400 p-4">No saved videos yet. Watch YouTube!</p>
        )}
        {filtered.map((doc) => {
          const watchPct = getMeta(doc.metadata, "watchPercent")
          const gateSource = getMeta(doc.metadata, "gateSource")
          const savedAt = doc.createdAt ? new Date(doc.createdAt).toLocaleDateString() : ""
          return (
            <div
              key={doc.id}
              className="flex items-start gap-2 p-3 border-b border-gray-50 hover:bg-gray-50"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 line-clamp-1">
                  {getMeta(doc.metadata, "title")}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-gray-500">{getMeta(doc.metadata, "channel")}</span>
                  {watchPct && (
                    <span className="text-xs bg-gray-100 text-gray-500 px-1.5 rounded">
                      {watchPct}%
                    </span>
                  )}
                  {gateSource && (
                    <span
                      className={`text-xs px-1.5 rounded ${gateSource === "memory-gate" ? "bg-blue-50 text-blue-600" : "bg-gray-100 text-gray-500"}`}
                    >
                      {gateSource === "memory-gate" ? "AI" : "Heuristic"}
                    </span>
                  )}
                  {savedAt && <span className="text-xs text-gray-400">{savedAt}</span>}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(doc.id)}
                className="text-gray-300 hover:text-red-500 transition-colors text-lg leading-none mt-0.5 flex-shrink-0"
                title="Delete"
              >
                ×
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Settings Tab ──────────────────────────────────────────────────────────────

const SettingsTab = ({ containerTag }: { containerTag: string }) => {
  const { data: memories } = useMemoryList(containerTag, 9999)
  const { mutate: deleteDoc } = useMemoryDelete()
  const [wiping, setWiping] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  const handleWipe = async () => {
    if (!confirmed) {
      setConfirmed(true)
      return
    }
    setWiping(true)
    for (const doc of memories ?? []) {
      await deleteDoc(doc.id)
    }
    setWiping(false)
    setConfirmed(false)
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-6">
      <SettingsForm />

      <div className="border-t border-gray-100 pt-4">
        <h3 className="text-xs font-semibold text-gray-700 mb-2">Danger zone</h3>
        <p className="text-xs text-gray-400 mb-3">
          Wipes all saved memories from your local Supermemory store. This cannot be undone.
          {/* Risk note: limit:9999 may time out for >500 docs — post-hackathon: paginated loop */}
        </p>
        <button
          type="button"
          onClick={handleWipe}
          disabled={wiping}
          className={`text-xs px-3 py-1.5 rounded border transition-colors ${confirmed ? "bg-red-500 text-white border-red-500 hover:bg-red-600" : "border-red-300 text-red-500 hover:bg-red-50"}`}
        >
          {wiping ? "Wiping…" : confirmed ? "Confirm — wipe all memory" : "Wipe all memory"}
        </button>
        {confirmed && (
          <button
            type="button"
            onClick={() => setConfirmed(false)}
            className="ml-2 text-xs text-gray-400 hover:text-gray-600"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}

// ── Shell ─────────────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string }[] = [
  { id: "recall", label: "🔍 Recall" },
  { id: "foryou", label: "✨ For You" },
  { id: "timeline", label: "📋 Timeline" },
  { id: "settings", label: "⚙ Settings" },
]

const SidePanelShell = () => {
  const [activeTab, setActiveTab] = useState<Tab>("recall")
  const { containerTag } = useSettings()

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Tab bar */}
      <div className="flex border-b border-gray-200 bg-gray-50">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2.5 text-xs font-medium transition-colors ${activeTab === tab.id ? "text-red-600 border-b-2 border-red-500 bg-white" : "text-gray-500 hover:text-gray-700"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {activeTab === "recall" && <RecallTab containerTag={containerTag} />}
        {activeTab === "foryou" && <ForYouTab containerTag={containerTag} />}
        {activeTab === "timeline" && <TimelineTab containerTag={containerTag} />}
        {activeTab === "settings" && <SettingsTab containerTag={containerTag} />}
      </div>
    </div>
  )
}

export default function SidePanel() {
  return <SidePanelShell />
}
