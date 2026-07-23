import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent"
import { initProgress } from "./progress.ts"
import { extractTranscript } from "./transcript.ts"
import type { TranscriptResult } from "./transcript.ts"
import type { ChapterMeta } from "./types.ts"

/**
 * Post-onboarding project flow.
 *
 * 1. ctx.ui.input — YouTube URL
 * 2. ctx.ui.input — project name (defaults to YT video title)
 * 3. Scaffold {cwd}/{name}/chapters/
 * 4. Gemini (JSON mode) → chapter-index.md + summary.md + chapter-N.md per chapter
 */
import { Type as GType, GoogleGenAI } from "@google/genai"

// ── Types ─────────────────────────────────────────────────────────────────────

interface Chapter {
  title: string
  concepts: string[]
  duration: string
  notes: string
  keyTakeaway: string
}

interface VideoAnalysis {
  summary: string
  techstack: string
  chapters: Chapter[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const toFolder = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)

const YT_RE = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/

const ytTitle = async (url: string): Promise<string> => {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
    )
    const data = (await res.json()) as { title?: string }
    return data.title ?? "project"
  } catch {
    return "project"
  }
}

// ── Gemini analysis ───────────────────────────────────────────────────────────

const analyzeVideo = async (url: string, name: string): Promise<VideoAnalysis> => {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set")

  const ai = new GoogleGenAI({ apiKey })

  const prompt = `Analyze this YouTube tutorial and return structured JSON.
Project name: "${name}"

Return a JSON object matching the schema exactly. Be specific to the actual video content — no filler.

Fields:
- summary: 2–3 sentence description of what this project builds and what problem it solves — written as a project README description, not a tutorial summary. Do not mention "this tutorial" or "this video".
- techstack: a concise Markdown description of the project's tech stack (runtime, package manager, language, framework, key libraries, test runner, any important conventions). This will be injected into every chapter session so the AI tutor never needs to ask. Example: "**Runtime**: Bun\n**Package manager**: bun\n**Language**: TypeScript\n**Framework**: Hono\n**Testing**: Vitest (via bunx)\n\nAll commands use \'bun\'. Strict TypeScript throughout."
- chapters: array of chapters, each with:
  - title: short chapter title (no number prefix)
  - concepts: array of 2–5 key topics covered
  - duration: estimated time range (e.g. "0:00–8:30")
  - notes: one sentence on what the viewer builds or learns
  - keyTakeaway: single most important insight from this chapter`

  const result = await ai.models.generateContent({
    model: "gemini-3.5-flash",
    contents: [
      {
        role: "user",
        // fileData lets Gemini natively ingest the YouTube video (audio + transcript)
        // rather than just reading the URL as text.
        parts: [{ fileData: { fileUri: url } }, { text: prompt }],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: GType.OBJECT,
        properties: {
          summary: { type: GType.STRING },
          techstack: { type: GType.STRING },
          chapters: {
            type: GType.ARRAY,
            items: {
              type: GType.OBJECT,
              properties: {
                title: { type: GType.STRING },
                concepts: { type: GType.ARRAY, items: { type: GType.STRING } },
                duration: { type: GType.STRING },
                notes: { type: GType.STRING },
                keyTakeaway: { type: GType.STRING },
              },
              required: ["title", "concepts", "duration", "notes", "keyTakeaway"],
            },
          },
        },
        required: ["summary", "techstack", "chapters"],
      },
    },
  })

  return JSON.parse(result.text ?? "{}") as VideoAnalysis
}

// ── File builders ─────────────────────────────────────────────────────────────

const buildTechstack = (techstack: string): string => techstack.trim()

const buildRoadmapJson = (name: string, analysis: VideoAnalysis): string =>
  JSON.stringify(
    {
      name,
      chapters: analysis.chapters.map((ch, i) => ({
        n: i + 1,
        title: ch.title,
        duration: ch.duration,
        done: false,
        kind: null,
      })),
    },
    null,
    2
  )

const buildSummary = (
  name: string,
  url: string,
  analysis: VideoAnalysis
): string => `# ${name} — Summary

**Source**: ${url}

${analysis.summary}

## What You'll Learn

${analysis.chapters.map((ch, i) => `- **Chapter ${i + 1}** — ${ch.title}: ${ch.keyTakeaway}`).join("\n")}

---

← [[chapter-index]]
`

const buildIndex = (name: string, url: string, analysis: VideoAnalysis): string => {
  const rows = analysis.chapters
    .map(
      (ch, i) =>
        `| [[chapter-${i + 1}\\|Chapter ${i + 1}]] | ${ch.title} | ${ch.duration} | ${ch.concepts.join(", ")} |`
    )
    .join("\n")

  return `# ${name} — Chapter Index

**Source**: ${url}

> ${analysis.summary}

[[summary|→ Full Summary]]

## Chapters

| # | Title | Duration | Key Concepts |
|---|-------|----------|--------------|
${rows}

---

*${analysis.chapters.length} chapters · generated by poiesis*
`
}

