import { createLogger } from "~lib/logger"
import type { GateResult, MemoryGateResult } from "~lib/types"
import type { CapturePayload } from "~schemas/capture.schema"

const logger = createLogger("memory-gate")

// ── System prompt ─────────────────────────────────────────────────────────────
// Internal: uses Gemini Nano (Chrome Built-in AI). Exposed as "Memory Gate".

const SYSTEM_PROMPT = `
You are a memory gate inside a YouTube learning app.

Your ONLY job: decide whether this video is worth saving to the user's long-term memory.

SAVE (true):
  - Tutorials, walkthroughs, how-tos, technical deep-dives
  - Lectures, conference talks, educational documentaries
  - Product demos with clear instructional value
  - Dense interviews, structured podcasts, explainers

DO NOT SAVE (false):
  - Music, entertainment, reactions, commentary
  - News clips, sports highlights, vlogs, memes
  - Movie trailers, promotional content
  - Passive background-listening content

Use watch duration and completion % as engagement signals — not as pass/fail gates.
A user who watched 25% of a 3-hour lecture has shown meaningful engagement.

Respond ONLY with JSON matching this exact shape:
{ "store": boolean, "confidence": number (0.0–1.0), "reason": string (one sentence) }
`.trim()

// ── Message builder ───────────────────────────────────────────────────────────

const buildUserMessage = (p: CapturePayload): string => {
  const lines = [
    `Title: "${p.title}"`,
    `Channel: "${p.channel}"`,
    `Description: "${(p.description ?? "").slice(0, 500)}"`,
    `Watched: ${Math.round(p.playedSeconds)}s (${Math.round(p.watchPercent)}% of video)`,
    `Duration: ${Math.round(p.duration)}s total`,
  ]
  return lines.join("\n")
}

// ── Availability check ────────────────────────────────────────────────────────
// Caches result per SW lifetime — called from background.ts on startup.

let _available: boolean | null = null

export const isMemoryGateAvailable = async (): Promise<boolean> => {
  if (_available !== null) return _available

  if (typeof LanguageModel === "undefined") {
    logger.warn({}, "Memory Gate unavailable — Chrome 138+ required")
    _available = false
    return false
  }
  try {
    const status = await LanguageModel.availability()
    _available = status === "available"
    if (!_available) {
      logger.warn({ status }, "Memory Gate not ready")
    }
  } catch (err) {
    logger.warn({ err }, "Memory Gate availability check failed")
    _available = false
  }
  return _available
}

export const resetMemoryGateCache = () => {
  _available = null
}

// ── Gate runner ───────────────────────────────────────────────────────────────

export const runGate = async (payload: CapturePayload): Promise<GateResult> => {
  // Internal implementation uses Gemini Nano (Chrome Built-in AI).
  const session = await LanguageModel.create({
    initialPrompts: [{ role: "system", content: SYSTEM_PROMPT }],
  })

  try {
    const raw = await session.prompt(buildUserMessage(payload), {
      responseConstraint: {
        type: "object",
        properties: {
          store: { type: "boolean" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          reason: { type: "string" },
        },
        required: ["store", "reason"],
      },
    })

    const parsed = JSON.parse(raw) as MemoryGateResult

    return {
      score: parsed.confidence ?? 0.5, // normalize to 0–1
      reason: parsed.reason,
      source: "memory-gate",
    }
  } finally {
    session.destroy()
  }
}
