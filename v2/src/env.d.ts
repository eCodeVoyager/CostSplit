/** App version from package.json, injected by vite.config.ts */
declare const __APP_VERSION__: string

interface ImportMetaEnv {
  /** Sync server origin. Empty = same origin as the web app (dev proxy or server-hosted). */
  readonly VITE_SERVER_URL?: string
  /** Where the web app and /download page live; used for invite links and update checks */
  readonly VITE_PUBLIC_URL?: string
  /** "off" builds a local-only app */
  readonly VITE_SYNC?: string
}
