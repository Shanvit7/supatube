import { execSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface YTChapter {
  title: string
  start: string // "0:00" or "1:23:45"
  end: string
}

export type TranscriptResult =
  | { kind: "transcript"; text: string; chapters: YTChapter[]; title: string }
  | { kind: "metadata"; title: string; description: string }
  | { kind: "none" }

// ── VTT / SRT parser ─────────────────────────────────────────────────────────

/**
 * Strip VTT/SRT metadata and timing tags, return deduplicated plain text.
 * Handles YouTube's auto-generated VTT (which repeats lines with inline timing tags).
 */
const parseVtt = (raw: string): string => {
  const lines: string[] = []
  for (const line of raw.split("\n")) {
    const t = line.trim()
    if (!t) continue
    // Skip VTT header lines
    if (
      t.startsWith("WEBVTT") ||
      t.startsWith("Kind:") ||
      t.startsWith("Language:") ||
      t.startsWith("NOTE")
    )
      continue
    // Skip timestamp lines ("00:00:01.000 --> 00:00:05.000 ...")
    if (t.includes("-->")) continue
    // Skip SRT sequence numbers (bare integers)
    if (/^\d+$/.test(t)) continue
    // Strip inline timing tags <00:00:01.500>, <c>, </c>, and any other tags
    const text = t
      .replace(/<\d{2}:\d{2}:\d{2}\.\d{3}>/g, "")
      .replace(/<\/?c>/g, "")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&nbsp;/g, " ")
      .trim()
    if (text) lines.push(text)
  }
  // Deduplicate consecutive identical lines (auto-captions repeat each line twice)
  const deduped = lines.filter((l, i) => l !== lines[i - 1])
  return deduped.join(" ").replace(/\s+/g, " ").trim()
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const secsToTimestamp = (secs: number): string => {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = Math.floor(secs % 60)
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`
}

/**
 * Parse YouTube-style timestamp chapters from a video description.
 * Matches lines like: "0:00 Intro", "0:00 - Intro", "(0:00) Intro", "• 0:00 Intro"
 * ponytail: regex — handles all common formats, no external parser
 */
const parseDescriptionChapters = (description: string): YTChapter[] => {
  const RE = /^[•*\-–—(]*\s*(\d+:\d{2}(?::\d{2})?)\s*[-–—:)•]?\s*(.+)/
  const hits: Array<{ start: string; title: string }> = []
  for (const line of description.split("\n")) {
    const m = RE.exec(line.trim())
    if (m) hits.push({ start: m[1].trim(), title: m[2].trim() })
  }
  if (hits.length < 2) return [] // lone timestamp isn't a chapter list
  return hits.map((h, i) => ({
    title: h.title,
    start: h.start,
    end: hits[i + 1]?.start ?? "",
  }))
}

/**
 * Run a yt-dlp caption-download command in tmpDir.
 * Returns the path to the first .vtt or .srt file found, or null.
 * ponytail: ENOENT = yt-dlp missing → null (caller skips to next step)
 */
const downloadSubs = (url: string, tmpDir: string, flags: string[]): string | null => {
  const cmd = [
    "yt-dlp",
    ...flags,
    "--skip-download",
    "--no-warnings",
    "--no-playlist",
    "-o",
    join(tmpDir, "vid"),
    url,
  ].join(" ")
  try {
    execSync(cmd, { stdio: "pipe", timeout: 60_000 })
  } catch {
    return null // yt-dlp not installed, network fail, no subs for this lang, etc.
  }
  const files = readdirSync(tmpDir).filter((f) => f.endsWith(".vtt") || f.endsWith(".srt"))
  return files.length > 0 ? join(tmpDir, files[0]) : null
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Extract transcript + chapter structure from a YouTube URL.
 *
 * Cascade (stops at first success):
 *   1. yt-dlp manual EN captions
 *   2. yt-dlp auto-generated EN captions
 *   3. yt-dlp any-language auto-captions
 *   4. YouTube oEmbed title + yt-dlp description (no captions)
 *   5. { kind: 'none' }
 */
export const extractTranscript = async (url: string): Promise<TranscriptResult> => {
  const tmpDir = join(tmpdir(), `poiesis-subs-${Date.now()}`)
  mkdirSync(tmpDir, { recursive: true })

  try {
    // ── Step 1–3: try captions via yt-dlp ────────────────────────────────
    const subAttempts: string[][] = [
      ["--write-subs", "--sub-langs", "en"],
      ["--write-auto-subs", "--sub-langs", "en"],
      ["--write-auto-subs", "--sub-langs", "en.*"],
    ]

    let subFile: string | null = null
    for (const flags of subAttempts) {
      subFile = downloadSubs(url, tmpDir, flags)
      if (subFile) break
    }

    // ── Fetch metadata (title + description + yt chapters) ────────────────
    // ponytail: single yt-dlp -j call covers metadata + chapter detection
    let ytTitle = ""
    let ytDescription = ""
    let ytChapters: YTChapter[] = []

    try {
      const raw = execSync(`yt-dlp -j --no-warnings --no-playlist "${url}"`, {
        stdio: "pipe",
        timeout: 30_000,
      }).toString()
      const meta = JSON.parse(raw) as {
        title?: string
        description?: string
        chapters?: Array<{ start_time: number; end_time: number; title: string }>
      }
      ytTitle = meta.title ?? ""
      ytDescription = meta.description ?? ""
      // Prefer structured chapters from yt-dlp JSON over description parsing
      if (meta.chapters && meta.chapters.length > 0) {
        ytChapters = meta.chapters.map((c) => ({
          title: c.title,
          start: secsToTimestamp(c.start_time),
          end: secsToTimestamp(c.end_time),
        }))
      } else {
        ytChapters = parseDescriptionChapters(ytDescription)
      }
    } catch {
      // yt-dlp not available or metadata fetch failed — fall through
    }

    // ── Return transcript if we got subs ──────────────────────────────────
    if (subFile && existsSync(subFile)) {
      const raw = readFileSync(subFile, "utf8")
      const text = parseVtt(raw)
      if (text.length > 100) {
        // sanity: must have meaningful content
        return { kind: "transcript", text, chapters: ytChapters, title: ytTitle }
      }
    }

    // ── Step 4: metadata only ─────────────────────────────────────────────
    if (ytTitle || ytDescription) {
      // Also try oEmbed as fallback for title
      if (!ytTitle) {
        try {
          const res = await fetch(
            `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
          )
          const data = (await res.json()) as { title?: string }
          ytTitle = data.title ?? ""
        } catch {
          // oEmbed failed too — leave title empty
        }
      }
      if (ytTitle || ytDescription) {
        return { kind: "metadata", title: ytTitle, description: ytDescription }
      }
    }

    // ── Step 5: nothing ───────────────────────────────────────────────────
    return { kind: "none" }
  } finally {
    try {
      rmSync(tmpDir, { recursive: true, force: true })
    } catch {
      // ignore cleanup failure
    }
  }
}

