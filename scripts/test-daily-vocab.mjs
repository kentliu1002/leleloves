import assert from 'node:assert/strict'
import { availableSemesterWords, selectSemesterWords } from '../lib/semester-vocab.mjs'

const date = '2026-10-30'
const terms = availableSemesterWords(date).slice(0, 20).map((w, i) => ({ id: i + 1, word: w.word, topic: '2026秋课本' }))
const learned = terms.slice(0, 10).map(w => ({ word_id: w.id, correct: true, date: '2026-10-29' }))
const daily = selectSemesterWords(terms, learned, date, 10, () => 0, true)
assert.equal(daily.newWords.length, 5)
assert.equal(daily.reviewWords.length, 5)
assert.ok(daily.newWords.every(w => w.id > 10))
assert.ok(daily.reviewWords.every(w => w.id <= 10))
assert.equal(new Set([...daily.newWords, ...daily.reviewWords].map(w => w.id)).size, 10)
const anotherDraw = selectSemesterWords(terms, learned, date, 10, () => 0.9, true)
assert.notDeepEqual(daily.reviewWords.map(w => w.id), anotherDraw.reviewWords.map(w => w.id))
// A shortage in either category must not increase the other category's quota.
const shortage = selectSemesterWords(terms.slice(0, 12), learned, date, 10, () => 0, true)
assert.equal(shortage.newWords.length, 2)
assert.equal(shortage.reviewWords.length, 5)
const noHistory = selectSemesterWords(terms, [], date, 10, () => 0, true)
assert.equal(noHistory.newWords.length, 5)
assert.equal(noHistory.reviewWords.length, 0)
// Extra groups retain their existing ten-word selection.
assert.equal(selectSemesterWords(terms, [], date).newWords.length, 10)

// Neither daily tasks nor extra groups may fill review slots from other textbooks.
const mixed = [...terms, { id: 100, word: 'legacy', topic: '外研教材' }]
for (const isDaily of [false, true]) {
  const scoped = selectSemesterWords(mixed, [], date, 20, () => 0, isDaily)
  assert.equal(scoped.reviewWords.length, 0)
  assert.ok([...scoped.newWords, ...scoped.reviewWords].every(w => w.topic === '2026秋课本'))
}

const { dailyVocabProgress } = await import('../lib/daily-vocab.mjs')
const session = { date, review_word_ids: [1, 2, 3, 4, 5], new_word_ids: [11, 12, 13, 14, 15] }
const attempt = (word_id, kind = 'review', correct = true, day = date) => ({ date: day, word_id, kind, correct })
const reviews = session.review_word_ids.map(id => attempt(id))
assert.deepEqual(dailyVocabProgress(session, []), { reviewPassed: false, newPassed: false })
assert.equal(dailyVocabProgress(session, [...reviews.slice(0, 4), attempt(5, 'review', false)]).reviewPassed, false)
assert.equal(dailyVocabProgress(session, [...reviews.slice(0, 4), attempt(5, 'new')]).reviewPassed, false)
assert.equal(dailyVocabProgress(session, [...reviews.slice(0, 4), attempt(5, 'review', true, '2026-10-29')]).reviewPassed, false)
assert.equal(dailyVocabProgress(session, Array(5).fill(attempt(1))).reviewPassed, false)
assert.deepEqual(dailyVocabProgress(session, reviews), { reviewPassed: true, newPassed: false })
assert.deepEqual(dailyVocabProgress(session, [...reviews, ...session.new_word_ids.map(id => attempt(id, 'new'))]), { reviewPassed: true, newPassed: true })
assert.deepEqual(dailyVocabProgress({ date, review_word_ids: [], new_word_ids: [] }, []), { reviewPassed: true, newPassed: true })
console.log('daily vocabulary quotas and unlock tests passed')

const { historicalVocabStatus } = await import('../lib/daily-vocab.mjs')
const history = [{ date: '2026-11-02', completed: true }, { date: '2026-11-01', completed: false }]
assert.equal(historicalVocabStatus(history, '2026-11-02'), true)
assert.equal(historicalVocabStatus(history, '2026-11-01'), false)
assert.equal(historicalVocabStatus(history, '2026-10-31'), false)
assert.equal(historicalVocabStatus(null, '2026-11-02'), null)
console.log('historical vocabulary completion tests passed')

const { vocabularyStreak } = await import('../lib/daily-vocab.mjs')
const completed = ['2026-11-03', '2026-11-02', '2026-11-01', '2026-10-30']
assert.equal(vocabularyStreak(completed, '2026-11-03', true), 3)
assert.equal(vocabularyStreak(completed.slice(1), '2026-11-03', true), 2)
assert.equal(vocabularyStreak(completed.slice(1), '2026-11-03', false), 0)
assert.equal(vocabularyStreak(completed, '2026-10-31', false), 0)
assert.equal(vocabularyStreak(['2027-01-01', '2026-12-31'], '2027-01-01', true), 2)
assert.equal(vocabularyStreak([], '2026-11-03', true), 0)
const longRun = Array.from({ length: 35 }, (_, i) => new Date(Date.UTC(2026, 10, 3 - i)).toISOString().slice(0, 10))
assert.equal(vocabularyStreak(longRun, '2026-11-03', true), 35)
console.log('vocabulary streak tests passed')
