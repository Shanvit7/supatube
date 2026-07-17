import type { Config } from "./types.ts"
import { exists, readJson, writeJson } from "./utils.ts"

export const CONFIG_PATH = "~/.poiesis/config.json"

export const loadConfig = (): Config | null => {
  if (!exists(CONFIG_PATH)) return null
  return readJson<Config>(CONFIG_PATH)
}

export const saveConfig = (cfg: Config): void => writeJson(CONFIG_PATH, cfg)

export const defaultConfig = (): Partial<Config> => ({
  state_dir: "~/.poiesis",
  llm_model: "gemini-3.5-flash",
  editor_cmd: "cursor",
  // ponytail: github_owner + default_visibility added post-v0 when GitHub push lands
})

export const getGeminiKey = (cfg: Config): string => {
  const key = process.env.GEMINI_API_KEY ?? cfg.gemini_api_key ?? ""
  if (!key) throw new Error("GEMINI_API_KEY not set. Add it in env or run /poiesis to set it up.")
  return key
}
