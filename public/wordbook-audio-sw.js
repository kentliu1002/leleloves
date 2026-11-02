const CACHE = 'lele-wordbook-audio-v1'
const OFFLINE_CACHE = 'lele-wordbook-offline-v1'
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))
self.addEventListener('message', event => {
  if (event.data?.type === 'WORDBOOK_OFFLINE_VERSION') event.ports[0]?.postMessage('wordbook-offline-v1')
})
self.addEventListener('fetch', event => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET') return
  const isPage = url.origin === self.location?.origin && request.mode === 'navigate' && (url.pathname === '/wordbook' || url.pathname === '/wordbook/')
  const isLibrary = url.origin === self.location?.origin && url.pathname === '/api/vocab/library'
  const isAsset = url.origin === self.location?.origin && url.pathname.startsWith('/_next/static/')
  if (isPage || isLibrary || isAsset) {
    event.respondWith((async () => {
      const cache = await caches.open(OFFLINE_CACHE)
      const key = isPage ? `${url.origin}/wordbook` : request.url
      if (isAsset) return (await cache.match(key)) || fetch(request)
      try { return await fetch(request) } catch (error) {
        const cached = await cache.match(key)
        if (cached) return cached
        throw error
      }
    })())
    return
  }
  if (!url.pathname.includes('/storage/v1/object/public/attachments/wordbook-audio/v1/')) return
  event.respondWith((async () => {
    const cached = await (await caches.open(CACHE)).match(request.url)
    if (!cached) return fetch(request)
    const range = request.headers.get('range')
    if (!range) return cached
    const match = /^bytes=(\d+)-(\d*)$/.exec(range)
    if (!match) return fetch(request)
    const audio = await cached.arrayBuffer()
    const start = Number(match[1])
    const end = match[2] ? Math.min(Number(match[2]), audio.byteLength - 1) : audio.byteLength - 1
    if (start > end || start >= audio.byteLength) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${audio.byteLength}` } })
    return new Response(audio.slice(start, end + 1), { status: 206, headers: {
      'Content-Type': cached.headers.get('content-type') || 'audio/mpeg',
      'Content-Length': String(end - start + 1),
      'Content-Range': `bytes ${start}-${end}/${audio.byteLength}`,
      'Accept-Ranges': 'bytes'
    } })
  })())
})
