// ── Re-export CapturePayload from schema (single source of truth) ─────────────
// Do NOT define CapturePayload here — it lives in schemas/capture.schema.ts.
export type { CapturePayload } from "~schemas/capture.schema"

// ── Gate result (internal to background.ts — never stored directly in SDK) ────
// score is ALWAYS 0–1:
//   Memory Gate  → parsed.confidence ?? 0.5
//   Heuristic    → Math.max(0, Math.min(1, rawScore / 80))
export interface GateResult {
  score: number
  reason: string
  source: "memory-gate" | "heuristic-fallback"
}

// ── Extension messages ────────────────────────────────────────────────────────
export type ExtensionMessage = {
  type: "CAPTURE"
  payload: import("~schemas/capture.schema").CapturePayload
}

// ── Memory Gate classifier result (from Gemini Nano prompt) ──────────────────
export interface MemoryGateResult {
  store: boolean
  confidence?: number
  reason: string
}

// ── Stored capture stats (written by background.ts) ──────────────────────────
export interface CaptureStats {
  lastSavedAt?: string // ISO
  savedToday?: number
}
