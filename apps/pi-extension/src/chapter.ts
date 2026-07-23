import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent"
import { readProgress } from "./progress.ts"
import {
  classifyPrompt,
  implementPrompt,
  planPrompt,
  prereqPrompt,
  theoryPrompt as theoryStepPrompt,
  writeTestsPrompt,
} from "./steps.ts"
import type { ChapterKind, ChapterStep, RecentProject, Roadmap, UserProfile } from "./types.ts"
import { exists, expandHome, readChapterState, writeChapterState } from "./utils.ts"

// ── Helpers ───────────────────────────────────────────────────────────────────

const chaptersDir = (projectDir: string): string =>
  join(expandHome(projectDir), ".poiesis", "chapters")

const chapterFile = (projectDir: string, n: number): string =>
  join(chaptersDir(projectDir), `chapter-${n}.md`)

const roadmapJsonFile = (projectDir: string): string =>
  join(chaptersDir(projectDir), "roadmap.json")
const techstackFile = (projectDir: string): string => join(chaptersDir(projectDir), "techstack.md")

const readFile = (path: string): string => readFileSync(path, "utf8")
const writeFile = (path: string, content: string): void => writeFileSync(path, content, "utf8")

// ── TDD file operations ───────────────────────────────────────────────────────

/**
 * Append a ## TDD section to chapter-N.md after classification + test writing.
 * Called once, before the RED phase begins.
 */
export const writeTddSection = (
  projectDir: string,
  chapter: number,
  testsFile: string,
  testNames: string[]
): void => {
  const path = chapterFile(projectDir, chapter)
  const existing = readFile(path)
  const section = `\n## TDD\n- Test file: \`${testsFile}\`\n- Status: 🟡 written, not passing\n- Tests: ${testNames.join(", ")}\n`
  writeFile(path, `${existing}${section}`)
}

/**
 * Update the Status line inside the ## TDD section.
 * ponytail: regex replace — avoids re-parsing the whole file.
 */
export const appendTddStatus = (projectDir: string, chapter: number, status: string): void => {
  const path = chapterFile(projectDir, chapter)
  const content = readFile(path)
  const updated = content.replace(/- Status: .+/, `- Status: ${status}`)
  writeFile(path, updated)
}

/**
 * Append a ## Reflection section to chapter-N.md on chapter_done.
 */
export const appendReflection = (projectDir: string, chapter: number, reflection: string): void => {
  const path = chapterFile(projectDir, chapter)
  const existing = readFile(path)
  writeFile(path, `${existing}\n## Reflection\n\n${reflection}\n`)
}

/**
 * Tick the chapter off in roadmap.json.
 */
export const checkOffChapter = (projectDir: string, chapter: number, kind: ChapterKind): void => {
  const path = roadmapJsonFile(projectDir)
  if (!exists(path)) return
  const roadmap = JSON.parse(readFile(path)) as Roadmap
  const entry = roadmap.chapters.find((c) => c.n === chapter)
  if (entry) {
    entry.done = true
    entry.kind = kind
  }
  writeFile(path, JSON.stringify(roadmap, null, 2))
}

/**
 * Build a compact past-chapters summary for the system prompt.
 * Reads only the ## Reflection block — never loads full chapter markdown.
 * ~1–3 lines per past chapter regardless of chapter length.
 * ponytail: grep reflection only — avoids loading full chapter markdown
 */
