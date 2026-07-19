import type { Config } from "./types.ts"
import { exists, readJson, writeJson } from "./utils.ts"

export const CONFIG_PATH = "~/.poiesis/config.json"

export const loadConfig = (): Config | null => {
  if (!exists(CONFIG_PATH)) return null
  return readJson<Config>(CONFIG_PATH)
}

export const saveConfig = (cfg: Config): void => writeJson(CONFIG_PATH, cfg)

export const defaultConfig = (): Config => ({
  state_dir: "~/.poiesis",
})
