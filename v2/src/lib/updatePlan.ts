import { compareVersions } from "./version"

/** The web part of the app as a zip (version.json "bundle"), for live updates */
export interface BundleInfo {
  file: string
  size?: number
  sha256: string
  /** Installed apps from this version on have the native part this bundle needs */
  minNative: string
}

/** What the installed APK says about itself (ApkUpdater.info) */
export interface NativeInfo {
  /** APK version */
  versionName: string
  /** Live update in use ("" = the APK's own files) */
  live: string
  /** Live update on trial (not confirmed yet) */
  pending: string
  /** Live update that failed to start and was rolled back */
  bad: string
}

export type UpdatePlan = "latest" | "live" | "apk"

/**
 * How to get from `running` to the published version: nothing to do, a live
 * update (download the web part only, no reinstall), or a new APK (the native
 * part changed, the app is too old for live updates, or the live one failed).
 */
export function planUpdate(
  remote: { version: string; bundle?: BundleInfo },
  running: string,
  native: NativeInfo | null
): UpdatePlan {
  if (!remote.version || compareVersions(remote.version, running) <= 0) return "latest"
  const bundle = remote.bundle
  if (
    bundle?.sha256 &&
    native?.versionName &&
    compareVersions(native.versionName, bundle.minNative) >= 0 &&
    native.bad !== remote.version
  ) {
    return "live"
  }
  return "apk"
}
