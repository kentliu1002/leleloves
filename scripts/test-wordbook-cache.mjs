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
