import { useEffect, useState } from "react"

import type { SearchResult } from "~services/memory.service"
import { memoryService } from "~services/memory.service"

export const useMemorySearch = (q: string, containerTag: string) => {
  const [data, setData] = useState<SearchResult[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!q.trim()) {
      setData([])
      return
    }
    let cancelled = false
    setIsLoading(true)
    memoryService
      .search(q, containerTag)
      .then((results) => {
        if (!cancelled) setData(results)
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
  }, [q, containerTag])

  return { data, isLoading }
}
