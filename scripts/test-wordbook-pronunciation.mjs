import assert from 'node:assert/strict'
import { wordbookSpeechText } from '../lib/wordbook-pronunciation.mjs'

assert.equal(wordbookSpeechText('because of sb / sth'), 'because of somebody or something')
assert.equal(wordbookSpeechText('SB / STH'), 'somebody or something')
assert.equal(wordbookSpeechText('sport'), 'sport')
assert.equal(wordbookSpeechText('somebody'), 'somebody')
console.log('Wordbook pronunciation text tests passed')
