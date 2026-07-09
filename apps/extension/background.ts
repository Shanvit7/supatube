import { runGate as runHeuristicGate } from "~lib/heuristic-gate"
import { createLogger } from "~lib/logger"
import {
  isMemoryGateAvailable,
  resetMemoryGateCache,
  runGate as runMemoryGate,
} from "~lib/memory-gate"
import type { ExtensionMessage, GateResult } from "~lib/types"
import { captureSchema } from "~schemas/capture.schema"
import { SETTINGS_DEFAULTS } from "~schemas/settings.schema"
import { probeSupermemory } from "~services/http"
import { memoryService } from "~services/memory.service"

const logger = createLogger("background")

// ── Gate availability cache ───────────────────────────────────────────────────
// Reset on startup/install so we re-probe fresh each SW lifetime.

const resetGateCache = () => {
  resetMemoryGateCache()
}

chrome.runtime.onStartup.addListener(resetGateCache)
chrome.runtime.onInstalled.addListener(() => {
  resetGateCache()
  void runOnboarding()
})

// ── Onboarding handshake ──────────────────────────────────────────────────────
// Probe localhost:6767. Supermemory Local does not expose a /handshake endpoint
// as of the current SDK version — user must paste API key in Options if needed.

const runOnboarding = async () => {
  const reachable = await probeSupermemory()
  if (!reachable) {
    logger.warn({}, "Supermemory not reachable — user must configure API key")
  } else {
    logger.info({}, "Supermemory reachable")
  }
}

// ── Message listener ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
  if (message.type !== "CAPTURE") return
  void handleCapture(message.payload)
})

// ── Capture handler ───────────────────────────────────────────────────────────

const handleCapture = async (rawPayload: unknown): Promise<void> => {
  // Validate
  const parsed = captureSchema.safeParse(rawPayload)
  if (!parsed.success) {
    logger.warn({ err: parsed.error.flatten() }, "invalid capture payload")
    return
  }
  const payload = parsed.data

  logger.info(
    { videoId: payload.videoId, watchPercent: payload.watchPercent },
    `gate check: "${payload.title}"`
  )

  // Clear badge before gate runs
  chrome.action.setBadgeText({ text: "" })

  // Load threshold from storage
  const {
    gateThreshold = SETTINGS_DEFAULTS.gateThreshold,
    containerTag = SETTINGS_DEFAULTS.containerTag,
  } = await chrome.storage.local.get({
    gateThreshold: SETTINGS_DEFAULTS.gateThreshold,
    containerTag: SETTINGS_DEFAULTS.containerTag,
  })

  // ── Gate dispatch ─────────────────────────────────────────────────────────
  let result: GateResult

  const aiReady = await isMemoryGateAvailable()

  if (aiReady) {
    try {
      result = await runMemoryGate(payload)
      logger.info({ score: result.score, reason: result.reason }, "Memory Gate result")
    } catch (err) {
      logger.error({ err }, "Memory Gate threw — falling back to heuristic")
      result = await runHeuristicGate(payload)
    }
  } else {
    logger.warn({}, "Memory Gate unavailable — heuristic gate active")
    result = await runHeuristicGate(payload)
  }

  logger.info(
    { videoId: payload.videoId, score: result.score, source: result.source, gateThreshold },
    `gate: ${result.source}`
  )

  // ── Threshold check ───────────────────────────────────────────────────────
  if (result.score < (gateThreshold as number)) {
    logger.debug({ title: payload.title, score: result.score }, "gate: drop")
    setBadge("–", "#ef4444")
    return
  }

  // ── Persist via SDK ───────────────────────────────────────────────────────
  try {
    await memoryService.add(payload, {
      valueScore: result.score,
      gateReason: result.reason,
      gateSource: result.source,
      watchedAt: new Date().toISOString(),
      containerTag: containerTag as string,
    })

    setBadge("✓", "#22c55e")
    await updateCaptureStats()
    logger.info({ videoId: payload.videoId, source: result.source }, "memory saved")
  } catch (err) {
    logger.error({ err, videoId: payload.videoId }, "SDK write failed")
    setBadge("!", "#f59e0b")
  }
}

// ── Badge helpers ─────────────────────────────────────────────────────────────

const setBadge = (text: string, color: string) => {
  chrome.action.setBadgeText({ text })
  chrome.action.setBadgeBackgroundColor({ color })
}

// ── Capture stats (for popup display) ────────────────────────────────────────

const updateCaptureStats = async () => {
  const now = new Date()
  const todayKey = `savedToday_${now.toISOString().slice(0, 10)}`
  const { [todayKey]: count = 0 } = await chrome.storage.local.get({ [todayKey]: 0 })
  await chrome.storage.local.set({
    lastSavedAt: now.toISOString(),
    [todayKey]: (count as number) + 1,
    savedToday: (count as number) + 1,
  })
}
