import { useEffect, useState } from "react"
import { authHeaders, getSession } from "./auth"
import { db } from "./db"
import { newId } from "./repo"
import { apiUrl, hasServer } from "./server"
import { requestSync } from "./sync"

const MAX_SIDE = 1600

/**
 * Shrinks a camera photo to a ~200 KB JPEG. Re-encoding also drops EXIF data,
 * so the phone's GPS location never leaves the device.
 */
export async function compressImage(file: Blob): Promise<Blob> {
  let source: ImageBitmap | HTMLImageElement
  try {
    source = await createImageBitmap(file, { imageOrientation: "from-image" })
  } catch {
    // Older WebViews: decode through an <img>
    source = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error("This photo format isn't supported"))
      img.src = URL.createObjectURL(file)
    })
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(source.width, source.height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(source.width * scale)
  canvas.height = Math.round(source.height * scale)
  canvas.getContext("2d")!.drawImage(source, 0, 0, canvas.width, canvas.height)
  if ("close" in source) source.close()
  else URL.revokeObjectURL(source.src)
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't read this photo"))), "image/jpeg", 0.75)
  )
}

/** Save a photo on this phone; it uploads with the next sync */
export async function savePhoto(tripId: string, file: Blob) {
  const blob = await compressImage(file)
  const id = newId()
  await db.files.add({ id, tripId, blob, type: "image/jpeg", uploaded: 0, createdAt: Date.now() })
  requestSync()
  return id
}

export type PhotoState = { status: "loading" } | { status: "ready"; url: string } | { status: "unavailable"; reason: string }

/** Object URL for a photo: from this phone, or downloaded once and kept */
export function usePhoto(tripId: string, fileId?: string): PhotoState | null {
  const [state, setState] = useState<PhotoState | null>(null)

  useEffect(() => {
    if (!fileId) {
      setState(null)
      return
    }
    let url: string | null = null
    let cancelled = false
    setState({ status: "loading" })
    ;(async () => {
      let row = await db.files.get(fileId)
      if (!row) {
        if (!hasServer() || !getSession()) {
          setState({ status: "unavailable", reason: "Sign in to see photos added on other phones" })
          return
        }
        if (!navigator.onLine) {
          setState({ status: "unavailable", reason: "Photo loads when you're online" })
          return
        }
        try {
          const res = await fetch(apiUrl(`/files/${tripId}/${fileId}`), { headers: authHeaders() })
          if (!res.ok) throw new Error(String(res.status))
          const blob = await res.blob()
          row = { id: fileId, tripId, blob, type: "image/jpeg", uploaded: 1, createdAt: Date.now() }
          await db.files.put(row)
        } catch {
          // Usually the other phone hasn't uploaded it yet
          if (!cancelled) setState({ status: "unavailable", reason: "Photo isn't uploaded yet" })
          return
        }
      }
      if (cancelled) return
      url = URL.createObjectURL(row.blob)
      setState({ status: "ready", url })
    })()
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [tripId, fileId])

  return state
}
