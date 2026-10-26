import { toast } from "sonner"
import { isNative, publicOrigin } from "./server"
import { compareVersions } from "./version"

export const APP_VERSION = __APP_VERSION__

/**
 * The APK is installed outside the Play Store, so the app looks for a newer
 * build on the download page itself and offers it.
 */
export async function checkForUpdate() {
  const base = publicOrigin()
  if (!isNative || !base || !navigator.onLine) return
  try {
    const res = await fetch(`${base}/download/version.json`, { cache: "no-store", signal: AbortSignal.timeout(8000) })
    if (!res.ok) return
    const info = (await res.json()) as { version?: string }
    if (!info.version || compareVersions(info.version, APP_VERSION) <= 0) return
    toast(`CostSplit ${info.version} is available`, {
      description: "Your data stays on this phone when you update.",
      duration: 20_000,
      action: { label: "Update", onClick: () => window.open(`${base}/download/`, "_blank") },
    })
  } catch {
    // Offline or no download page: try again next launch
  }
}
