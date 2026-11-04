// Loaded into the generated service worker (vite.config.ts: workbox.importScripts).
// Tapping a CostSplit notification focuses the app on that screen, or opens it.
self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || "/"
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) {
          client.postMessage({ type: "costsplit:open", url })
          return client.focus()
        }
      }
      return self.clients.openWindow(url)
    })
  )
})
