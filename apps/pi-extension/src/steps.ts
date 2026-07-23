/**
 * Step prompt functions — each loads a .md template from prompts/ and renders {{vars}}.
 * The .md files are the source of truth; edit them directly to tune prompts.
 * Consumed by runChapter (on resume) and by gate tools (on advance).
 */

import { readFileSync } from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url"

const PROMPTS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "prompts")

// ponytail: flat {{var}} replace — no handlebars needed for 5 simple templates
const render = (tmpl: string, vars: Record<string, string>): string =>
  tmpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`)

const load = (name: string, vars: Record<string, string> = {}): string =>
  render(readFileSync(join(PROMPTS_DIR, `${name}.md`), "utf8").trim(), vars)

export const classifyPrompt = (chapterNum: number): string =>
  load("classify", { chapterNum: String(chapterNum) })

export const prereqPrompt = (profileContext: string): string => load("prereq", { profileContext })

export const theoryPrompt = (prereqResult: "familiar" | "primed", chapterNum: number): string =>
  load("theory", { prereqResult, chapterNum: String(chapterNum) })

export const planPrompt = (chapterNum: number): string =>
  load("plan", { chapterNum: String(chapterNum) })

export const writeTestsPrompt = (testsPlan: Array<{ name: string; why: string }>): string =>
  load("write-tests", {
    testsPlan: testsPlan.map((t, i) => `  ${i + 1}. ${t.name} — ${t.why}`).join("\n"),
  })

export const implementPrompt = (testsFile: string, chapterNum: number): string =>
  load("implement", { testsFile, chapterNum: String(chapterNum) })

// ponytail: self-check — no LLM, just verify templates load and vars substitute
if (import.meta.url === `file://${process.argv[1]}`) {
  const c = classifyPrompt(4)
  console.assert(c.includes("Chapter 4"), "classifyPrompt missing chapterNum")
  console.assert(c.includes("poiesis_chapter_classify"), "classifyPrompt missing tool call")
  console.assert(!c.includes("{{"), "classifyPrompt has unresolved vars")

  const p = prereqPrompt("Stack: TypeScript\n  - hono-api: REST API")
  console.assert(p.includes("FAMILIAR"), "prereqPrompt missing FAMILIAR path")
  console.assert(p.includes("UNFAMILIAR"), "prereqPrompt missing UNFAMILIAR path")
  console.assert(!p.includes("{{"), "prereqPrompt has unresolved vars")

  const t = theoryPrompt("primed", 3)
  console.assert(t.includes("Prereq result: primed"), "theoryPrompt missing prereqResult")
  console.assert(t.includes("LIVE RESEARCH RULE"), "theoryPrompt missing live research rule")
  console.assert(t.includes("poiesis_theory_done"), "theoryPrompt missing gate call")
  console.assert(!t.includes("{{"), "theoryPrompt has unresolved vars")

  const pl = planPrompt(3)
  console.assert(pl.includes("chapterNum: 3"), "planPrompt missing chapterNum")
  console.assert(pl.includes("poiesis_confirm_test_plan"), "planPrompt missing tool call")
  console.assert(!pl.includes("{{"), "planPrompt has unresolved vars")

  const wt = writeTestsPrompt([{ name: "server 200", why: "proves server starts" }])
  console.assert(wt.includes("server 200"), "writeTestsPrompt missing test name")
  console.assert(wt.includes("poiesis_tests_written"), "writeTestsPrompt missing gate call")
  console.assert(!wt.includes("{{"), "writeTestsPrompt has unresolved vars")

  const imp = implementPrompt("tests/chapter-3.test.ts", 3)
  console.assert(imp.includes("tests/chapter-3.test.ts"), "implementPrompt missing testsFile")
  console.assert(imp.includes("chapter=3"), "implementPrompt missing chapterNum in run call")
  console.assert(imp.includes("CRITICAL RULES"), "implementPrompt missing critical rules")
  console.assert(!imp.includes("{{"), "implementPrompt has unresolved vars")

  console.log("steps.ts: ok")
}
