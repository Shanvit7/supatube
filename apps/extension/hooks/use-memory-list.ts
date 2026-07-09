import { useEffect, useState } from "react"

import type { MemoryDocument } from "~services/memory.service"
import { memoryService } from "~services/memory.service"

export const useMemoryList = (containerTag: string, limit = 50) => {
  const [data, setData] = useState<MemoryDocument[]>([])
  const [isLoading, setIsLoading] = useState(false)
  // Incrementing tick triggers a refetch without resetting `data` first.
  const [tick, setTick] = useState(0)

  // biome-ignore lint/correctness/useExhaustiveDependencies: tick is the manual refetch trigger
  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    memoryService
      .list(containerTag, limit)
      .then((docs) => {
        if (!cancelled) setData(docs)
      })
      .catch(() => {
        if (!cancelled) setData([])
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [containerTag, limit, tick])

  const refetch = () => setTick((n) => n + 1)

  return { data, setData, isLoading, refetch }
}
