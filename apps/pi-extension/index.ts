import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "fs"
import { join, resolve } from "path"
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent"
import { Type } from "typebox"
import { loadConfig, saveConfig } from "./src/config.ts"
import { ingest } from "./src/ingest.ts"
import { grill } from "./src/grill.ts"
import { scaffold } from "./src/scaffold.ts"
import { buildChapter } from "./src/build-chapter.ts"
import { finalize } from "./src/finalize.ts"
import { expandHome, readJson, run, writeJson } from "./src/utils.ts"
import type { Config, IngestResult, Plan } from "./src/types.ts"

const YT_RE = /https?:\/\/(www\.)?youtube\.com\/watch\?[^\s]+|https?:\/\/youtu\.be\/[^\s]+/

const ensureConfig = async (ctx: ExtensionContext): Promise<Config | null> => {
  const existing = loadConfig()
  if (existing) return existing

  ctx.ui.notify("First run — setting up poiesis config", "info")

  const geminiKey = process.env.GEMINI_API_KEY
    ? undefined
    : await ctx.ui.input("Gemini API key (or set GEMINI_API_KEY env var):", "")

  const cfg: Config = {
    state_dir: "~/.poiesis",
    llm_model: "gemini-3.5-flash",
    editor_cmd: "cursor",
    ...(geminiKey ? { gemini_api_key: geminiKey } : {}),
    // ponytail: github_owner + default_visibility added post-v0
  }

  saveConfig(cfg)
  ctx.ui.notify("Config saved to ~/.poiesis/config.json", "info")
  return cfg
}

/**
 * Phase 1: `/poiesis <url>`
 * Ingests the video and injects a tutor persona into pi.
 * The conversation is the grill — non-deterministic, pi-driven.
 * Run `/poiesis build` when ready to start the lab.
 */
const startSession = async (ytUrl: string, ctx: ExtensionContext, pi: ExtensionAPI) => {
  if (!YT_RE.test(ytUrl)) {
    ctx.ui.notify(`Not a YouTube URL: ${ytUrl}`, "error")
    return
  }

  const cfg = await ensureConfig(ctx)
  if (!cfg) return

  ctx.ui.setStatus("poiesis", "ingesting video…")
  let video: IngestResult
  try {
    video = await ingest(ytUrl, cfg)
  } catch (e) {
    ctx.ui.notify(`Ingest failed: ${(e as Error).message}`, "error")
    ctx.ui.setStatus("poiesis", "")
    return
  }
  ctx.ui.setStatus("poiesis", "")

  if (!video.is_coding_tutorial) {
    const force = await ctx.ui.confirm(
      "Not a tutorial?",
      `"${video.title}" doesn't look like a coding build-along. Start anyway?`
    )
    if (!force) return
  }

  // Ask where to create the project, then inject tutor persona
  await grill(pi, ctx, video, expandHome(cfg.state_dir))
}

/**
 * Phase 2: `/poiesis build`
 * Called after the tutor conversation. Captures the plan (quick 3 questions),
 * scaffolds the local repo, then builds each chapter as a docs/chapter-N.md lab guide.
 * Pi injects a "let's start" message for each chapter.
 */
