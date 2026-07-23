import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { DynamicBorder, getSelectListTheme } from "@earendil-works/pi-coding-agent"
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"
import { Container, type SelectItem, SelectList, Spacer, Text } from "@earendil-works/pi-tui"
import { Type } from "typebox"
import {
  appendReflection,
  appendTddStatus,
  buildChapterContext,
  checkOffChapter,
  runChapter,
  writeTddSection,
} from "./src/chapter.ts"
import { PROFILE_PATH, needsOnboarding, runOnboarding } from "./src/onboarding.ts"
import { advanceChapter, markTestsPass, readProgress, setChapterMeta } from "./src/progress.ts"
import { runProject } from "./src/project.ts"
import {
  implementPrompt,
  planPrompt,
  prereqPrompt,
  theoryPrompt as theoryStepPrompt,
  writeTestsPrompt,
} from "./src/steps.ts"
import type { ChapterStep, UserProfile } from "./src/types.ts"
import {
  expandHome,
  findActiveProject,
  readChapterState,
  readJson,
  run,
  writeChapterState,
  writeJson,
} from "./src/utils.ts"

// ── Session state — set by runChapter, used by gate tools + event handlers ────────
let _projectDir: string | null = null
let _chapterNum = 0

const setSessionState = (dir: string, n: number): void => {
  _projectDir = dir
  _chapterNum = n
}

