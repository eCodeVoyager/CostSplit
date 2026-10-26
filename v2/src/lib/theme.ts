import { useSyncExternalStore } from "react"
import { isNative } from "./server"

export type Theme = "system" | "light" | "dark"

const KEY = "costsplit:theme"
const listeners = new Set<() => void>()
const media = window.matchMedia("(prefers-color-scheme: dark)")

function read(): Theme {
  try {
    const value = localStorage.getItem(KEY)
    return value === "light" || value === "dark" ? value : "system"
  } catch {
    return "system"
  }
}

let current = read()

export function applyTheme(theme: Theme = current) {
  const dark = theme === "dark" || (theme === "system" && media.matches)
  document.documentElement.classList.toggle("dark", dark)
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#0b1220" : "#f7f9fc")
  if (isNative) {
    // Loaded only inside the app, so the website bundle stays small
    import("@capacitor/core")
      .then(({ SystemBars, SystemBarsStyle }) =>
        SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light })
      )
      .catch(() => {})
  }
}

export function setTheme(theme: Theme) {
  current = theme
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // Private mode: theme still applies for this session
  }
  applyTheme(theme)
  listeners.forEach((l) => l())
}

media.addEventListener("change", () => applyTheme())

export function useTheme(): [Theme, (t: Theme) => void] {
  const theme = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current
  )
  return [theme, setTheme]
}
