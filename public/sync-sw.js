// Added to the app's service worker (see vite.config.ts). When the browser sees the
// connection come back it fires 'sync'; the open app is then told to send what is
// waiting. Sending needs the app's sign-in, so a closed app sends when next opened.
self.addEventListener('sync', (event) => {
  if (event.tag !== 'mandi-sync') return
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) client.postMessage({ type: 'mandi-sync' })
    }),
  )
})
