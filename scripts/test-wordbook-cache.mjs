import assert from 'node:assert/strict'
import { audioUrls, downloadWordbookAudio } from '../lib/wordbook-cache.mjs'
const units = [{ words: [
  { word_audio_url: 'https://audio.test/1.mp3', example_audio_url: 'https://audio.test/2.mp3' },
  { word_audio_url: 'https://audio.test/3.mp3', example_audio_url: 'https://audio.test/4.mp3' }
] }]
assert.equal(audioUrls(units).length, 4)
assert.throws(() => audioUrls([{ words: [{ word_audio_url: 'https://audio.test/1.mp3', example_audio_url: '' }] }]), /未准备/)
const stored = new Map([['https://audio.test/1.mp3', new Response('existing')]])
const cache = { match: async url => stored.get(url), put: async (url,res) => { stored.set(url, res) } }
const calls = [], progress = []
await downloadWordbookAudio(audioUrls(units), cache, async url => { calls.push(url); return new Response('audio') }, (done,total) => progress.push([done,total]))
assert.equal(calls.length, 3)
assert.equal(stored.size, 4)
assert.deepEqual(progress.at(-1), [4,4])
await downloadWordbookAudio(audioUrls(units), cache, async () => { throw Error('already cached') }, () => {})
assert.equal(stored.size, 4)
const partial = new Map()
const badCache = { match: async url => partial.get(url), put: async (url,res) => { partial.set(url,res) } }
await assert.rejects(downloadWordbookAudio(audioUrls(units), badCache, async url => url.endsWith('/2.mp3') ? new Response('', {status:500}) : new Response('ok'), () => {}), /下载失败/)
assert.ok(partial.size > 0 && partial.size < 4)
await downloadWordbookAudio(audioUrls(units), badCache, async () => new Response('ok'), () => {})
assert.equal(partial.size, 4)
console.log('wordbook download, progress, interruption and resume passed')

const { downloadWordbookShell } = await import('../lib/wordbook-cache.mjs')
const savedShell = new Map()
const shell = { put: async (url, res) => savedShell.set(url, await res.text()) }
const origin = 'https://example.test'
const responses = new Map([
  [origin + '/wordbook', '<html>page</html>'],
  [origin + '/_next/static/a.js', 'script'],
  [origin + '/_next/static/a.css', 'css'],
  [origin + '/api/vocab/library', '{"units":[]}'],
])
await downloadWordbookShell(shell, async url => new Response(responses.get(url) || '', {status: responses.has(url) ? 200 : 404}), origin, ['/ _invalid', '/_next/static/a.js', '/_next/static/a.css'])
assert.equal(savedShell.get(origin + '/wordbook'), '<html>page</html>')
assert.equal(savedShell.get(origin + '/_next/static/a.js'), 'script')
assert.equal(savedShell.get(origin + '/api/vocab/library'), '{"units":[]}')
assert.equal(savedShell.has(origin + '/ _invalid'), false)
await assert.rejects(downloadWordbookShell(shell, async () => new Response('', {status: 503}), origin, ['/ _invalid']), /离线/)
console.log('wordbook offline shell preparation passed')
const { downloadWordbookIpa } = await import('../lib/wordbook-cache.mjs')
const ipas = await downloadWordbookIpa([{ words: [{ id: 1, word: 'apple', ipa: '' }, { id: 2, word: 'pear', ipa: '/peə/' }, { id: 3, word: 'missing', ipa: '' }] }], async word => word === 'apple' ? new Response(JSON.stringify([{ phonetics: [{ text: '/ˈæpəl/' }] }])) : new Response('', {status: 404}))
assert.deepEqual(ipas, { 1: '/ˈæpəl/' })
console.log('offline phonetics preparation passed')
const resumedIpa = await downloadWordbookIpa([{ words: [{ id: 1, word: 'apple', ipa: '' }, { id: 3, word: 'missing', ipa: '' }] }], async () => { throw new Error('offline') }, { 1: '/ˈæpəl/' })
assert.equal(resumedIpa[1], '/ˈæpəl/')
console.log('existing offline phonetics preserved on retry')
