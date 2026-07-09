import { useEffect, useState } from "react"

import {
  SETTINGS_DEFAULTS,
  type Settings,
  saveSettings,
  settingsSchema,
} from "~schemas/settings.schema"
import { probeSupermemory } from "~services/http"

interface Props {
  onSaved?: () => void
}

export const SettingsForm = ({ onSaved }: Props) => {
  const [form, setForm] = useState<Settings>(SETTINGS_DEFAULTS)
  const [errors, setErrors] = useState<Partial<Record<keyof Settings, string>>>({})
  const [saved, setSaved] = useState(false)
  const [probeStatus, setProbeStatus] = useState<"idle" | "ok" | "fail">("idle")
  const [probing, setProbing] = useState(false)

  useEffect(() => {
    chrome.storage.local.get(SETTINGS_DEFAULTS, (data) => {
      setForm(data as Settings)
    })
  }, [])

  const handleChange = (field: keyof Settings, value: string | number) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    setErrors((prev) => ({ ...prev, [field]: undefined }))
    setSaved(false)
  }

  const handleSave = () => {
    const result = settingsSchema.safeParse(form)
    if (!result.success) {
      const flat = result.error.flatten().fieldErrors
      setErrors(Object.fromEntries(Object.entries(flat).map(([k, v]) => [k, (v as string[])[0]])))
      return
    }
    void saveSettings(result.data).then(() => {
      setSaved(true)
      onSaved?.()
      setTimeout(() => setSaved(false), 2000)
    })
  }

  const handleProbe = async () => {
    setProbing(true)
    setProbeStatus("idle")
    const ok = await probeSupermemory()
    setProbeStatus(ok ? "ok" : "fail")
    setProbing(false)
  }

  return (
    <div className="space-y-4">
      {/* API Key */}
      <div>
        <label htmlFor="apiKey" className="block text-xs font-medium text-gray-700 mb-1">
          API Key
        </label>
        <input
          id="apiKey"
          type="password"
          className={`w-full border rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-red-400 ${errors.apiKey ? "border-red-400" : "border-gray-300"}`}
          value={form.apiKey}
          onChange={(e) => handleChange("apiKey", e.target.value)}
          placeholder="Paste from ~/.supermemory/env"
        />
        {errors.apiKey && <p className="text-xs text-red-500 mt-0.5">{errors.apiKey}</p>}
        <p className="text-xs text-gray-400 mt-0.5">
          Run <code className="bg-gray-100 px-1 rounded">supermemory-server</code> then copy the
          key.
        </p>
      </div>

      {/* Base URL */}
      <div>
        <label htmlFor="baseURL" className="block text-xs font-medium text-gray-700 mb-1">
          Server URL
        </label>
        <input
          id="baseURL"
          type="text"
          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-red-400"
          value={form.baseURL}
          onChange={(e) => handleChange("baseURL", e.target.value)}
        />
        <div className="flex items-center gap-2 mt-1">
          <button
            type="button"
            onClick={handleProbe}
            disabled={probing}
            className="text-xs text-blue-600 hover:underline disabled:opacity-50"
          >
            {probing ? "Testing…" : "Test connection"}
          </button>
          {probeStatus === "ok" && <span className="text-xs text-green-600">✓ Connected</span>}
          {probeStatus === "fail" && <span className="text-xs text-red-500">✗ Not reachable</span>}
        </div>
      </div>

      {/* Container Tag */}
      <div>
        <label htmlFor="containerTag" className="block text-xs font-medium text-gray-700 mb-1">
          Container Tag
        </label>
        <input
          id="containerTag"
          type="text"
          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-red-400"
          value={form.containerTag}
          onChange={(e) => handleChange("containerTag", e.target.value)}
        />
        <p className="text-xs text-gray-400 mt-0.5">Groups your memories. Default: user_default</p>
      </div>

      {/* Gate Threshold */}
      <div>
        <label htmlFor="gateThreshold" className="block text-xs font-medium text-gray-700 mb-1">
          Memory Gate threshold: <span className="font-mono">{form.gateThreshold.toFixed(2)}</span>
        </label>
        <input
          id="gateThreshold"
          type="range"
          min={0}
          max={1}
          step={0.05}
          className="w-full"
          value={form.gateThreshold}
          onChange={(e) => handleChange("gateThreshold", Number.parseFloat(e.target.value))}
        />
        <div className="flex justify-between text-xs text-gray-400">
          <span>Save more</span>
          <span>Save less</span>
        </div>
      </div>

      {/* Save button */}
      <button
        type="button"
        onClick={handleSave}
        className="w-full bg-red-500 hover:bg-red-600 text-white text-sm font-medium py-1.5 rounded transition-colors"
      >
        {saved ? "✓ Saved" : "Save settings"}
      </button>
    </div>
  )
}
