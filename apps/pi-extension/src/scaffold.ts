import { writeFileSync } from "fs"
import { join } from "path"
import type { IngestResult } from "./types.ts"
import { ensureDir, exists, run } from "./utils.ts"

export const scaffold = (projectDir: string, ingest: IngestResult): string => {
  if (exists(join(projectDir, ".git"))) {
    return projectDir
  }

  ensureDir(projectDir)

  run("git init -b main", projectDir)

  writeFileSync(
    join(projectDir, "README.md"),
    `# ${ingest.title}\n\nBuilt by poiesis from: ${ingest.yt_url}\nSee POIESIS.md for the chapter → commit map.\n`
  )
  writeFileSync(join(projectDir, "POIESIS.md"), "# Poiesis manifest — written on finalize\n")

  run("git add .", projectDir)
  run('git commit -m "chapter 0: scaffold"', projectDir)

  // ponytail: gh repo create + git push added post-v0
  return projectDir
}
