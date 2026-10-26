import { useEffect, useRef } from "react"

// popstate events caused by our own history.back() calls, not by the user
let selfPops = 0

/**
 * While a sheet/dialog is open, the phone's back button closes it instead of
 * leaving the screen. Pushes a history entry on open and pops it on close.
 */
export function useBackClose(open: boolean, close: () => void) {
  const closeRef = useRef(close)
  closeRef.current = close

  useEffect(() => {
    if (!open) return
    const marker = `sheet-${Math.random().toString(36).slice(2)}`
    window.history.pushState({ ...window.history.state, sheet: marker }, "")
    let poppedByUser = false
    const onPop = () => {
      if (selfPops > 0) {
        selfPops--
        return
      }
      poppedByUser = true
      closeRef.current()
    }
    window.addEventListener("popstate", onPop)
    return () => {
      window.removeEventListener("popstate", onPop)
      if (!poppedByUser && window.history.state?.sheet === marker) {
        selfPops++
        window.history.back()
        // Nobody may be listening when this lands; don't leave the counter armed
        setTimeout(() => (selfPops = 0), 500)
      }
    }
  }, [open])
}
