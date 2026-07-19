# Poiesis — Roadmap

> **Loop engineering principle:** every feedback signal should be fast, mechanical,
> and unambiguous. The chapter loop has two nested feedback loops — an outer
> HITL quiz loop (human decides, agent executes) and an inner TDD loop
> (tests define done, not vibes). A chapter is complete when tests are green,
> full stop.

---

## Core model

```
OUTER LOOP — per chapter
│
├── [classify] is this chapter code-heavy or theory-only?
│
├── theory-only ──────────────────────────────────────┐
│   quiz heavy, no code, no tests                     │
│   done = user demonstrates conceptual understanding  │
│   via debate/answers, agent calls chapter_done       │
│                                                      │
└── code (or mixed) ───────────────────────────────── ▼
    │
    ├── [RED] agent writes tests first
    │         user reviews tests via ask_user_question
    │         "do these capture what chapter N should build?"
    │         user can challenge test design → agent updates
    │
    ├── INNER LOOP — per decision point
    │   ask_user_question → user decides → agent codes
    │   wrong answer → correct + debate → resolve → code
    │   repeat until all decisions exhausted
    │
    ├── [GREEN] poiesis_run_tests
    │   🔴 fail → agent reads output → fixes → re-runs  ← tight inner loop
    │   🟢 pass → chapter-N.md TDD status updated
    │
    └── poiesis_chapter_done  (gated — rejected if tests not 🟢)
```

---

## Current state (done)

```
/poiesis (run 1) → onboarding
/poiesis (run 2) → YT URL → Gemini → scaffold {name}/
                    chapters/chapter-index.md, summary.md, chapter-N.md
```

---

## Phase 1 — Project detection (unchanged from last design)

```
/poiesis
  ├── needsOnboarding?       → runOnboarding
  ├── hasActiveProject(cwd)? → runChapter(ctx)
  └── else                  → runProject
```

`findActiveProject(cwd)` globs `{cwd}/*/chapters/.progress.json`.

**Files:** `src/utils.ts`, `index.ts`

---

## Phase 2 — Progress state (extended)

```jsonc
// {cwd}/{name}/chapters/.progress.json
{
  "current": 2,
  "total": 8,
  "completed": [1],
  "startedAt": "…",
  "lastActiveAt": "…",
  "chapters": {
    "1": { "type": "code", "testsFile": "tests/chapter-1.test.ts", "testsPass": true },
    "2": { "type": "theory", "testsFile": null, "testsPass": null }
  }
}
```

`testsPass: null` = theory chapter (no gate).
`testsPass: false` = tests written but failing.
`testsPass: true` = chapter completable.

**New file:** `src/progress.ts`

---

## Phase 3 — Chapter classification (NEW, runs before kickoff)

One Gemini call on `chapter-N.md`:

```ts
// returns "code" | "theory" | "mixed"
// + suggested test file path + test runner command
const kind = await classifyChapter(chapterMd, profile.primaryStack)
```

