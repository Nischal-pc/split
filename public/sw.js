// SplitIt service worker: shows push notifications and opens the right group when tapped.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))

self.addEventListener('push', e => {
  let d = {}
  try { d = e.data ? e.data.json() : {} } catch { d = { body: e.data && e.data.text() } }
  e.waitUntil(self.registration.showNotification(d.title || 'SplitIt', {
    body: d.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: d.tag, // one notification per expense; an edit replaces the "added" one
    data: { url: d.url || '/' },
  }))
})

self.addEventListener('notificationclick', e => {
  e.notification.close()
  const url = new URL(e.notification.data?.url || '/', self.location.origin).href
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const w of wins) {
      if (new URL(w.url).origin === self.location.origin) { await w.focus(); return w.navigate(url) }
    }
    return self.clients.openWindow(url)
  })())
})
