import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Lazy chunks are listed as prefetch links so the service worker (which caches what index.html
// references) has them offline too, without loading them up front.
const prefetchLazy = {
  name: 'prefetch-lazy-chunks',
  transformIndexHtml: {
    order: 'post',
    handler: (html, { bundle }) => Object.values(bundle || {}).filter(c => c.isDynamicEntry)
      .map(c => ({ tag: 'link', attrs: { rel: 'prefetch', href: '/' + c.fileName }, injectTo: 'head' })),
  },
}

export default defineConfig({ plugins: [react(), prefetchLazy] })