const runBuild = async (ctx: ExtensionContext, pi: ExtensionAPI) => {
  const cfg = await ensureConfig(ctx)
  if (!cfg) return

  const stateDir = expandHome(cfg.state_dir)

  // Find sessions grilled but not yet built: have ingest.json + project-dir.txt, no plan.json
  const buildsDir = `${stateDir}/builds`
  const candidates: string[] = existsSync(buildsDir)
    ? readdirSync(buildsDir).filter((d) => {
        const b = `${buildsDir}/${d}`
        return (
          statSync(b).isDirectory() &&
          existsSync(`${b}/ingest.json`) &&
          existsSync(`${b}/project-dir.txt`) &&
          !existsSync(`${b}/plan.json`)
        )
      })
    : []

  if (candidates.length === 0) {
    ctx.ui.notify("No grilled sessions ready to build. Run `/poiesis <url>` first.", "error")
    return
  }

  let slug: string
  if (candidates.length === 1) {
    slug = candidates[0]
  } else {
    const pick = await ctx.ui.select("Which video to build?", candidates)
    if (!pick) return
    slug = pick
  }

  const planPath = `${stateDir}/builds/${slug}/plan.json`
  const ingestPath = `${stateDir}/builds/${slug}/ingest.json`
  const video = readJson<IngestResult>(ingestPath)

  // Capture plan if not already done
  let plan: Plan
  if (existsSync(planPath)) {
    plan = readJson<Plan>(planPath)
    ctx.ui.notify(`Using existing plan for "${slug}". Delete plan.json to rebuild.`, "info")
  } else {
    // Quick 3-question plan capture — decisions already discussed in tutor session
    const stackChoice = await ctx.ui.select(
      `Stack (video uses: ${video.detected_stack.join(", ") || "?"})`,
      ["same as video", "other — type below"]
    )
    if (stackChoice === undefined) return

    let stack = video.detected_stack
    if (stackChoice === "other — type below") {
      const custom = await ctx.ui.input("Stack (comma-separated):", "e.g. rust, axum")
      if (!custom) return
      stack = custom.split(",").map((s) => s.trim())
    }

    const depthChoice = await ctx.ui.select("Build depth", [
      "extended — video + tests + extras",
      "literal-mirror — follow the video closely",
      "minimal-mvp — skeleton I fill in myself",
    ])
    if (depthChoice === undefined) return
    const depth = depthChoice.split(" ")[0] as Plan["depth"]

    const skipRaw = await ctx.ui.input(
      "Skip any chapters? (comma-separated numbers, or leave blank)",
      video.chapters.map((c) => `${c.n}. ${c.title}`).join(" | ")
    )
    const skipChapters = skipRaw
      ? skipRaw
          .split(",")
          .map((s) => parseInt(s.trim(), 10))
          .filter(Boolean)
      : []

    const notes =
      (await ctx.ui.input("Anything extra for the tutor?", "e.g. keep files small, strict TS")) ??
      ""

    // Read project dir chosen during grill
    const projectDirFile = `${stateDir}/builds/${slug}/project-dir.txt`
    const projectDir = existsSync(projectDirFile)
      ? readFileSync(projectDirFile, "utf8").trim()
      : `${process.cwd()}/${slug}`

    plan = {
      slug,
      repo_name: slug,
      project_dir: projectDir,
      stack,
      depth,
      tdd: false, // ponytail: TDD mode post-v0
      skip_chapters: skipChapters,
      notes,
      chapters: video.chapters.filter((ch) => !skipChapters.includes(ch.n)),
    }

    writeJson(planPath, plan)
  }

  // Scaffold local repo
  ctx.ui.setStatus("poiesis", "scaffolding repo…")
  try {
    scaffold(plan.project_dir, video)
  } catch (e) {
    ctx.ui.notify(`Scaffold failed: ${(e as Error).message}`, "error")
    ctx.ui.setStatus("poiesis", "")
    return
  }

  // Build each chapter as a docs lab guide
  for (const ch of plan.chapters) {
    ctx.ui.setStatus("poiesis", `generating chapter ${ch.n}/${plan.chapters.length} guide…`)
    try {
      await buildChapter(plan.slug, ch.n, cfg, pi)
    } catch (e) {
      const retry = await ctx.ui.confirm(
        `Chapter ${ch.n} failed`,
        `${(e as Error).message.slice(0, 200)}\n\nRetry?`
      )
      if (retry) {
        try {
          await buildChapter(plan.slug, ch.n, cfg, pi)
        } catch {
          ctx.ui.notify(`Chapter ${ch.n} failed again — skipping`, "warning")
        }
      }
    }
  }

  // Finalize
  ctx.ui.setStatus("poiesis", "finalizing…")
  let localPath: string
  try {
    localPath = finalize(plan.slug, cfg)
  } catch (e) {
    ctx.ui.notify(`Finalize failed: ${(e as Error).message}`, "error")
    ctx.ui.setStatus("poiesis", "")
    return
  }

  ctx.ui.setStatus("poiesis", "")

  // Announce lab start
  pi.sendUserMessage(
    `All ${plan.chapters.length} chapter guides are in \`docs/\` at \`${localPath}\`. Chapters: ${plan.chapters.map((c) => `${c.n}. ${c.title}`).join(" | ")}. Chapter 1 is open — let's go.`
  )

  const open = await ctx.ui.confirm("Open project in editor?", localPath)
  if (open) {
    try {
      run(`${cfg.editor_cmd} ${localPath}`)
    } catch {
      ctx.ui.notify(`Couldn't open editor (${cfg.editor_cmd})`, "warning")
    }
  }
}

const agentBrowserAvailable = (): boolean => {
  try {
    run("which agent-browser")
    return true
  } catch {
    return false
  }
}

