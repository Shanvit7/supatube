import type Supermemory from "supermemory"
import type {
  DocumentListResponse,
  ProfileResponse,
  SearchDocumentsResponse,
} from "supermemory/resources"

import { createLogger } from "~lib/logger"
import { getSupermemoryClient } from "~lib/supermemory"
import type { CapturePayload } from "~schemas/capture.schema"

const logger = createLogger("memory-service")

// ── Types ─────────────────────────────────────────────────────────────────────

export type MemoryDocument = DocumentListResponse.Memory
export type SearchResult = SearchDocumentsResponse.Result
export type MemoryProfile = ProfileResponse.Profile

export interface AddMeta {
  valueScore: number // 0–1 normalized gate score
  gateReason: string
  gateSource: "memory-gate" | "heuristic-fallback"
  watchedAt: string // ISO
  containerTag: string
}

// ── Error ─────────────────────────────────────────────────────────────────────

export class MemoryError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message)
    this.name = "MemoryError"
  }
}

// ── Service ───────────────────────────────────────────────────────────────────

export class MemoryService {
  private async client(): Promise<Supermemory> {
    return getSupermemoryClient()
  }

  // ── Add ───────────────────────────────────────────────────────────────────
  // content = YouTube URL. Supermemory fetches, transcribes, extracts entities.
  // customId = youtube:<videoId> for dedup on re-watch.

  async add(payload: CapturePayload, meta: AddMeta): Promise<void> {
    logger.info({ videoId: payload.videoId }, "adding memory")
    const client = await this.client()

    const metadata: Record<string, string | number | boolean | string[]> = {
      source: "youtube",
      videoId: payload.videoId,
      url: payload.url,
      title: payload.title,
      channel: payload.channel,
      channelId: payload.channelId,
      channelUrl: payload.channelUrl,
      duration: payload.duration,
      watchPercent: payload.watchPercent,
      playedSeconds: payload.playedSeconds,
      watchedAt: meta.watchedAt,
      valueScore: meta.valueScore,
      gateReason: meta.gateReason,
      gateSource: meta.gateSource,
    }

    if (payload.thumbnailUrl) metadata.thumbnailUrl = payload.thumbnailUrl
    if (payload.publishedAt) metadata.publishedAt = payload.publishedAt

    try {
      await client.add({
        content: payload.url,
        customId: `youtube:${payload.videoId}`,
        containerTag: meta.containerTag,
        metadata,
      })
      logger.info({ videoId: payload.videoId }, "memory added")
    } catch (err) {
      logger.error({ err, videoId: payload.videoId }, "failed to add memory")
      throw new MemoryError("Failed to add memory", err)
    }
  }

  // ── Search ────────────────────────────────────────────────────────────────

  async search(q: string, containerTag: string, limit = 20): Promise<SearchResult[]> {
    logger.info({ q, containerTag }, "searching memories")
    const client = await this.client()
    try {
      const res = await client.search.documents({ q, containerTag, limit })
      return res.results
    } catch (err) {
      logger.error({ err, q }, "search failed")
      throw new MemoryError("Search failed", err)
    }
  }

  // ── Profile ───────────────────────────────────────────────────────────────

  async profile(containerTag: string): Promise<MemoryProfile> {
    logger.info({ containerTag }, "fetching profile")
    const client = await this.client()
    try {
      const res = await client.profile({ containerTag })
      return res.profile
    } catch (err) {
      logger.error({ err }, "profile fetch failed")
      throw new MemoryError("Profile fetch failed", err)
    }
  }

  // ── List ──────────────────────────────────────────────────────────────────

  async list(containerTag: string, limit = 50): Promise<MemoryDocument[]> {
    logger.info({ containerTag, limit }, "listing memories")
    const client = await this.client()
    try {
      const res = await client.documents.list({
        containerTags: [containerTag],
        limit,
        order: "desc",
      })
      return res.memories
    } catch (err) {
      logger.error({ err }, "list failed")
      throw new MemoryError("List failed", err)
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async delete(docId: string): Promise<void> {
    logger.info({ docId }, "deleting memory")
    const client = await this.client()
    try {
      await client.documents.delete(docId)
      logger.info({ docId }, "memory deleted")
    } catch (err) {
      logger.error({ err, docId }, "delete failed")
      throw new MemoryError("Delete failed", err)
    }
  }
}

export const memoryService = new MemoryService()
