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
