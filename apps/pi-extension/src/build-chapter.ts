import { GoogleGenAI } from "@google/genai"
import { mkdirSync, writeFileSync } from "fs"
import { join } from "path"
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"
import { getGeminiKey } from "./config.ts"
import type { Chapter, Config, IngestResult, Plan } from "./types.ts"
import { expandHome, readJson, run, slugify } from "./utils.ts"

// ponytail: docs-only output — no code generation, no FileDiff. Pi guides the user to write the code.

const makeDocPrompt = (plan: Plan, ingest: IngestResult, ch: Chapter) =>
  `
You are writing a lab guide for a coding tutorial chapter. This is a structured reference document for an AI agent (pi) that will implement everything itself — writing all files, running all commands — while narrating decisions to the human watching. The human does not write the code; pi does.

## Video
"${ingest.title}" — ${ingest.yt_url}
Stack: ${plan.stack.join(", ")} | Depth: ${plan.depth}
User notes: ${plan.notes || "none"}

## Chapter ${ch.n}: ${ch.title}
Topics: ${ch.topics.join(", ")}
Timestamp: ${Math.floor(ch.start / 60)}:${String(ch.start % 60).padStart(2, "0")} → ${Math.floor(ch.end / 60)}:${String(ch.end % 60).padStart(2, "0")}

## Output format
Return ONLY a markdown document with these exact sections:

# Chapter ${ch.n}: ${ch.title}

## What you'll build
[2–4 sentences. Concrete outcome. What exists at the end of this chapter that didn't before.]

## Key concepts
[Bullet list of 3–6 concepts/patterns this chapter introduces. Be specific — name the patterns, not just "you'll learn about X".]

## Lab exercises
[Numbered list of 3–8 exercises. Each is a concrete task the user must implement. Start simple, build up. Each exercise should be specific enough that the user knows when they're done. Include "stretch" exercises if depth is extended.]

## Watch out for
[Bullet list of 2–4 common mistakes or gotchas specific to this chapter's content. Based on your knowledge of the stack — not generic advice.]

## Tutor recommendations
[2–4 bullet points. Opinionated guidance: what pattern to use, what to avoid, what the video might do differently from best practice. If the video teaches something suboptimal, say so directly.]

## Reference
Video timestamp: [${Math.floor(ch.start / 60)}:${String(ch.start % 60).padStart(2, "0")}](${ingest.yt_url}&t=${ch.start})
`.trim()

export const buildChapter = async (
  slug: string,
  chapterN: number,
  cfg: Config,
  pi: ExtensionAPI
): Promise<string> => {
  const stateDir = expandHome(cfg.state_dir)
  const plan = readJson<Plan>(`${stateDir}/builds/${slug}/plan.json`)
  const repoDir = plan.project_dir
  const ingest = readJson<IngestResult>(`${stateDir}/builds/${slug}/ingest.json`)
  const ch = plan.chapters.find((c) => c.n === chapterN)
  if (!ch) throw new Error(`Chapter ${chapterN} not found in plan`)

  const ai = new GoogleGenAI({ apiKey: getGeminiKey(cfg) })
  const logDir = `${stateDir}/builds/${slug}/logs`
  mkdirSync(logDir, { recursive: true })

  // Generate the lab guide doc
  const response = await ai.models.generateContent({
    model: cfg.llm_model,
    contents: [{ role: "user", parts: [{ text: makeDocPrompt(plan, ingest, ch) }] }],
  })
  const docContent = (response.text ?? "").trim()

  // Write to docs/ inside the project repo
  const docsDir = join(repoDir, "docs")
  mkdirSync(docsDir, { recursive: true })
  const docFileName = `chapter-${String(ch.n).padStart(2, "0")}-${slugify(ch.title)}.md`
  const docPath = join(docsDir, docFileName)
  writeFileSync(docPath, docContent)

  // Save log
  writeFileSync(`${logDir}/chapter-${chapterN}.json`, JSON.stringify({ doc: docFileName }, null, 2))

  // Commit the doc
  run("git add docs/", repoDir)
  run(`git commit -m "chapter ${ch.n}: ${ch.title}"`, repoDir)
  const sha = run("git rev-parse --short HEAD", repoDir).trim()

  // Kick off this chapter in chat
  pi.sendUserMessage(
    `Chapter ${ch.n} lab guide is ready at \`docs/${docFileName}\` in \`${repoDir}\`.

Now build it. Use your bash and file tools to implement everything in this chapter's lab exercises — scaffold the files, write the code, run commands. Do not ask me to do any of it.

As you work, narrate your decisions: what you're building, why you chose that pattern, where the video does it differently and whether that matters. Keep it tight — explain while doing, not instead of doing.

I'll ask if I want to understand something or push back on a choice. Go.`
  )

  return docPath
}
