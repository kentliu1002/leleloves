import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
const handlers = {}
const sample = new Uint8Array([10, 20, 30, 40, 50])
const context = { URL, Response, Uint8Array, self: { addEventListener(name, fn) { handlers[name] = fn } },
  caches: { async open() { return { async match(url) { return url.endsWith('test.mp3') ? new Response(sample, { headers: { 'content-type': 'audio/mpeg' } }) : undefined } } } },
  fetch: async () => new Response('network') }
vm.runInNewContext(readFileSync('public/wordbook-audio-sw.js', 'utf8'), context)
async function intercept(url, range) {
  let result
  const event = { request: { method: 'GET', url, headers: new Headers(range ? {range} : {}) }, respondWith(value) { result = value } }
  handlers.fetch(event)
  return result && await result
}
const url = 'https://example.test/storage/v1/object/public/attachments/wordbook-audio/v1/test.mp3'
let response = await intercept(url)
assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [...sample])
response = await intercept(url, 'bytes=1-3')
assert.equal(response.status, 206)
assert.equal(response.headers.get('content-range'), 'bytes 1-3/5')
assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [20,30,40])
assert.equal((await intercept(url, 'bytes=9-')).status, 416)
assert.equal(await (await intercept(url.replace('test.mp3','not-saved.mp3'))).text(), 'network')
assert.equal(await intercept('https://example.test/unrelated.mp3'), undefined)
console.log('wordbook service worker cached audio, ranges and network fallback passed')

const offlineHandlers = {}
const shellCache = new Map([
  ['https://example.test/wordbook', new Response('<html>offline wordbook</html>', { headers: { 'content-type': 'text/html' } })],
  ['https://example.test/_next/static/chunks/wordbook.js', new Response('offline script')],
  ['https://example.test/api/vocab/library', new Response('{"units":[]}', { headers: { 'content-type': 'application/json' } })],
])
const offlineContext = { URL, Response, Uint8Array, self: { location: { origin: 'https://example.test' }, addEventListener(name, fn) { offlineHandlers[name] = fn } },
  caches: { async open(name) { return { async match(url) { return name === 'lele-wordbook-offline-v1' ? shellCache.get(typeof url === 'string' ? url : url.url)?.clone() : undefined } } } },
  fetch: async () => { throw new Error('offline') } }
vm.runInNewContext(readFileSync('public/wordbook-audio-sw.js', 'utf8'), offlineContext)
async function offlineFetch(url, mode = 'cors') {
  let result
  offlineHandlers.fetch({ request: { method: 'GET', url, mode, headers: new Headers() }, respondWith(value) { result = value } })
  return result && await result
}
assert.match(await (await offlineFetch('https://example.test/wordbook', 'navigate')).text(), /offline wordbook/)
assert.equal(await (await offlineFetch('https://example.test/_next/static/chunks/wordbook.js')).text(), 'offline script')
assert.deepEqual(await (await offlineFetch('https://example.test/api/vocab/library')).json(), { units: [] })
assert.equal(await offlineFetch('https://example.test/api/points'), undefined)
console.log('wordbook offline navigation, assets and library passed')
let handshake
assert.equal(typeof offlineHandlers.message, 'function')
offlineHandlers.message({ data: { type: 'WORDBOOK_OFFLINE_VERSION' }, ports: [{ postMessage(value) { handshake = value } }] })
assert.equal(handshake, 'wordbook-offline-v1')
console.log('wordbook offline worker version handshake passed')
