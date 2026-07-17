import { GoogleGenAI } from "@google/genai"
import { getGeminiKey } from "./config.ts"
import type { Config, IngestResult } from "./types.ts"
import { exists, expandHome, readJson, slugify, writeJson } from "./utils.ts"

const SYSTEM_PROMPT = `You are a video analysis assistant. Watch this YouTube video and return ONLY strict JSON (no markdown, no explanation) matching this exact shape:

{
  "title": string,
  "channel": string,
  "duration_sec": number,
  "detected_stack": string[],
  "prereqs": string[],
  "chapters": [
    { "n": number, "title": string, "start": number, "end": number, "topics": string[] }
  ],
  "is_coding_tutorial": boolean,
  "notes": string
}

If the video has YouTube chapters use them. If not, invent reasonable breakpoints from content.
"start" and "end" are seconds from video start. Return ONLY the JSON object. No markdown fences.`

const parseJson = (raw: string): IngestResult => {
  const cleaned = raw
    .replace(/^```[a-z]*\n?/m, "")
    .replace(/```$/m, "")
    .trim()
  return JSON.parse(cleaned) as IngestResult
}

export const ingest = async (ytUrl: string, cfg: Config): Promise<IngestResult> => {
  const stateDir = expandHome(cfg.state_dir)
  const idMatch = ytUrl.match(/[?&]v=([^&]+)/)
  const tempSlug = slugify(idMatch?.[1] ?? ytUrl)
  const cachePath = `${stateDir}/builds/${tempSlug}/ingest.json`

  if (exists(cachePath)) {
    return readJson<IngestResult>(cachePath)
  }

  const ai = new GoogleGenAI({ apiKey: getGeminiKey(cfg) })
  const response = await ai.models.generateContent({
    model: cfg.llm_model,
    contents: [
      {
        role: "user",
        parts: [{ fileData: { fileUri: ytUrl, mimeType: "video/mp4" } }, { text: SYSTEM_PROMPT }],
      },
    ],
  })

  let result: IngestResult
  try {
    result = parseJson(response.text ?? "")
  } catch {
    throw new Error(`Gemini response was not valid JSON:\n${response.text ?? ""}`)
  }

  result.slug = slugify(result.title)
  result.yt_url = ytUrl

  // Save at title-based slug (canonical)
  writeJson(`${stateDir}/builds/${result.slug}/ingest.json`, result)
  // Also save at video-ID slug so cache hits on re-run with same URL
  if (tempSlug !== result.slug) {
    writeJson(`${stateDir}/builds/${tempSlug}/ingest.json`, result)
  }

  return result
}
