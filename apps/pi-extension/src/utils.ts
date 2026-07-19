import { execSync } from "child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { dirname, resolve } from "path"

export const slugify = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)

export const expandHome = (p: string): string => p.replace(/^~/, process.env.HOME ?? "")

/**
 * Scan $HOME for directories that actually exist — used to build ask_user_question options
 * for the project location picker. Returns at most 4 (the tool's max per question).
 */
export const scanHomeDirs = (): { label: string; path: string }[] => {
  const home = process.env.HOME ?? ""
  const candidates = ["Desktop", "projects", "dev", "code", "Documents", "workspace", "src"]
  return candidates
    .filter((name) => existsSync(`${home}/${name}`))
    .slice(0, 4)
    .map((name) => ({ label: name, path: `${home}/${name}` }))
}

export const readJson = <T>(path: string): T => {
  const full = expandHome(path)
  return JSON.parse(readFileSync(full, "utf8")) as T
}

export const writeJson = (path: string, data: unknown): void => {
  const full = expandHome(path)
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, JSON.stringify(data, null, 2))
}

export const exists = (path: string): boolean => existsSync(expandHome(path))

export const run = (cmd: string, cwd?: string): string => {
  try {
    return execSync(cmd, {
      cwd: cwd ? expandHome(cwd) : undefined,
      encoding: "utf8",
      stdio: ["inherit", "pipe", "pipe"],
    }).trim()
  } catch (e: unknown) {
    const err = e as { stderr?: Buffer; message?: string }
    throw new Error(`Command failed: ${cmd}\n${err.stderr?.toString() ?? err.message ?? ""}`)
  }
}

export const ensureDir = (path: string): void => {
  mkdirSync(expandHome(path), { recursive: true })
}

// ponytail: self-check
if (process.argv[1]?.endsWith("utils.ts")) {
  const s = slugify("Build a Rust HTTP Server from Scratch!!")
  console.assert(s === "build-a-rust-http-server-from-scratch", `slugify failed: ${s}`)
  console.log("utils.ts: ok")
}