const buildChapter = (ch: Chapter, n: number, total: number): string => {
  const prev = n > 1 ? `[[chapter-${n - 1}|← Chapter ${n - 1}]]` : "[[chapter-index|← Index]]"
  const next = n < total ? `[[chapter-${n + 1}|Chapter ${n + 1} →]]` : "[[chapter-index|→ Index]]"

  return `# Chapter ${n} — ${ch.title}

**Concepts**: ${ch.concepts.join(", ")}
**Duration**: ${ch.duration}

## What You Learn

${ch.notes}

## Key Takeaway

> ${ch.keyTakeaway}

---

${prev} · ${next}
`
}

// ── Scaffold ──────────────────────────────────────────────────────────────────

const GITIGNORE = `node_modules/
dist/
.env
.env.local
*.log
.pi
.poiesis
`

const buildReadme = (name: string, url: string, analysis: VideoAnalysis): string =>
  `# ${name}\n\n${analysis.summary}\n\n---\n\n<sub>Made with help of <a href="https://shanvit7.github.io/poiesis/">Poiesis</a> watching <a href="${url}">${url}</a></sub>\n`

const scaffoldChapters = (
  chaptersDir: string,
  projectDir: string,
  name: string,
  url: string,
  analysis: VideoAnalysis
): void => {
  const write = (filename: string, content: string): void =>
    writeFileSync(join(chaptersDir, filename), content, "utf8")

  write("summary.md", buildSummary(name, url, analysis))
  write("chapter-index.md", buildIndex(name, url, analysis))
  write("techstack.md", buildTechstack(analysis.techstack))
  write("roadmap.json", buildRoadmapJson(name, analysis))

  for (let i = 0; i < analysis.chapters.length; i++) {
    write(
      `chapter-${i + 1}.md`,
      buildChapter(analysis.chapters[i], i + 1, analysis.chapters.length)
    )
  }

  writeFileSync(join(projectDir, "README.md"), buildReadme(name, url, analysis), "utf8")

  // .gitignore at project root (not inside .poiesis)
  writeFileSync(join(projectDir, ".gitignore"), GITIGNORE, "utf8")

  // initialise progress — classifyChapter refines type at runtime
  const chapters: Record<string, ChapterMeta> = {}
  for (let i = 0; i < analysis.chapters.length; i++) {
    chapters[i + 1] = { type: "code", testsFile: null, testsPass: false }
  }
  initProgress(projectDir, analysis.chapters.length, chapters)
}

/**
 * Build the agent prompt for transcript-based analysis (no Gemini key).
 * Agent first assesses whether the content is rich enough to build chapters.
 * If not, it explains why and stops — no files are written.
 */
const agentAnalysisPrompt = (
  projectDir: string,
  name: string,
  url: string,
  transcript: TranscriptResult
): string => {
  const chDir = join(projectDir, ".poiesis", "chapters")

  const transcriptSection =
    transcript.kind === "transcript"
      ? [
          "## Video transcript\n",
          transcript.text.slice(0, 40_000),
          transcript.text.length > 40_000 ? "\n…(truncated)" : "",
          transcript.chapters.length > 0
            ? `\n\n## Detected chapters\n\n${transcript.chapters.map((c, i) => `${i + 1}. [${c.start}–${c.end}] ${c.title}`).join("\n")}`
            : "",
        ].join("")
      : [
          "## Video metadata\n",
          `Title: ${(transcript as { title: string }).title}\n\nDescription:\n`,
          ((transcript as { description?: string }).description ?? "(none)").slice(0, 3_000),
        ].join("")

  const now = new Date().toISOString()

  return `You are evaluating a YouTube tutorial to decide if it can become a Poiesis learning project.
No Gemini API key was available, so you are working from the extracted text below.

**Project**
- Name: ${name}
- URL: ${url}
- Project directory: ${projectDir}
- Chapters directory: ${chDir}

${transcriptSection}

## Step 1 — Quality gate (do this FIRST, before writing any files)

Assess whether the content above is rich enough to produce meaningful learning chapters.
Ask yourself:
- Are there at least 2 distinct topics or sections a student could work through?
- Is there enough detail to write a one-paragraph explanation per chapter?
- Is the subject matter or tech stack identifiable from the content?

**If NO to any of these** — stop. Do not create any files or directories.
Explain to the user in 2–3 plain sentences what was found and why it is not enough
(e.g. the video has no captions and the description is a bare link list).
Then suggest they either add a GEMINI_API_KEY (which lets Gemini watch the actual video)
or try a different video that has captions.
Do not proceed to Step 2.

**If YES to all** — continue to Step 2.

## Step 2 — Scaffold the project

Use the write tool to create all project files.

### 1. \`${chDir}/techstack.md\`
Markdown description of the project's tech stack (runtime, language, framework, key libraries, test runner, conventions). Injected into every chapter session — be specific.

### 2. \`${chDir}/chapter-N.md\` (one per chapter you identify)
\`\`\`
# Chapter N — <Title>

**Concepts**: <comma-separated key concepts>
**Duration**: <time range e.g. "0:00–8:30">

## What You Learn

<one paragraph on what the viewer builds or learns>

## Key Takeaway

> <single most important insight>

---

[[chapter-(N-1)|← Chapter N-1]] · [[chapter-(N+1)|Chapter N+1 →]]
\`\`\`

### 3. \`${chDir}/roadmap.json\`
\`\`\`json
{
  "name": "${name}",
  "chapters": [
    { "n": 1, "title": "...", "duration": "...", "done": false, "kind": null },
    ...
  ]
}
\`\`\`

### 4. \`${chDir}/summary.md\` and \`${chDir}/chapter-index.md\`
Update the placeholder files with real content following the same Markdown format.

### 5. \`${chDir}/.progress.json\`
Once you know the total chapter count N, write:
\`\`\`json
{
  "current": 1,
  "total": N,
  "completed": [],
  "startedAt": "${now}",
  "lastActiveAt": "${now}",
  "chapters": {
    "1": { "type": "code", "testsFile": null, "testsPass": false }
    // repeat for each chapter 1..N
  }
}
\`\`\`

### 6. \`${projectDir}/README.md\`
Short README: project name, one-line summary, source URL.

## When done

Tell the user:
1. The project is ready at \`${projectDir}\`
2. How to start: \`cd ${projectDir}\` then run \`/poiesis\`
3. How many chapters were created and a one-line teaser of chapter 1

Be concise — 3–4 sentences.`
}