export default function (pi: ExtensionAPI) {
  // Check agent-browser at startup
  pi.on("session_start", (_event, ctx) => {
    if (!agentBrowserAvailable()) {
      ctx.ui.notify(
        "poiesis: agent-browser not found — tutor research disabled. Install: npm i -g agent-browser && agent-browser install",
        "warning"
      )
    }
  })

  // Research tool — tutor uses this to look up docs, verify patterns, check APIs live
  pi.registerTool({
    name: "poiesis_research",
    label: "Poiesis: Research",
    description:
      "Look up live documentation or verify a tech pattern. Use when a student asks something that needs current official info — API docs, library versions, recommended patterns.",
    promptSnippet: "Look up official docs or verify a tech recommendation",
    promptGuidelines: [
      "Use poiesis_research when the student asks about a library, API, or pattern that needs verification against official docs.",
      "Prefer official docs URLs: docs.rs, MDN, official GitHub README, npmjs.com, pkg.go.dev.",
      "If the video recommends something outdated, use this to verify and correct it.",
    ],
    parameters: Type.Object({
      url: Type.String({ description: "URL to look up (official docs, GitHub, MDN, npm, etc.)" }),
    }),
    async execute(_id, params, _signal, _onUpdate, _ctx) {
      if (!agentBrowserAvailable()) {
        return {
          content: [
            {
              type: "text" as const,
              text: "agent-browser is not installed. Run: npm i -g agent-browser && agent-browser install",
            },
          ],
          details: {},
        }
      }
      try {
        // Open page, grab snapshot, close tab
        const safeUrl = params.url.replace(/"/g, "")
        const content = run(
          `agent-browser open "${safeUrl}" && agent-browser snapshot -i -c && agent-browser close`
        )
        return {
          content: [{ type: "text" as const, text: content.slice(0, 8000) }],
          details: { url: params.url },
        }
      } catch (e) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Research failed: ${(e as Error).message.slice(0, 300)}`,
            },
          ],
          details: {},
        }
      }
    },
  })

  // Project location tool — pi calls this during the grill conversation once user decides
  pi.registerTool({
    name: 'poiesis_set_project',
    label: 'Poiesis: Set Project Location',
    description: 'Save the project directory chosen during the tutor conversation. Call this once the user has told you where they want the project and what to name it.',
    promptSnippet: 'Lock in the project location',
    promptGuidelines: [
      'Call poiesis_set_project as soon as the user tells you where to put the project and what name to use.',
      'Resolve common shorthands: "desktop" → ~/Desktop, "downloads" → ~/Downloads, "projects" → ~/projects.',
      'The user home dir is available from the HOME env var or by running `echo $HOME` if needed.',
      'Call this BEFORE the user runs /poiesis build.',
    ],
    parameters: Type.Object({
      slug:   Type.String({ description: 'The video slug (from the tutor context)' }),
      dir:    Type.String({ description: 'Resolved absolute path to the parent directory, e.g. /Users/john/Desktop' }),
      name:   Type.String({ description: 'Folder name for the project, e.g. hono-lab' }),
    }),
    async execute(_id, params, _signal, _onUpdate, _ctx) {
      const cfg = loadConfig();
      if (!cfg) return { content: [{ type: 'text' as const, text: 'No poiesis config found. Run /poiesis <url> first.' }], details: {} };
      const stateDir = expandHome(cfg.state_dir);
      const projectDir = resolve(join(params.dir, params.name));
      const projectDirFile = `${stateDir}/builds/${params.slug}/project-dir.txt`;
      mkdirSync(`${stateDir}/builds/${params.slug}`, { recursive: true });
      writeFileSync(projectDirFile, projectDir);
      return {
        content: [{ type: 'text' as const, text: `Project locked in at: ${projectDir}` }],
        details: { projectDir },
      };
    },
  });

  // /poiesis <url>  → ingest + tutor session
  // /poiesis build  → plan capture + chapter doc generation + lab start
  pi.registerCommand("poiesis", {
    description: "Poiesis: /poiesis <youtube-url> to start | /poiesis build to begin the lab",
    handler: async (args, ctx) => {
      const trimmed = args.trim()

      if (trimmed === "build") {
        await runBuild(ctx, pi)
        return
      }

      const url = trimmed.replace(/^build\s+/i, "")
      if (!url) {
        ctx.ui.notify("Usage: /poiesis <youtube-url>  or  /poiesis build", "info")
        return
      }
      await startSession(url, ctx, pi)
    },
  })

  // LLM-callable tool — when user says "start poiesis for this video"
  pi.registerTool({
    name: "poiesis_build",
    label: "Poiesis: Start Tutorial Session",
    description:
      "Ingest a YouTube tutorial and start a guided lab session. Grills the user as a tutor, then builds chapter lab docs.",
    promptSnippet: "Start a poiesis tutor session from a YouTube URL",
    promptGuidelines: [
      "Use poiesis_build when the user wants to work through a YouTube coding tutorial with pi as their tutor.",
    ],
    parameters: Type.Object({
      youtube_url: Type.String({ description: "Full YouTube video URL" }),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      await startSession(params.youtube_url, ctx, pi)
      return {
        content: [
          {
            type: "text" as const,
            text: "Tutor session started. Run `/poiesis build` when ready to begin the lab.",
          },
        ],
        details: {},
      }
    },
  })
}
