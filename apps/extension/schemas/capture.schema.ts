import { z } from "zod"

// ── Capture payload schema ────────────────────────────────────────────────────
// Single source of truth for CapturePayload.
// lib/types.ts re-exports the inferred type from here — never duplicate it.

export const captureSchema = z.object({
  videoId: z.string().min(1),
  url: z.string().url(),
  title: z.string(),
  channel: z.string(),
  channelId: z.string(),
  channelUrl: z.string().url(),
  thumbnailUrl: z.string().url().optional(), // from oEmbed; fallback = YouTube CDN
  duration: z.number().nonnegative(), // seconds, from <video>.duration
  watchPercent: z.number().min(0).max(100), // 0–100 scale
  currentTime: z.number().nonnegative(), // video position at capture
  playedSeconds: z.number().nonnegative(), // genuine watch time, excludes seeks
  publishedAt: z.string().optional(), // ISO from JSON-LD uploadDate
  description: z.string().max(500).optional(), // Memory Gate only, from JSON-LD
})

export type CapturePayload = z.infer<typeof captureSchema>
