import { useState } from "react"

import { memoryService } from "~services/memory.service"

export const useMemoryDelete = () => {
  const [isDeleting, setIsDeleting] = useState(false)

  const mutate = async (docId: string): Promise<void> => {
    setIsDeleting(true)
    try {
      await memoryService.delete(docId)
    } finally {
      setIsDeleting(false)
    }
  }

  return { mutate, isDeleting }
}