const extension = (pi: ExtensionAPI): void => {
  // ── Tool: poiesis_save_profile ────────────────────────────────────────────
  pi.registerTool({
    name: "poiesis_save_profile",
    label: "Poiesis: Save Profile",
    description: "Save the user profile once all fields are known from the conversation.",
    parameters: Type.Object({
      primaryStack: Type.Array(Type.String(), { description: "Languages and frameworks they use" }),
      recentProjects: Type.Array(
        Type.Object({
          name: Type.String({ description: "Repo or directory name" }),
          summary: Type.String({ description: "One sentence: what was built and key tech used" }),
          stack: Type.Array(Type.String(), { description: "Languages/frameworks in this project" }),
        })
      ),
      recentActivity: Type.String({ description: "One-line summary" }),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const profile: UserProfile = { ...params, scannedAt: new Date().toISOString() }
      writeJson(PROFILE_PATH, profile)
      ctx.ui.notify("✅ Profile saved — run /poiesis to start your project.", "info")
      return {
        content: [
          { type: "text" as const, text: "Profile saved. Tell the user to run /poiesis now." },
        ],
        details: {},
      }
    },
  })

  // ── Tool: poiesis_confirm_test_plan ───────────────────────────────────
  // Shows the full test plan + choice in a full-screen TUI (no overlay) — owns keyboard focus.
  pi.registerTool({
    name: "poiesis_confirm_test_plan",
    label: "Poiesis: Review Test Plan",
    description:
      "Show the proposed test plan to the student in a scrollable TUI dialog. " +
      "Use this INSTEAD of ask_user_question for all test-plan confirmation steps.",
    parameters: Type.Object({
      chapterNum: Type.Number({ description: "Chapter number" }),
      intro: Type.String({
        description: "1\u20132 sentences: what the student will build by the end",
      }),
      tests: Type.Array(
        Type.Object({
          name: Type.String({ description: "Short test name in plain words" }),
          why: Type.String({ description: "One sentence: what it checks and why it matters" }),
        }),
        { minItems: 1, maxItems: 8, description: "3\u20135 test checkpoints" }
      ),
    }),
    async execute(_id, { chapterNum, intro, tests }, _signal, _onUpdate, ctx) {
      type Choice = "proceed" | "add" | "skip"

      // No overlay: true — plain custom() replaces the full TUI and owns keyboard focus.
      // overlay: true renders on top but never steals focus, so SelectList is un-navigable.
      const result = await ctx.ui.custom<Choice | null>((tui, theme, _kb, done) => {
        const root = new Container()
        const slTheme = getSelectListTheme()

        // Header
        root.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)))
        root.addChild(
          new Text(theme.fg("accent", theme.bold(`Chapter ${chapterNum} \u2014 Test Plan`)), 1, 0)
        )
        root.addChild(new Spacer(1))
        root.addChild(new Text(theme.fg("text", intro), 1, 0))
        root.addChild(new Spacer(1))
        root.addChild(new DynamicBorder((s: string) => theme.fg("borderMuted", s)))

        // Test list
        root.addChild(new Spacer(1))
        root.addChild(new Text(theme.fg("accent", "Learning checkpoints:"), 1, 0))
        root.addChild(new Spacer(1))
        tests.forEach((t, i) => {
          root.addChild(new Text(theme.bold(`  ${i + 1}. ${t.name}`), 1, 0))
          root.addChild(new Text(theme.fg("muted", `     ${t.why}`), 1, 0))
          if (i < tests.length - 1) root.addChild(new Spacer(1))
        })
        root.addChild(new Spacer(1))
        root.addChild(new DynamicBorder((s: string) => theme.fg("borderMuted", s)))

        // Choices
        const items: SelectItem[] = [
          {
            value: "proceed",
            label: "Looks good \u2014 write the tests",
            description: "Lock in this plan and start building",
          },
          { value: "add", label: "Add a checkpoint", description: "Tell me what else to verify" },
          { value: "skip", label: "Remove one", description: "Tell me which one to drop" },
        ]
        const list = new SelectList(items, items.length, slTheme)
        list.onSelect = (item) => done(item.value as Choice)
        list.onCancel = () => done(null)
        root.addChild(list)

        root.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)))
        root.addChild(
          new Text(
            theme.fg("dim", "\u2191\u2193 navigate \u00b7 Enter select \u00b7 Esc cancel"),
            1,
            0
          )
        )

        return {
          render: (w: number) => root.render(w),
          invalidate: () => root.invalidate(),
          handleInput: (data: string) => {
            list.handleInput(data)
            tui.requestRender()
          },
        }
      })

      if (result === null) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Student cancelled. Ask them how they want to proceed.",
            },
          ],
          details: { action: "cancelled" },
        }
      }

      if (result === "proceed") {
        if (_projectDir) {
          writeChapterState(_projectDir, _chapterNum, { step: "write-tests", testsPlan: tests })
        }
        return {
          content: [
            { type: "text" as const, text: `Test plan confirmed.\n\n${writeTestsPrompt(tests)}` },
          ],
          details: { action: "proceed", testCount: tests.length },
        }
      }

      const msgs: Record<"add" | "skip", string> = {
        add:
          "Student wants to add a checkpoint. Ask them: \u2018What behaviour would you like to also verify?\u2019 " +
          "Then call poiesis_confirm_test_plan again with the new test appended.",
        skip:
          "Student wants to remove a test. Ask them which one, then call poiesis_confirm_test_plan " +
          "again without that test.",
      }

      return {
        content: [{ type: "text" as const, text: msgs[result as "add" | "skip"] }],
        details: { action: result, testCount: tests.length },
      }
    },
  })

  // ── Tool: poiesis_run_tests ───────────────────────────────────────────────
  pi.registerTool({
    name: "poiesis_run_tests",
    label: "Poiesis: Run Tests",
    description: "Run the chapter's test suite. Returns pass/fail + output.",
    parameters: Type.Object({
      chapter: Type.Number({ description: "Chapter number" }),
      cmd: Type.String({ description: "e.g. 'npx vitest run tests/chapter-1.test.ts'" }),
    }),
    async execute(_id, { chapter, cmd }, _signal, _onUpdate, ctx) {
      const projectDir = findActiveProject(ctx.cwd)
      if (!projectDir) {
        return {
          content: [{ type: "text" as const, text: "No active project found in cwd." }],
          details: { pass: false },
        }
      }
      try {
        const output = run(cmd, projectDir)
        markTestsPass(projectDir, chapter)
        appendTddStatus(projectDir, chapter, "🟢 passing")
        return {
          content: [{ type: "text" as const, text: `PASS\n${output}` }],
          details: { pass: true },
        }
      } catch (e) {
        const out = String(e)
        appendTddStatus(projectDir, chapter, "🔴 failing")
        return {
          content: [{ type: "text" as const, text: `FAIL\n${out}` }],
          details: { pass: false },
        }
      }
    },
  })

  // ── Tool: poiesis_chapter_done (gated) ───────────────────────────────────
  pi.registerTool({
    name: "poiesis_chapter_done",
    label: "Poiesis: Chapter Done",
    description:
      "Mark the current chapter complete. GATED — rejected if tests are not passing (unless theory chapter). Always call poiesis_run_tests first for code chapters.",
    parameters: Type.Object({
      reflection: Type.String({
        description: "2–4 sentences on what the user learned and any struggles.",
      }),
    }),
    async execute(_id, { reflection }, _signal, _onUpdate, ctx) {
      const projectDir = findActiveProject(ctx.cwd)
      if (!projectDir) {
        return {
          content: [{ type: "text" as const, text: "No active project found in cwd." }],
          details: { error: "no_project" },
        }
      }

      const p = readProgress(projectDir)
      const chData = p.chapters[p.current]

      // ── GATE: tests must be green for code/mixed chapters ──────────────
      if (chData?.type !== "theory" && !chData?.testsPass) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Cannot complete chapter — tests are not passing. Run poiesis_run_tests first.",
            },
          ],
          details: { error: "tests_not_passing" },
        }
      }

      const completedChapter = p.current
      appendReflection(projectDir, completedChapter, reflection)
      checkOffChapter(projectDir, completedChapter, chData?.type ?? "code")
      advanceChapter(projectDir)

      const isLast = completedChapter >= p.total
      const msg = isLast
        ? `🎉 All ${p.total} chapters complete! Project finished.`
        : `✓ Chapter ${completedChapter} done — chapter ${completedChapter + 1} is next. Run /poiesis to continue.`

      ctx.ui.notify(msg, "info")
      return {
        content: [{ type: "text" as const, text: msg }],
        details: { completedChapter, nextChapter: isLast ? null : completedChapter + 1 },
      }
    },
  })

  // ── Tool: poiesis_prereq_done ──────────────────────────────────────────────
  // ── Tool: poiesis_chapter_classify ──────────────────────────────────
  // pi reads the chapter markdown (already in its system context via
  // before_agent_start) and decides code vs theory. No external LLM call.
  pi.registerTool({
    name: "poiesis_chapter_classify",
    label: "Poiesis: Classify Chapter",
    description:
      "Call FIRST in a fresh chapter session. Reads the chapter markdown from your " +
      "system context and decides code vs theory. Routes to the correct next step.",
    parameters: Type.Object({
      kind: Type.Union([Type.Literal("code"), Type.Literal("theory")], {
        description:
          '"code" = student will write/run code; "theory" = purely conceptual. Mixed → code.',
      }),
    }),
    async execute(_id, { kind }, _signal, _onUpdate, _ctx) {
      if (!_projectDir)
        return { content: [{ type: "text" as const, text: "No active chapter." }], details: {} }
      setChapterMeta(_projectDir, _chapterNum, kind, null)
      const nextStep: ChapterStep = kind === "theory" ? "theory" : "prereq"
      writeChapterState(_projectDir, _chapterNum, { step: nextStep })
      const profile = readJson<UserProfile>(PROFILE_PATH)
      const profileContext = [
        `Stack: ${profile.primaryStack.join(", ") || "unknown"}`,
        "Projects:",
        ...profile.recentProjects.map(
          (pr) => `  - ${pr.name}: ${pr.summary} [${pr.stack.join(", ")}]`
        ),
      ].join("\n")
      const nextPrompt =
        kind === "theory" ? theoryStepPrompt("familiar", _chapterNum) : prereqPrompt(profileContext)
      return {
        content: [{ type: "text" as const, text: `Classified: ${kind}.\n\n${nextPrompt}` }],
        details: { kind },
      }
    },
  })

  pi.registerTool({
    name: "poiesis_prereq_done",
    label: "Poiesis: Prereq Gate Done",
    description:
      "Call after the prerequisite calibration step completes. " +
      "Stores the result and fires the theory step prompt.",
    parameters: Type.Object({
      result: Type.Union([Type.Literal("familiar"), Type.Literal("primed")], {
        description: '"familiar" = tech is in student stack; "primed" = needed primer first',
      }),
    }),
    async execute(_id, { result }, _signal, _onUpdate, _ctx) {
      if (!_projectDir)
        return { content: [{ type: "text" as const, text: "No active chapter." }], details: {} }
      writeChapterState(_projectDir, _chapterNum, { step: "theory", prereqResult: result })
      return {
        content: [
          {
            type: "text" as const,
            text: `Prereq: ${result}.\n\n${theoryStepPrompt(result, _chapterNum)}`,
          },
        ],
        details: { result },
      }
    },
  })

  // ── Tool: poiesis_theory_done ───────────────────────────────────────────────
  pi.registerTool({
    name: "poiesis_theory_done",
    label: "Poiesis: Theory Done",
    description:
      "Call when the student has demonstrated understanding of the theory concepts. " +
      "Fires the test-plan step.",
    parameters: Type.Object({}),
    async execute(_id, _params, _signal, _onUpdate, _ctx) {
      if (!_projectDir)
        return { content: [{ type: "text" as const, text: "No active chapter." }], details: {} }
      writeChapterState(_projectDir, _chapterNum, { step: "plan" })
      return {
        content: [{ type: "text" as const, text: `Theory done.\n\n${planPrompt(_chapterNum)}` }],
        details: {},
      }
    },
  })

  // ── Tool: poiesis_tests_written ─────────────────────────────────────────────
  pi.registerTool({
    name: "poiesis_tests_written",
    label: "Poiesis: Tests Written",
    description: "Call after writing the test file. Stores the path and fires the implement step.",
    parameters: Type.Object({
      testsFile: Type.String({
        description: "Path to the test file, e.g. tests/chapter-3.test.ts",
      }),
      testNames: Type.Array(Type.String(), { description: "List of test names as written" }),
    }),
    async execute(_id, { testsFile, testNames }, _signal, _onUpdate, _ctx) {
      if (!_projectDir)
        return { content: [{ type: "text" as const, text: "No active chapter." }], details: {} }
      writeChapterState(_projectDir, _chapterNum, { step: "implement", testsFile })
      writeTddSection(_projectDir, _chapterNum, testsFile, testNames)
      setChapterMeta(_projectDir, _chapterNum, "code", testsFile)
      return {
        content: [
          {
            type: "text" as const,
            text: `Tests written at ${testsFile}.\n\n${implementPrompt(testsFile, _chapterNum)}`,
          },
        ],
        details: { testsFile },
      }
    },
  })

  // ── Bash pre-run review ─────────────────────────────────────────────
  // ponytail: safe-list = language-agnostic OS read-only commands only
  const SAFE_CMD =
    /^(cat |ls(?:$| )|grep |find |head |tail |wc |pwd$|echo [^>|]+$|diff |type |which |env$|printenv)/
  // agent-browser is trusted — runs without review
  const AGENT_TOOL = /^agent-browser /

  pi.on("tool_call", async (event, ctx) => {
    if (!_projectDir) return // only active during a Poiesis chapter session
    if (event.toolName !== "bash") return
    const cmd = ((event.input as Record<string, unknown>).command as string | undefined) ?? ""
    if (!cmd || SAFE_CMD.test(cmd.trimStart()) || AGENT_TOOL.test(cmd.trimStart())) return // auto-proceed for safe/trusted commands

    type BashChoice = "run" | "skip" | "explain" | "steer"

    const result = await ctx.ui.custom<BashChoice | null>((tui, theme, _kb, done) => {
      const root = new Container()

      root.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)))
      root.addChild(new Text(theme.fg("accent", theme.bold("⚡ Command Review")), 1, 0))
      root.addChild(new Spacer(1))

      // Show up to 3 wrapped lines of the command
      const chunks = cmd
        .split("\n")
        .flatMap((l) => {
          const parts: string[] = []
          for (let i = 0; i < l.length; i += 100) parts.push(l.slice(i, i + 100))
          return parts
        })
        .slice(0, 4)
      for (const line of chunks) root.addChild(new Text(theme.fg("text", `  ${line}`), 1, 0))
      if (cmd.length > 400) root.addChild(new Text(theme.fg("muted", "  … (truncated)"), 1, 0))

      root.addChild(new Spacer(1))
      root.addChild(new DynamicBorder((s: string) => theme.fg("borderMuted", s)))

      const items: SelectItem[] = [
        { value: "run", label: "✅ Run it", description: "Execute this command" },
        {
          value: "steer",
          label: "🔀 Steer",
          description: "Give the agent a correction (e.g. use pnpm, not npm)",
        },
        {
          value: "skip",
          label: "❌ Skip — don't run this",
          description: "Block without explanation",
        },
        {
          value: "explain",
          label: "❓ Explain first",
          description: "Agent explains what this does, then re-proposes",
        },
      ]
      const list = new SelectList(items, items.length, getSelectListTheme())
      list.onSelect = (item) => done(item.value as BashChoice)
      list.onCancel = () => done("skip") // Esc = skip (safe default)
      root.addChild(list)

      root.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)))
      root.addChild(new Text(theme.fg("dim", "↑↓ navigate · Enter select · Esc = skip"), 1, 0))

      return {
        render: (w: number) => root.render(w),
        invalidate: () => root.invalidate(),
        handleInput: (data: string) => {
          list.handleInput(data)
          tui.requestRender()
        },
      }
    })

    if (result === "run") return // allow through
    if (result === "steer") {
      const instruction = await ctx.ui.input("Steer the agent", "e.g. use pnpm instead of npm")
      const msg = instruction?.trim()
      return {
        block: true,
        reason: msg
          ? `⚠️ USER CORRECTION: "${msg}"\n\nDo NOT run the blocked command. Follow the user's instruction instead: "${msg}". Adjust your approach and continue.`
          : "User chose not to run this command.",
      }
    }
    if (result === "explain") {
      const preview = cmd.length > 200 ? `${cmd.slice(0, 200)}…` : cmd
      return {
        block: true,
        reason:
          `⚠️ EXPLANATION REQUIRED — do not proceed until you have explained this.\n\nCommand blocked:\n\`${preview}\`\n\n` +
          `1. Explain in 2–3 sentences: what it does, why it\'s needed now, and whether it\'s reversible.\n` +
          `2. After explaining, propose running it again.\n` +
          `Do NOT skip to another task.`,
      }
    }
    // skip or null → block
    return { block: true, reason: "User chose not to run this command." }
  })

  // ── before_agent_start: inject chapter context into system prompt ──────────
  pi.on("before_agent_start", async (event, _ctx) => {
    if (!_projectDir) return
    const profile = readJson<UserProfile>(PROFILE_PATH)
    const chPath = join(
      expandHome(_projectDir),
      ".poiesis",
      "chapters",
      `chapter-${_chapterNum}.md`
    )
    const chapterMd = existsSync(chPath) ? readFileSync(chPath, "utf8") : ""
    const context = buildChapterContext(_projectDir, chapterMd, profile, _chapterNum)
    return { systemPrompt: `${event.systemPrompt}\n\n${context}` }
  })

  // ── session_before_compact: chapter-aware summary ──────────────────────────
  const STEP_NEXT: Record<ChapterStep, string> = {
    classify: "call poiesis_chapter_classify",
    prereq: "call poiesis_prereq_done",
    theory: "finish quiz \u2192 call poiesis_theory_done",
    plan: "call poiesis_confirm_test_plan",
    "write-tests": "write test file \u2192 call poiesis_tests_written",
    implement: "make tests pass \u2192 call poiesis_run_tests",
  }

  pi.on("session_before_compact", async (event, _ctx) => {
    if (!_projectDir) return
    const state = readChapterState(_projectDir, _chapterNum)
    if (!state) return
    const planNames = state.testsPlan.map((t) => t.name).join(", ") || "(not confirmed yet)"
    const summary = [
      `## Poiesis \u2014 Chapter ${_chapterNum} (active session)`,
      `Step: ${state.step}  |  Prereq: ${state.prereqResult ?? "n/a"}  |  Tests file: ${state.testsFile ?? "(not written yet)"}`,
      `Tests passing: ${state.testsPass}`,
      `Test plan: ${planNames}`,
      `Next action: ${STEP_NEXT[state.step]}`,
      "Chapter content is re-injected by before_agent_start on every turn.",
    ].join("\n")
    return {
      compaction: {
        summary,
        firstKeptEntryId: event.preparation.firstKeptEntryId,
        tokensBefore: event.preparation.tokensBefore,
      },
    }
  })

  // ── /poiesis ──────────────────────────────────────────────────────────────
  pi.registerCommand("poiesis", {
    description: "Poiesis — onboard, start a project, or continue the active chapter",
    handler: async (_args, ctx) => {
      if (needsOnboarding()) {
        await runOnboarding(pi, ctx)
        return
      }

      // Resume active project if one exists in cwd
      const projectDir = findActiveProject(ctx.cwd)
      if (projectDir) {
        const profile = readJson<UserProfile>(PROFILE_PATH)
        await runChapter(pi, ctx, profile, projectDir, setSessionState)
        return
      }

      // No active project — scaffold a new one
      await runProject(pi, ctx)
    },
  })
}

export default extension