`"mixed"` → treated as `"code"` (TDD applies whenever there's runnable output).

Stored in `.progress.json` under `chapters[N].type`.

**File:** `src/chapter.ts` (`classifyChapter`)

---

## Phase 4 — RED phase: agent writes tests first (NEW)

Only runs when `kind === "code" | "mixed"`.

Agent is instructed to:

```
Before writing ANY implementation, write the test file for this chapter.

Rules for tests:
- Tests are the spec. They encode what "done" looks like, not how it's done.
- Each test maps to one observable behavior from the chapter content.
- Use the simplest test runner available in the project's stack.
  (jest/vitest for TS, pytest for Python, cargo test for Rust, go test for Go)
- Name tests after BEHAVIOR, not implementation: test_server_returns_404_on_unknown_route
  not test_router_lookup_function.
- No mocking unless I/O is the point. Test real behavior.

After writing, show a summary: "I've written N tests covering: [list]."
Then call ask_user_question:
  "Do these tests capture what this chapter should build?"
  Options:
    A) Yes, let's proceed
    B) Missing something — [user types]
    C) Test for X is wrong — [user types]

If B or C: update tests accordingly, show diff, ask again.
Once confirmed: proceed to implementation.
```

The test file lands at `{cwd}/{name}/tests/chapter-N.{ext}`.
Chapter-N.md gets a TDD section appended:

```md
## TDD
- Test file: `tests/chapter-1.test.ts`
- Status: 🟡 written, not passing
- Tests: server returns 200, unknown route returns 404, handler is async
```

**File:** `src/chapter.ts` (`writeTddSection`)

---

## Phase 5 — HITL decision loop (existing, unchanged in shape)

Same `ask_user_question` quiz loop from previous design. Agent writes code
at each decision point. The difference: now the implementation is constrained
by the tests already written — the agent can't drift from the spec.

The prompt gains one new rule:

```
Your implementation must satisfy the tests already written in tests/chapter-N.{ext}.
Do not modify the test file. If you think a test is wrong, raise it via
ask_user_question before touching it.
```

---

## Phase 6 — `poiesis_run_tests` tool (NEW)

Called by the agent after implementation is written (or after any fix).

```ts
pi.registerTool("poiesis_run_tests", {
  description: "Run the chapter's test suite. Returns pass/fail + output.",
  parameters: Type.Object({
    chapter: Type.Number(),
    cmd: Type.String({ description: "e.g. 'npx vitest run tests/chapter-1.test.ts'" }),
  }),
  execute(_id, { chapter, cmd }, _signal, _onUpdate, ctx) {
    try {
      const output = run(cmd, ctx.cwd)  // from utils.ts
      markTestsPass(projectDir, chapter)
      appendTddStatus(projectDir, chapter, "🟢 passing")
      return { content: [{ type: "text", text: `PASS\n${output}` }], details: { pass: true } }
    } catch (e) {
      const out = String(e)
      appendTddStatus(projectDir, chapter, "🔴 failing")
      return { content: [{ type: "text", text: `FAIL\n${out}` }], details: { pass: false } }
    }
  }
})
```

On failure the agent reads the output, diagnoses, edits the implementation,
and calls `poiesis_run_tests` again. This inner loop runs entirely without
human involvement — it's the agent vs. the compiler/runtime. Tight, fast,
mechanical.

The agent surfaces failures to the user only when stuck after N attempts:

```
After 3 failed attempts to fix a test, call ask_user_question:
  "I'm stuck on [test name]. Here's the error: [output]"
  Options:
    A) Skip this test for now — mark it TODO
    B) Let me rethink — [user types hint]
    C) The test itself might be wrong — let's revisit it
```

---

## Phase 7 — `poiesis_chapter_done` tool (gated)

**Gate:** `testsPass === true || type === "theory"`. Hard reject otherwise.

```ts
execute(_id, { reflection }, _signal, _onUpdate, ctx) {
  const p = readProgress(projectDir)
  const chData = p.chapters[p.current]

  if (chData.type !== "theory" && !chData.testsPass) {
    return {
      content: [{ type: "text", text: "Cannot complete chapter — tests are not passing. Run poiesis_run_tests first." }],
      details: { error: "tests_not_passing" }
    }
  }

  advanceChapter(projectDir, reflection)
  checkOffChapter(projectDir, p.current)
  // … notify
}
```

The LLM cannot talk its way past this. The gate is in TypeScript, not in the prompt.

---

## Phase 8 — `roadmap.md` in every project

```md
# {name} — Roadmap

- [ ] Chapter 1 — Setting Up axum   (0:00–8:30)  🧪 TDD
- [ ] Chapter 2 — Routing           (8:30–20:00) 🧪 TDD
- [ ] Chapter 3 — Why async matters (20:00–28:00) 📖 Theory
…

Run `/poiesis` to start or resume.
```

`🧪 TDD` / `📖 Theory` set at scaffold time via classification? No — classification
happens per-chapter at runtime. So roadmap uses generic labels at scaffold;
after each chapter completes the emoji is updated in-place.

---

## What a session looks like end-to-end

```
$ /poiesis
  → detects chapter 1, type = "code"

  Agent: "Before we build anything, I'm writing the tests."
  [writes tests/chapter-1.test.ts — 4 tests]
  [ask_user_question: "Do these tests capture the chapter?"]
  User: "Missing error handling test"
  Agent: [adds test, shows diff]
  [ask_user_question again] → User: "Yes, good"

  Agent: "First decision: which HTTP framework?"
  [ask_user_question]
  User: picks hyper (wrong)
  Agent: "hyper means hand-rolling routing — axum gives that free.
         I'll use axum. Disagree?"
  User: "fine"
  Agent: [writes src/main.rs]

  [... 4 more decisions, code written at each ...]

  Agent: [calls poiesis_run_tests]
  → 3/4 passing, 1 failing: "error handler returns 500 not 404"
  Agent: [fixes handler]
  Agent: [calls poiesis_run_tests]
  → 4/4 passing 🟢

  Agent: [calls poiesis_chapter_done]
  → chapter-1.md TDD: 🟢 passing
  → roadmap.md: - [x] Chapter 1

$ /poiesis
  → chapter 2 begins
```

---

## Build order

| Step | What | File |
|------|------|------|
| 1 | `readProgress` / `writeProgress` / `advanceChapter` / `markTestsPass` | `src/progress.ts` (new) |
| 2 | `findActiveProject` | `src/utils.ts` (edit) |
| 3 | `buildRoadmap` + write `.progress.json` in `scaffoldChapters` | `src/project.ts` (edit) |
| 4 | `classifyChapter` (Gemini) | `src/chapter.ts` (new) |
| 5 | `chapterPrompt` — full injection with TDD rules + decision points | `src/chapter.ts` (new) |
| 6 | `runChapter` — orchestrates 3–5, fires `sendUserMessage` | `src/chapter.ts` (new) |
| 7 | `writeTddSection` / `appendTddStatus` / `appendReflection` / `checkOffChapter` | `src/chapter.ts` (new) |
| 8 | `poiesis_run_tests` tool registration | `index.ts` (edit) |
| 9 | `poiesis_chapter_done` with hard gate | `index.ts` (edit) |

**2 new files + 3 edits. No new dependencies.**

---

## Why this is loop engineering

```
Signal         Source          Latency       Human?
──────────────────────────────────────────────────
Test result    Runtime         <2s           No  ← tightest signal
Quiz answer    ask_user_q      ~5s           Yes
Chapter done   tool gate       <1ms          No  ← mechanical, not opinion
```

Three principles from loop engineering applied here:

1. **Make done verifiable, not opinionable.**
   A chapter isn't "done because the user is happy" — it's done because
   a process exited 0. The gate is in code, not in the prompt.

2. **Shrink the inner loop to machine speed.**
   test → fix → test runs without HITL. Humans enter only when the agent
   is genuinely stuck (after N attempts). Everything else is agent + runtime.

3. **Front-load the spec.**
   Tests written before implementation means every decision in the quiz loop
   is constrained by an already-agreed spec. The user isn't evaluating "is
   this code good" post-hoc — they co-authored the success criteria upfront.

---

## Out of scope (now)

- `/poiesis skip` — skip a chapter (set `testsPass: null`, mark skipped)
- `/poiesis replay N` — re-run chapter N from scratch
- Per-chapter difficulty stored in profile
- Watch mode: `poiesis_run_tests --watch` during implementation
