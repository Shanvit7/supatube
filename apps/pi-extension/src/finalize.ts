import { writeFileSync } from "fs"
import { join } from "path"
import type { Config, IngestResult, Plan } from "./types.ts"
import { expandHome, readJson, run } from "./utils.ts"

export const finalize = (slug: string, cfg: Config): string => {
  const stateDir = expandHome(cfg.state_dir)
  const plan = readJson<Plan>(`${stateDir}/builds/${slug}/plan.json`)
  const repoDir = plan.project_dir
  const ingest = readJson<IngestResult>(`${stateDir}/builds/${slug}/ingest.json`)

  const logLines = run("git log --oneline", repoDir).split("\n")
  const sha = (n: number) =>
    logLines.find((l) => l.toLowerCase().includes(`chapter ${n}:`))?.split(" ")[0] ?? "—"

  const rows = plan.chapters
    .map((ch) => {
      const ts = `${Math.floor(ch.start / 60)}:${String(ch.start % 60).padStart(2, "0")}`
      return `| ${ch.n} | ${ch.title} | [${ts}](${ingest.yt_url}&t=${ch.start}) | \`${sha(ch.n)}\` |`
    })
    .join("\n")

  const manifest = `# ${ingest.title}

Source: ${ingest.yt_url}
Built: ${new Date().toISOString()}
Stack: ${plan.stack.join(", ")}
Depth: ${plan.depth}
TDD: ${plan.tdd ? "yes" : "no"}

## Chapters

| # | Title | Video | Commit |
|---|-------|-------|--------|
${rows}

## Notes

${plan.notes || "None."}
`

  writeFileSync(join(repoDir, "POIESIS.md"), manifest)
  run("git add POIESIS.md", repoDir)
  run('git commit -m "poiesis: manifest"', repoDir)
  // ponytail: git push to GitHub added post-v0

  return repoDir
}