// ── Entry point ───────────────────────────────────────────────────────────────

export const runProject = async (pi: ExtensionAPI, ctx: ExtensionCommandContext): Promise<void> => {
  // 1. YT URL
  const url = (await ctx.ui.input("Paste a YouTube URL")) ?? ""
  if (!YT_RE.test(url)) {
    ctx.ui.notify("Not a valid YouTube URL — try again.", "error")
    return
  }

  // 2. Project name (oEmbed title fetch — fast, no yt-dlp needed)
  const defaultTitle = await ytTitle(url)
  const input =
    (await ctx.ui.input(`Project name — press Enter to use "${defaultTitle}"`, defaultTitle)) ||
    defaultTitle
  const name = toFolder(input) || "project"

  const projectDir = join(ctx.cwd, name)
  const poiesisChaptersDir = join(projectDir, ".poiesis", "chapters")
  const apiKey = process.env.GEMINI_API_KEY

  // ── Path A: Gemini available — native YT video ingestion ─────────────────
  if (apiKey) {
    mkdirSync(poiesisChaptersDir, { recursive: true })
    ctx.ui.notify("🎥 Sending video to Gemini — this takes ~15–30s…", "info")
    ctx.ui.setStatus("poiesis", " Gemini: analyzing video…")
    try {
      const analysis = await analyzeVideo(url, name)
      ctx.ui.notify(`✅ Got ${analysis.chapters.length} chapters — writing files…`, "info")
      ctx.ui.setStatus("poiesis", " Writing chapter files…")
      scaffoldChapters(poiesisChaptersDir, projectDir, name, url, analysis)
      ctx.ui.setStatus("poiesis", undefined)
      await pi.sendUserMessage(
        `The poiesis project "${name}" has been scaffolded at: ${projectDir}

What was created:
- ${analysis.chapters.length} chapter guide files in .poiesis/chapters/
- techstack.md (tech context injected into every chapter session)
- roadmap.json, chapter-index.md, summary.md
- README.md
- .gitignore
- .poiesis/chapters/.progress.json (tracks chapter progress)

Tell the user all of the following:
1. The project is ready at \`${projectDir}\`
2. How to start: \`cd ${projectDir}\` then run \`/poiesis\`
3. One-line teaser of chapter 1: "${analysis.chapters[0]?.title ?? "Chapter 1"}"

Be concise — 3–4 sentences max.`
      )
    } catch (err) {
      ctx.ui.setStatus("poiesis", undefined)
      ctx.ui.notify(`Gemini error: ${String(err)}`, "error")
    }
    return
  }

  // ── Path B: No Gemini key — yt-dlp transcript → pi agent assesses + scaffolds ──
  ctx.ui.notify("📺 Extracting captions via yt-dlp…", "info")
  ctx.ui.setStatus("poiesis", " yt-dlp: extracting captions…")
  const transcript = await extractTranscript(url)
  ctx.ui.setStatus("poiesis", undefined)

  if (transcript.kind === "none") {
    // yt-dlp found nothing at all — agent can’t work with this
    ctx.ui.notify(
      "No captions or description found for this video. Add a GEMINI_API_KEY to let Gemini watch the video directly.",
      "error"
    )
    return
  }

  // Has transcript or metadata — agent decides if it’s rich enough, then scaffolds.
  // Directory is created by the agent’s write tool only if it passes the quality gate.
  const label = transcript.kind === "transcript" ? "transcript" : "description"
  ctx.ui.notify(`✅ Got ${label} — asking agent to assess…`, "info")
  await pi.sendUserMessage(agentAnalysisPrompt(projectDir, name, url, transcript))
}
