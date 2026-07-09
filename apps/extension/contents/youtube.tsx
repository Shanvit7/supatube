import type { PlasmoCSConfig } from "plasmo"
import { useEffect, useRef } from "react"

import type { ExtensionMessage } from "~lib/types"
import type { CapturePayload } from "~schemas/capture.schema"

export const config: PlasmoCSConfig = {
  matches: ["https://www.youtube.com/watch*"],
}

// ── Trigger thresholds ────────────────────────────────────────────────────────
// Fire CAPTURE when EITHER threshold is met. Low on purpose — the Memory Gate
// decides whether the video is worth saving, not these thresholds.

const TRIGGER = {
  minWatchPercent: 60, // 0–100 scale
  minPlayedSeconds: 180, // genuine playback excluding seeks
} as const

// ── Stable metadata extraction ────────────────────────────────────────────────
// Strategy:
//   1. videoId + url — from URL params (stable)
//   2. title, channel, channelUrl, thumbnailUrl — YouTube oEmbed API (stable, no key)
//   3. channelId — from oEmbed author_url or JSON-LD (more stable than CSS selectors)
//   4. publishedAt, description — from JSON-LD VideoObject (more stable than CSS)
//   5. duration, currentTime, playedSeconds — from <video> element (HTML5 API)

const getVideoId = (): string | null => new URLSearchParams(window.location.search).get("v")

// ── oEmbed ────────────────────────────────────────────────────────────────────

interface OEmbedResponse {
  title: string
  author_name: string
  author_url: string
  thumbnail_url: string
}

const fetchOEmbed = async (url: string): Promise<OEmbedResponse | null> => {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
    )
    if (!res.ok) return null
    return (await res.json()) as OEmbedResponse
  } catch {
    return null
  }
}

// ── JSON-LD extraction ────────────────────────────────────────────────────────

interface JsonLd {
  name?: string
  description?: string
  uploadDate?: string
  author?: { identifier?: string; name?: string }
}

const getJsonLd = (): JsonLd | null => {
  const raw = document.querySelector<HTMLScriptElement>(
    'script[type="application/ld+json"]'
  )?.textContent
  if (!raw) return null
  try {
    return JSON.parse(raw) as JsonLd
  } catch {
    return null
  }
}

// ── channelId extraction ──────────────────────────────────────────────────────

const extractChannelId = (authorUrl: string): string => {
  // oEmbed author_url may be /channel/UCxxxx or /@handle
  const match = authorUrl.match(/\/channel\/(UC[\w-]+)/)
  if (match) return match[1]
  // Fallback: JSON-LD author.identifier
  const ld = getJsonLd()
  return ld?.author?.identifier ?? ""
}

// ── Video tracker ─────────────────────────────────────────────────────────────
// Tracks genuine playback time (excludes seeking).
// Returns cleanup function.

const attachTracker = (
  video: HTMLVideoElement,
  onCapture: (playedSeconds: number, watchPercent: number, currentTime: number) => void
): (() => void) => {
  let reported = false
  let playedSeconds = 0
  let lastTime = video.currentTime

  const onTimeUpdate = () => {
    if (reported) return

    const now = video.currentTime
    const delta = now - lastTime
    if (delta > 0 && delta < 2) playedSeconds += delta // genuine forward playback
    lastTime = now

    const watchPercent = video.duration > 0 ? Math.round((now / video.duration) * 100) : 0

    if (playedSeconds >= TRIGGER.minPlayedSeconds || watchPercent >= TRIGGER.minWatchPercent) {
      reported = true
      onCapture(Math.round(playedSeconds), watchPercent, Math.round(now))
    }
  }

  video.addEventListener("timeupdate", onTimeUpdate)
  return () => video.removeEventListener("timeupdate", onTimeUpdate)
}

// ── Wait for <video> ──────────────────────────────────────────────────────────

const waitForVideo = (onReady: (video: HTMLVideoElement) => () => void): (() => void) => {
  const existing = document.querySelector<HTMLVideoElement>("video")
  if (existing) return onReady(existing)

  let detach: (() => void) | null = null
  const observer = new MutationObserver(() => {
    const video = document.querySelector<HTMLVideoElement>("video")
    if (!video) return
    observer.disconnect()
    detach = onReady(video)
  })
  observer.observe(document.body, { childList: true, subtree: true })
  return () => {
    observer.disconnect()
    detach?.()
  }
}

// ── Build and send CAPTURE message ────────────────────────────────────────────

const sendCapture = async (
  video: HTMLVideoElement,
  playedSeconds: number,
  watchPercent: number,
  currentTime: number
) => {
  const videoId = getVideoId()
  if (!videoId) return

  const url = `https://www.youtube.com/watch?v=${videoId}`

  // oEmbed fetch — called once at capture time (not on mount)
  const oembed = await fetchOEmbed(url)

  const channelUrl = oembed?.author_url ?? ""
  const channelId = channelUrl ? extractChannelId(channelUrl) : ""
  const thumbnailUrl =
    oembed?.thumbnail_url ?? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`

  // JSON-LD supplemental fields
  const ld = getJsonLd()
  const publishedAt = ld?.uploadDate ?? undefined
  const description = ld?.description?.slice(0, 500) ?? undefined

  const payload: CapturePayload = {
    videoId,
    url,
    title: oembed?.author_name
      ? oembed.title
      : document.title
          .replace(/^\(\d+\)\s+/, "")
          .replace(/ - YouTube$/, "")
          .trim(),
    channel: oembed?.author_name ?? "",
    channelId,
    channelUrl,
    thumbnailUrl,
    duration: Math.round(video.duration) || 0,
    watchPercent,
    currentTime,
    playedSeconds,
    publishedAt,
    description,
  }

  const message: ExtensionMessage = { type: "CAPTURE", payload }
  chrome.runtime.sendMessage(message)
}

// ── Component ─────────────────────────────────────────────────────────────────
// No UI — all work in useEffect.

export default function YouTubeTracker() {
  const detachRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    const startTracking = () => {
      detachRef.current?.()
      detachRef.current = waitForVideo((video) =>
        attachTracker(video, (playedSeconds, watchPercent, currentTime) => {
          void sendCapture(video, playedSeconds, watchPercent, currentTime)
        })
      )
    }

    // YouTube SPA: re-track on every client-side navigation
    document.addEventListener("yt-navigate-finish", startTracking)
    // Initial page load (yt-navigate-finish won't fire)
    startTracking()

    return () => {
      document.removeEventListener("yt-navigate-finish", startTracking)
      detachRef.current?.()
    }
  }, [])

  return null
}