export const buildPastChaptersSummary = (projectDir: string, upTo: number): string => {
  const roadmapPath = roadmapJsonFile(projectDir)
  if (!exists(roadmapPath)) return ""
  const roadmap = JSON.parse(readFile(roadmapPath)) as Roadmap
  const progress = readProgress(projectDir)
  return roadmap.chapters
    .filter((c) => c.done && c.n < upTo)
    .map((c) => {
      const chFile = chapterFile(projectDir, c.n)
      const reflection = exists(chFile)
        ? (readFile(chFile)
            .match(/## Reflection\n\n([\s\S]+?)(?=\n##|$)/)?.[1]
            ?.trim() ?? "")
        : ""
      const status =
        c.kind === "theory"
          ? "\u2705 done"
          : progress.chapters[c.n]?.testsPass
            ? "\u2705 tests pass"
            : "\u26a0\ufe0f incomplete"
      return `${c.n} \u2014 ${c.title} (${c.kind ?? "code"}, ${status})\n   Reflection: ${reflection || "(none recorded)"}`.trim()
    })
    .join("\n")
}

/**
 * Build the full chapter context block injected into the system prompt via before_agent_start.
 * Past chapters: compact (reflection only, ~300 tokens for 10 chapters).
 * Current chapter markdown trimmed to ~8 000 chars.
 */
export const buildChapterContext = (
  projectDir: string,
  chapterMd: string,
  profile: UserProfile,
  n: number
): string => {
  const roadmapPath = roadmapJsonFile(projectDir)
  const roadmap = exists(roadmapPath) ? (JSON.parse(readFile(roadmapPath)) as Roadmap) : null
  const title = roadmap?.chapters.find((c) => c.n === n)?.title ?? `Chapter ${n}`
  const stack = profile.primaryStack.join(", ") || "unknown"
  const projects = profile.recentProjects
    .map((p) => `  - ${p.name}: ${p.summary} [${p.stack.join(", ")}]`)
    .join("\n")
  const past = buildPastChaptersSummary(projectDir, n)
  const trimmed =
    chapterMd.length > 8000 ? `${chapterMd.slice(0, 8000)}\n\u2026(truncated)` : chapterMd

  return [
    `## Active Chapter: ${n} \u2014 ${title}`,
    `Student stack: ${stack}`,
    `Recent projects:\n${projects}`,
    past ? `\n## Completed chapters\n${past}` : "",
    `\n## Current chapter content\n${trimmed}`,
  ]
    .filter(Boolean)
    .join("\n")
}

/**
 * Build the LLM injection for a chapter session.
 *
 * Code chapter flow (6 steps):
 *   1. Introduce what will be built
 *   2. Theory foundations + level-calibrated quiz (what & why before any code)
 *   3. Propose test plan
 *   4. Write test file
 *   5. Implement with "what & why" narration + wrong-answer TDD path
 *   6. Run tests → chapter_done
 *
 * Theory chapter: concepts → quiz → chapter_done (no code, no tests)
 */
export const chapterPrompt = (
  chapterMd: string,
  kind: ChapterKind,
  chapterNum: number,
  techstackMd = "",
  primaryStack: string[] = [],
  recentProjects: RecentProject[] = []
): string => {
  const profileContext = [
    `Stack:    ${primaryStack.join(", ") || "unknown"}`,
    "Projects:",
    ...recentProjects.map((p) => `  - ${p.name}: ${p.summary} [${p.stack.join(", ")}]`),
  ].join("\n")
  const tddSection =
    kind === "code"
      ? `
## Chapter session — follow these steps IN ORDER

You are a patient tutor, not a code generator.

**Step 0 — Prerequisite gate (run FIRST, before anything else)**

The student's profile:
${profileContext}

Look at this chapter's primary tech. Does it appear in their stack or project summaries?

FAMILIAR (tech is in their stack or they've built something with it):
  → Acknowledge in one sentence ("Looks like you've worked with X before — let's move fast.")
  → Skip the primer. Go directly to Step 1 with concise, tradeoff-focused explanations.

UNFAMILIAR (tech NOT in their known stack or projects):
  → Ask 2–3 prerequisite questions via ask_user_question about this chapter's foundational concept.
  → Scoring:
      2+ correct → proceed to Step 1 with normal depth
      0–1 correct → give a focused primer (key concept + one analogy, ~5 min read),
                    re-quiz once, then proceed regardless — never block progress

The gate outcome calibrates ALL remaining steps:
- Familiar / 2+ correct → concise, assume competence, focus on tradeoffs and edge cases
- Needed primer → slower pace, more analogies, explain before doing

**Step 1 — Introduce what will be built**
In 2–3 sentences: what concrete thing will the student have working by the end?
Frame it as an outcome, not a topic list. Calibrate depth based on Step 0 outcome.

**Step 2 — Theory foundations + quiz (before any code or tests)**
Explain the core "what and why" behind this chapter's approach — no code yet.
Calibrate depth based on Step 0 outcome.

Then quiz with 1–2 questions via ask_user_question:

⚠️ WRONG-ANSWER TDD PATH — if the student answers incorrectly:
1. Say "Let's see what happens" — don't reveal the answer
2. Implement their wrong answer via write/bash tools
3. Call \`poiesis_run_tests\` — the test will fail
4. Show the failure output in 1 sentence
5. Explain WHY it failed (the correct concept) in 2–3 sentences
6. Revert to the correct implementation
This makes the wrong path a teaching moment, not a dead end.

⚠️ LIVE RESEARCH RULE — you are a tutor, not a search engine from training data:
- Before explaining any concept: look up the official docs or spec with agent-browser
  so the explanation is current and accurate, not a recollection.
- Student challenges a claim: open the authoritative source live and settle it from
  evidence. Never argue from memory.
- You catch yourself saying "I think" or "I believe": stop, look it up, confirm first.

**Step 3 — Propose a test plan (DO NOT write code or call ask_user_question)**
Think of tests as learning checkpoints — each one proves the student built something real.

Call \`poiesis_confirm_test_plan\` with:
- chapterNum: ${chapterNum}
- intro: 1–2 sentences describing what the student will have built by the end
- tests: array of { name, why } — name in plain words, why in one sentence

Do NOT write the list in chat first. Do NOT call ask_user_question. The tool renders
its own full-screen dialog. Just call the tool.

If the tool returns "add": ask the student what to add, then re-call with the updated list.
If "skip": ask which one, then re-call without it.

**Step 4 — Write the test file**
Based on the chapter's tech stack, choose the right test framework and an appropriate file path
(e.g. \`tests/chapter-N.test.ts\` + vitest for TS, \`tests/test_chapter_N.py\` + pytest, etc.).
Write the test file yourself using the write tool.
Name tests after behaviour: \`server_returns_200_on_root\` not \`test_server\`.
No mocking unless I/O is the point.
After writing: "Done — <your test file> is our contract. Let's make these pass."

**Step 5 — YOU implement. Student is HITL for decisions + wrong-answer TDD.**

⚠️ CRITICAL RULES — violating these is a bug:
1. YOU run every shell command via the bash tool. The student NEVER runs commands manually.
   BAD: "Run this in your terminal: npm install"
   GOOD: call bash with "cd <project-dir> && npm install"

2. For interactive CLI scaffolders (npm create, create-vite, etc.) use non-interactive flags.
   GOOD: \`npm create hono@latest . -- --template cloudflare-workers\`
   NEVER ask the student to pick answers in their terminal.

3. Student HITL = architecture/design DECISIONS only.
   Ask via ask_user_question for: which template, library choice, project structure.
   Do NOT ask for: running commands, installing packages, creating files.

4. "What & why" narration: before each significant code block, one sentence on WHAT
   you're adding and WHY — not a lecture, just intent.

5. LIVE WEB RESEARCH — use agent-browser instead of guessing in any of these cases:
   a) TEACHING: before explaining a concept, look up the official docs or spec so the
      explanation is accurate, not a recollection. MDN, framework docs, stdlib refs.
   b) IN DEBATE: student challenges a claim → open the authoritative source live,
      quote it, settle it from evidence. Never argue from memory.
   c) SELF-CONFLICT: you catch yourself saying "I think..." or holding two contradicting
      ideas → stop and look it up before continuing.
   d) PACKAGES / APIs: before writing code that imports anything unfamiliar, check the
      actual API signature. pi.dev/packages, npmjs.com, or the GitHub README.
   e) ERRORS: unfamiliar error message → look it up. Don't guess the cause.
   Rule: if it's version-sensitive, spec-sensitive, or you'd say "I believe" — look it up.

6. Wrong-answer TDD on design choices: if the student picks a wrong design,
   implement it → call poiesis_run_tests → show failure → explain → correct.

7. If a command fails 3 times: THEN explain and ask the student. Otherwise handle silently.

Your code MUST make the test file you wrote pass. Don't modify the test file.
If a test seems wrong: raise it via ask_user_question before touching it.

**Step 6 — Run & complete**
Call \`poiesis_run_tests\` with chapter=${chapterNum} and cmd="<the runner + test file you chose>".
Fail → YOU diagnose + fix + re-run. No student involvement unless stuck after 3 attempts.
Pass → call \`poiesis_chapter_done\`.
`
      : ""

  const theoryGate =
    kind === "theory"
      ? `
## Theory chapter — no code, no tests

**Step 0 — Prerequisite gate (run FIRST)**

The student's profile:
${profileContext}

FAMILIAR: acknowledge in one sentence, proceed with concise tradeoff-focused questions.
UNFAMILIAR: 2–3 foundation questions → if <2 correct, give a primer, re-quiz once.
Calibrate all remaining steps based on the gate outcome.

Then:
1. Introduce the chapter concepts in 2–3 sentences — what and why, not a feature list.
2. Quiz the student on each key idea via ask_user_question.
   Calibrate question style based on Step 0 outcome:
   - Familiar / passed: "What are the tradeoffs?" / "What edge case does this miss?"
   - Needed primer: "What is X?" / "Why Y instead of Z?"
3. Wrong answer → gently correct with a brief explanation, then re-ask.
4. Once they demonstrate understanding of all key concepts, call \`poiesis_chapter_done\`.

⚠️ LIVE RESEARCH RULE — you are a tutor, not a static knowledge base:
- Before explaining any concept: look up the official docs or spec with agent-browser
  so the explanation is current and accurate, not a recollection.
- Student challenges a claim: open the authoritative source live and quote it.
  Never argue from memory.
- You catch yourself saying "I think" or "I believe": stop, look it up first.
`
      : ""

  const techstackSection = techstackMd ? `## Project Tech Stack\n\n${techstackMd}\n\n---\n\n` : ""

  return `# Chapter ${chapterNum} — Session

You are a patient, encouraging tutor. The student may be a beginner or an expert — calibrate your
explanations to their responses.

${techstackSection}Here is the chapter content for reference:

---
${chapterMd}
---
${tddSection}${theoryGate}`
}

// ── runChapter ────────────────────────────────────────────────────────────────

/**
 * Orchestrate one chapter: read state → resume from correct step.
 *
 * setSession is injected by index.ts to avoid a circular import.
 * It sets the module-level _projectDir / _chapterNum used by gate tools + event handlers.
 */
export const runChapter = async (
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  profile: UserProfile,
  projectDir: string,
  setSession: (dir: string, n: number) => void
): Promise<void> => {
  const p = readProgress(projectDir)
  const n = p.current
  const path = chapterFile(projectDir, n)

  if (!exists(path)) {
    ctx.ui.notify(`Chapter ${n} file not found at ${path}`, "error")
    return
  }

  // Register session state FIRST so gate tools and event handlers see it immediately
  setSession(projectDir, n)

  const profileContext = [
    `Stack: ${profile.primaryStack.join(", ") || "unknown"}`,
    "Projects:",
    ...profile.recentProjects.map((pr) => `  - ${pr.name}: ${pr.summary} [${pr.stack.join(", ")}]`),
  ].join("\n")

  const existingState = readChapterState(projectDir, n)

  // Fresh start: let pi classify from the chapter markdown (already in system context).
  // No pre-classification — the agent reads Current chapter content and calls
  // poiesis_chapter_classify, which sets meta + routes to prereq/theory.
  if (!existingState) {
    writeChapterState(projectDir, n, {
      step: "classify",
      prereqResult: null,
      testsFile: null,
      testsPlan: [],
      testsPass: false,
      startedAt: new Date().toISOString(),
    })
    pi.sendUserMessage(classifyPrompt(n))
    return
  }

  // Resume: dispatch to the correct step
  switch (existingState.step) {
    case "classify":
      pi.sendUserMessage(classifyPrompt(n))
      break
    case "prereq":
      pi.sendUserMessage(prereqPrompt(profileContext))
      break
    case "theory":
      pi.sendUserMessage(theoryStepPrompt(existingState.prereqResult ?? "familiar", n))
      break
    case "plan":
      pi.sendUserMessage(planPrompt(n))
      break
    case "write-tests":
      pi.sendUserMessage(writeTestsPrompt(existingState.testsPlan))
      break
    case "implement":
      pi.sendUserMessage(implementPrompt(existingState.testsFile ?? "(unknown)", n))
      break
  }
}

// ── self-check ────────────────────────────────────────────────────────────────

if (process.argv[1]?.endsWith("chapter.ts")) {
  ;(async () => {
    const { tmpdir } = await import("node:os")
    const { mkdirSync, rmSync } = await import("node:fs")
    const { initProgress } = await import("./progress.ts")

    const dir = join(tmpdir(), `poiesis-chapter-${Date.now()}`)
    const chDir = join(dir, ".poiesis", "chapters")
    mkdirSync(chDir, { recursive: true })

    // seed files
    writeFile(join(chDir, "chapter-1.md"), "# Chapter 1 — Intro\n\nSome content.\n")
    writeFile(
      join(chDir, "techstack.md"),
      "**Runtime**: Bun\n**Package manager**: bun\n**Framework**: Hono\n"
    )
    writeFile(
      join(chDir, "roadmap.json"),
      JSON.stringify(
        {
          name: "Project",
          chapters: [
            { n: 1, title: "Intro", duration: "0:00-5:00", done: false, kind: null },
            { n: 2, title: "Middleware", duration: "5:00-10:00", done: false, kind: null },
          ],
        },
        null,
        2
      )
    )
    initProgress(dir, 2, {
      "1": { type: "code", testsFile: null, testsPass: false },
      "2": { type: "theory", testsFile: null, testsPass: null },
    })

    // classifyChapter is gone — pi (the running agent) classifies via the
    // poiesis_chapter_classify tool. Nothing to self-check here.

    // writeTddSection
    writeTddSection(dir, 1, "tests/chapter-1.test.ts", ["server returns 200", "unknown route 404"])
    const after = readFile(join(chDir, "chapter-1.md"))
    console.assert(after.includes("## TDD"), "TDD section missing")
    console.assert(after.includes("🟡"), "initial status missing")

    // appendTddStatus
    appendTddStatus(dir, 1, "🟢 passing")
    const updated = readFile(join(chDir, "chapter-1.md"))
    console.assert(updated.includes("🟢 passing"), "status not updated")
    console.assert(!updated.includes("🟡"), "old status still present")

    // checkOffChapter
    checkOffChapter(dir, 1, "code")
    const roadmap = JSON.parse(readFile(join(chDir, "roadmap.json")))
    console.assert(roadmap.chapters[0].done === true, "chapter not ticked off")
    console.assert(roadmap.chapters[0].kind === "code", "kind not set")

    // appendReflection
    appendReflection(dir, 1, "Learned about routing.")
    const withReflection = readFile(join(chDir, "chapter-1.md"))
    console.assert(withReflection.includes("## Reflection"), "reflection section missing")

    // chapterPrompt — code chapter with profile context
    const testProjects = [
      { name: "hono-api", summary: "REST API with Hono", stack: ["TypeScript", "Hono"] },
    ]
    const prompt = chapterPrompt("# Ch1\nContent.", "code", 1, "", ["TypeScript"], testProjects)
    // Step 0 — prerequisite gate
    console.assert(prompt.includes("Prerequisite gate"), "Step 0 gate missing")
    console.assert(prompt.includes("FAMILIAR"), "FAMILIAR path missing")
    console.assert(prompt.includes("UNFAMILIAR"), "UNFAMILIAR path missing")
    console.assert(prompt.includes("hono-api"), "profile context (project name) missing")
    console.assert(prompt.includes("TypeScript"), "profile context (stack) missing")
    // Steps 1–6
    console.assert(prompt.includes("Introduce what will be built"), "intro step missing")
    console.assert(prompt.includes("Theory foundations"), "theory+quiz step missing")
    console.assert(prompt.includes("WRONG-ANSWER TDD PATH"), "wrong-answer TDD path missing")
    console.assert(prompt.includes("what and why"), "what-and-why narration missing")
    console.assert(prompt.includes("poiesis_confirm_test_plan"), "confirm tool call missing")
    console.assert(prompt.includes("poiesis_run_tests"), "run tests step missing")
    console.assert(
      prompt.includes("Do NOT call ask_user_question"),
      "step 3 must prohibit ask_user_question"
    )
    console.assert(prompt.includes("ask_user_question"), "hitl ask_user_question still needed")
    console.assert(prompt.includes("NEVER runs commands manually"), "agent must own all shell")
    console.assert(prompt.includes("non-interactive flags"), "must guide on non-interactive CLIs")
    console.assert(prompt.includes("fails 3 times"), "must define retry-then-escalate rule")
    console.assert(
      prompt.includes("LIVE WEB RESEARCH"),
      "code chapter must include live web research rule"
    )
    console.assert(
      prompt.includes("LIVE RESEARCH RULE"),
      "code chapter theory+quiz step must include live research rule"
    )
    // experienceLevel must NOT be statically baked in
    console.assert(!prompt.includes("experienceLevel"), "experienceLevel must not appear in prompt")
    // theory chapter
    const theoryPrompt = chapterPrompt("# Ch2\nConcepts.", "theory", 2, "", ["Go"], [])
    console.assert(
      !theoryPrompt.includes("test file"),
      "test file must not appear in theory prompt"
    )
    console.assert(theoryPrompt.includes("Theory chapter"), "theory gate missing")
    console.assert(theoryPrompt.includes("Prerequisite gate"), "theory also needs Step 0 gate")
    console.assert(theoryPrompt.includes("what and why"), "theory also needs what-and-why")
    console.assert(
      theoryPrompt.includes("LIVE RESEARCH RULE"),
      "theory chapter must include live research rule"
    )

    // buildPastChaptersSummary — run AFTER checkOffChapter + appendReflection so chapter 1 is done
    const past = buildPastChaptersSummary(dir, 2) // upTo=2: chapter 1 (n=1 < 2) included
    console.assert(past.includes("1 — Intro"), `past summary missing chapter 1: ${past}`)
    console.assert(!past.includes("2 —"), `past summary must not include chapter 2: ${past}`)
    console.assert(past.includes("Reflection:"), `past summary missing reflection label: ${past}`)
    console.assert(
      past.includes("Learned about routing."),
      `past summary missing reflection text: ${past}`
    )
    // no past chapters when upTo=1
    const noPast = buildPastChaptersSummary(dir, 1)
    console.assert(noPast === "", `upTo=1 should return empty string: '${noPast}'`)

    // buildChapterContext
    const testProf: UserProfile = {
      primaryStack: ["TypeScript"],
      recentProjects: [{ name: "hono-api", summary: "REST API", stack: ["TypeScript"] }],
      recentActivity: "building APIs",
      scannedAt: new Date().toISOString(),
    }
    const ctxOut = buildChapterContext(dir, "# Ch2\nContent here.", testProf, 2)
    console.assert(
      ctxOut.includes("## Active Chapter: 2 — Middleware"),
      `context missing chapter header: ${ctxOut.slice(0, 300)}`
    )
    console.assert(
      ctxOut.includes("## Completed chapters"),
      `context missing completed section: ${ctxOut.slice(0, 300)}`
    )
    console.assert(ctxOut.includes("## Current chapter content"), "context missing content section")
    console.assert(ctxOut.includes("TypeScript"), "context missing stack")
    console.assert(ctxOut.includes("hono-api"), "context missing project")
    console.assert(ctxOut.includes("# Ch2"), "context missing chapter markdown")

    rmSync(dir, { recursive: true })
    console.log("chapter.ts: ok")
  })()
}
