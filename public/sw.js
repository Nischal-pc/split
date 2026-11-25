// SplitIt service worker: offline app shell + push notifications.
// Data offline is handled in the app (last-seen copy in localStorage); this only caches files.
const CACHE = 'splitit-v2'
const SHELL = ['/', '/manifest.webmanifest', '/icon-192.png', '/apple-touch-icon.png']
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com']

// Save the page plus every build file it references, so the first visit already works offline
// (files the page loaded before this worker took over would otherwise never be cached).
async function cacheShell(res) {
  const c = await caches.open(CACHE)
  const page = res || await fetch('/', { cache: 'no-store' })
  const html = await page.clone().text()
  await c.put('/', page)
  const want = [...new Set([...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(m => m[1]).concat(SHELL.slice(1)))]
  const missing = []
  for (const u of want) if (!(await c.match(u, { ignoreVary: true }))) missing.push(u)
  if (missing.length) await c.addAll(missing)
}
self.addEventListener('install', e => {
  e.waitUntil(cacheShell().catch(() => {}).then(() => self.skipWaiting()))
})
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k)
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', e => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  const same = url.origin === self.location.origin
  if (!same && !FONT_HOSTS.includes(url.hostname)) return // never touch Appwrite / API calls

  // Pages: network first so new deploys show up; cached app shell when offline.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(r => { if (r.ok) e.waitUntil(cacheShell(r.clone()).catch(() => {})); return r })
      .catch(() => caches.match('/', { ignoreVary: true })))
    return
  }
  // Hashed build files, icons and fonts never change for a given URL: cache first.
  // ignoreVary: build files are saved without an Origin header but module scripts request with one.
  e.respondWith(caches.match(req, { ignoreVary: true }).then(hit => hit || fetch(req).then(r => {
    if (r.ok || r.type === 'opaque') { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)) }
    return r
  })))
})

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
