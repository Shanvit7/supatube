import type { GateResult } from "~lib/types"
import type { CapturePayload } from "~schemas/capture.schema"

// ── Score normalization ───────────────────────────────────────────────────────
// Raw scorer produces ~0–80 points. Normalize to 0–1 so that background.ts
// can compare against the same 0–1 gateThreshold (default 0.6) as Memory Gate.
// STORE_THRESHOLD = 30 is GONE — replaced by the shared threshold from settings.

const SCORE_MAX = 80
const normalize = (raw: number) => Math.max(0, Math.min(1, raw / SCORE_MAX))

// ── Signal keyword lists ──────────────────────────────────────────────────────

const TITLE_POSITIVE = [
  "tutorial",
  "how to",
  "howto",
  "course",
  "lecture",
  "explained",
  "guide",
  "learn",
  "lesson",
  "workshop",
  "masterclass",
  "deep dive",
  "introduction to",
  "intro to",
  "beginner",
  "advanced",
  "complete",
  "step by step",
  "tips",
  "fundamentals",
  "overview",
  "walkthrough",
  "crash course",
  "from scratch",
  "in depth",
  "breakdown",
]

const TITLE_NEGATIVE = [
  "music video",
  "official video",
  "official audio",
  "lyrics",
  "lyric video",
  "reaction",
  "reacts",
  "vlog",
  "highlights",
  "trailer",
  "#shorts",
  "funny",
  "meme",
  "compilation",
  "roast",
  "challenge",
]

const CHANNEL_PATTERNS = [
  /academy/i,
  /university/i,
  /\bschool\b/i,
  /learning/i,
  /education/i,
  /tutorial/i,
  /\btech\b/i,
  /science/i,
  /explained/i,
  /\bdev\b/i,
  /engineering/i,
  /institute/i,
]

// ── Raw scorer ────────────────────────────────────────────────────────────────
// Unchanged signal logic. Input fields mapped from CapturePayload.

interface HeuristicInputs {
  playedSeconds: number
  watchPercent01: number // 0–1
  durationSeconds: number
  title: string
  channel: string
  description: string
}

const rawScore = (p: HeuristicInputs): { score: number; dominantReason: string } => {
  let score = 0
  let dominantReason = ""

  const { playedSeconds, watchPercent01, durationSeconds, title, channel, description } = p

  // ── A: Absolute engagement ─────────────────────────────────────────────────
  if (playedSeconds >= 600) score += 25
  else if (playedSeconds >= 300) score += 15
  else if (playedSeconds >= 120) score += 5
  else score -= 30

  // ── B: Duration context ────────────────────────────────────────────────────
  if (durationSeconds >= 3600) score += 25
  else if (durationSeconds >= 1800) score += 18
  else if (durationSeconds >= 600) score += 10
  else if (durationSeconds >= 180) score += 3
  else score -= 20

  // ── C: Completion relative to duration ────────────────────────────────────
  if (watchPercent01 >= 0.8) score += 12
  else if (watchPercent01 >= 0.5) score += 8
  else if (watchPercent01 >= 0.3 && playedSeconds >= 300) score += 8
  else if (watchPercent01 >= 0.2 && playedSeconds >= 600) score += 8
  else if (watchPercent01 < 0.1) score -= 10

  // ── D: Title semantics ─────────────────────────────────────────────────────
  const titleLower = title.toLowerCase()
  const posMatches = TITLE_POSITIVE.filter((kw) => titleLower.includes(kw))
  const negMatches = TITLE_NEGATIVE.filter((kw) => titleLower.includes(kw))

  if (posMatches.length > 0) {
    score += Math.min(20 + (posMatches.length - 1) * 5, 30)
    dominantReason = `title keywords: ${posMatches.slice(0, 2).join(", ")}`
  }
  if (negMatches.length > 0) {
    score -= Math.min(25 + (negMatches.length - 1) * 10, 40)
    if (!dominantReason) dominantReason = `title negative: ${negMatches[0]}`
  }

  // ── E: Channel name patterns ───────────────────────────────────────────────
  if (CHANNEL_PATTERNS.some((re) => re.test(channel))) {
    score += 10
    if (!dominantReason) dominantReason = `channel pattern: ${channel}`
  }

  // ── F: Description timestamps (strongest single signal) ───────────────────
  const hasTimestamps = /\d+:\d+/.test(description)
  if (hasTimestamps) {
    score += 20
    if (!dominantReason) dominantReason = "structured content (timestamps in description)"
  }
  if (/https?:\/\//.test(description)) score += 5

  if (!dominantReason) {
    dominantReason = `engagement: ${Math.round(playedSeconds)}s played`
  }

  return { score, dominantReason }
}

// ── Gate runner ───────────────────────────────────────────────────────────────

export const runGate = async (payload: CapturePayload): Promise<GateResult> => {
  const inputs: HeuristicInputs = {
    playedSeconds: payload.playedSeconds,
    watchPercent01: payload.watchPercent / 100, // CapturePayload is 0–100
    durationSeconds: payload.duration,
    title: payload.title,
    channel: payload.channel,
    description: payload.description ?? "",
  }

  const { score: raw, dominantReason } = rawScore(inputs)
  const score = normalize(raw)

  return {
    score,
    reason: dominantReason,
    source: "heuristic-fallback",
  }
}

// ── Exported for unit tests ───────────────────────────────────────────────────
export { rawScore, normalize }
