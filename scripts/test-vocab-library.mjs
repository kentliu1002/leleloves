import assert from 'node:assert/strict'
import curriculum from '../lib/semester-vocab.json' with { type: 'json' }
import { groupVocabLibrary } from '../lib/vocab-library.mjs'
const rows = [
  { id: 101, word: 'sport', topic: curriculum.topic, ipa: '', meaning_zh: '体育运动', example_en: 'I like sport.', example_zh: '我喜欢运动。' },
  { id: 102, word: 'jump', topic: curriculum.topic, ipa: '/dʒʌmp/', meaning_zh: '跳' },
  { id: 103, word: 'sport', topic: '外研教材', ipa: '/spɔːt/', meaning_zh: '运动' },
  { id: 104, word: 'jump', topic: '外研教材', ipa: '/wrong/', meaning_zh: '跳' },
  { id: 105, word: 'unrelated', topic: '外研教材', ipa: '/x/' },
  { id: 106, word: 'unrelated', topic: curriculum.topic, ipa: '/x/' }
]
const result = groupVocabLibrary(rows)
assert.equal(result.book, curriculum.book)
assert.equal(result.units.length, 6)
assert.deepEqual(result.units[0].words.map(w => w.word), ['sport', 'jump'])
assert.equal(result.units[0].words[0].id, 101)
assert.equal(result.units[0].words[0].ipa, '/spɔːt/')
assert.equal(result.units[0].words[0].example_en, 'I like sport.')
assert.equal(result.units[0].words[1].ipa, '/dʒʌmp/')
assert.equal(result.units.slice(1).flatMap(u => u.words).length, 0)
assert.equal(groupVocabLibrary(rows.filter(r => r.topic === '外研教材')).units[0].words.length, 0)
const manifest = {
  101: { word: 'sport', example_en: 'I like sport.', wordAudio: 'https://example.test/sport.mp3', exampleAudio: 'https://example.test/sport-example.mp3' },
  102: { word: 'wrong', example_en: 'wrong', wordAudio: 'https://example.test/wrong.mp3', exampleAudio: 'https://example.test/wrong-example.mp3' }
}
const prepared = groupVocabLibrary(rows, manifest).units[0].words
assert.equal(prepared[0].word_audio_url, manifest[101].wordAudio)
assert.equal(prepared[0].example_audio_url, manifest[101].exampleAudio)
assert.equal(prepared[1].word_audio_url, '')
assert.equal(prepared[1].example_audio_url, '')
const stale = groupVocabLibrary([{ ...rows[0], example_en: 'A changed example.' }], manifest).units[0].words[0]
assert.equal(stale.word_audio_url, manifest[101].wordAudio)
assert.equal(stale.example_audio_url, '')
console.log('vocabulary library scope, ordering, pronunciation and prepared audio matching passed')