// ── self-check ────────────────────────────────────────────────────────────────

if (process.argv[1]?.endsWith("transcript.ts")) {
  // Test VTT parser
  const vtt = `WEBVTT
Kind: captions
Language: en

00:00:00.000 --> 00:00:04.000 align:start position:0%

<00:00:00.000><c>Hello</c> <00:00:01.500><c>world</c>

00:00:04.000 --> 00:00:08.000 align:start position:0%
Hello world
<00:00:04.000><c>from</c> <00:00:05.000><c>YouTube</c>
`
  const text = parseVtt(vtt)
  console.assert(text.includes("Hello world"), `VTT parse failed: "${text}"`)
  console.assert(!text.includes("-->"), `timestamps leaked: "${text}"`)
  console.assert(!text.includes("<"), `tags leaked: "${text}"`)

  // Test description chapter parser
  const desc = `My cool video

0:00 Introduction
2:30 - Setup & Installation
10:45 Building the app
25:00 Deployment

Some other text here`
  const chapters = parseDescriptionChapters(desc)
  console.assert(chapters.length === 4, `expected 4 chapters, got ${chapters.length}`)
  console.assert(chapters[0].title === "Introduction", `ch0 title: ${chapters[0].title}`)
  console.assert(chapters[0].start === "0:00", `ch0 start: ${chapters[0].start}`)
  console.assert(chapters[0].end === "2:30", `ch0 end: ${chapters[0].end}`)
  console.assert(chapters[1].title === "Setup & Installation", `ch1 title: ${chapters[1].title}`)
  console.assert(chapters[3].end === "", `last chapter end should be empty: ${chapters[3].end}`)

  // Lone timestamp should not be treated as chapters
  const lone = "Check out 0:00 for the intro"
  const none = parseDescriptionChapters(lone)
  console.assert(none.length === 0, `lone timestamp should not produce chapters: ${none.length}`)

  // secsToTimestamp
  console.assert(secsToTimestamp(0) === "0:00", `0 secs: ${secsToTimestamp(0)}`)
  console.assert(secsToTimestamp(90) === "1:30", `90 secs: ${secsToTimestamp(90)}`)
  console.assert(secsToTimestamp(3661) === "1:01:01", `3661 secs: ${secsToTimestamp(3661)}`)

  console.log("transcript.ts: ok")
}
