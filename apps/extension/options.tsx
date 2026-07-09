import "~globals.css"

import { SettingsForm } from "~components/settings-form"

export default function Options() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center pt-12">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 w-full max-w-md p-6">
        <div className="flex items-center gap-2 mb-6">
          <span className="text-2xl">🧠</span>
          <h1 className="text-lg font-semibold text-gray-900">SupaTube Settings</h1>
        </div>

        <SettingsForm />

        <p className="text-xs text-gray-400 mt-4 text-center">
          All data stays on your machine. Zero cloud.
        </p>
      </div>
    </div>
  )
}
