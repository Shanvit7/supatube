import { useEffect, useState } from "react"

import type { MemoryProfile } from "~services/memory.service"
import { memoryService } from "~services/memory.service"

export const useMemoryProfile = (containerTag: string) => {
  const [data, setData] = useState<MemoryProfile | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [tick, setTick] = useState(0)

  // biome-ignore lint/correctness/useExhaustiveDependencies: tick is the manual refetch trigger
  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    memoryService
      .profile(containerTag)
      .then((profile) => {
        if (!cancelled) setData(profile)
      })
      .catch(() => {
        if (!cancelled) setData(null)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [containerTag, tick])

  const refetch = () => setTick((n) => n + 1)

  return { data, isLoading, refetch }
}
