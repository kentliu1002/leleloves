import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'
import * as progress from '../lib/daily-vocab.mjs'
import * as points from '../lib/vocab-points.mjs'

const require = createRequire(import.meta.url)
const date = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10)
const reviews = [1, 2, 3, 4, 5].map(id => ({ id, word: `old${id}`, topic: '2026秋课本' }))
const newWords = [11, 12, 13, 14, 15].map(id => ({ id, word: `new${id}`, topic: '2026秋课本' }))
const session = () => ({ date, review_word_ids: reviews.map(w => w.id), new_word_ids: newWords.map(w => w.id), completed_at: null })
const rows = { vocab_daily: [], vocab_attempts: [], vocabulary: [...reviews, ...newWords], points_log: [], homework: [{ id: 1, created_at: `${date}T09:00:00+08:00`, is_completed: true }] }
const db = {
  from(table) {
    let filters = [], operation = 'select', payload
    const result = () => {
      const matches = row => filters.every(test => test(row))
      if (operation === 'insert') rows[table].push({ id: rows[table].length + 1, ...payload })
      if (operation === 'update') rows[table].filter(matches).forEach(row => Object.assign(row, payload))
      return { data: rows[table].filter(matches), error: null }
    }
    const query = {
      select() { return query },
      eq(key, value) { filters.push(row => row[key] === value); return query },
      in(key, values) { filters.push(row => values.includes(row[key])); return query },
      limit() { return query },
      gte(key, value) { filters.push(row => row[key] >= value); return query },
      lt(key, value) { filters.push(row => row[key] < value); return query },
      insert(value) { operation = 'insert'; payload = value; return query },
      update(value) { operation = 'update'; payload = value; return query },
      async single() { const r = result(); return { ...r, data: r.data[0] || null } },
      async maybeSingle() { return query.single() },
      then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject) }
    }
    return query
  }
}
function loadRoute(name) {
  const source = readFileSync(new URL(`../app/api/${name.startsWith('homework/') ? name : `vocab/${name}`}/route.ts`, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } })
  const module = { exports: {} }
  const dependencies = id => {
    if (id === '@supabase/supabase-js') return { createClient: () => db }
    if (id === '@vercel/functions') return { waitUntil() {} }
    if (id.endsWith('/daily-vocab.mjs')) return progress
    if (id.endsWith('/vocab-points.mjs')) return points
    if (id.endsWith('/semester-vocab.json')) return { default: { topic: '2026秋课本' } }
    if (id.endsWith('/semester-vocab.mjs')) return { getSemesterGroup: async (_, day, daily) => {
      assert.equal(day, date)
      assert.equal(daily, true)
      return { newWords, reviewWords: reviews }
    } }
    return require(id)
  }
  new Function('require', 'module', 'exports', outputText)(dependencies, module, module.exports)
  return module.exports
}
const { GET } = loadRoute('today')
const { POST } = loadRoute('complete')
const { POST: extraPost } = loadRoute('extra')
const { POST: homeworkPost } = loadRoute('homework/complete')
let response = await GET()
assert.equal(response.status, 200)
let body = await response.json()
assert.equal(body.reviewWords.length, 5)
assert.equal(body.reviewPassed, false)
assert.deepEqual(body.newWords, [])
assert.equal(rows.vocab_daily.length, 1)
assert.equal((await POST()).status, 403)
assert.equal(rows.points_log.length, 0)
assert.equal(rows.vocab_daily[0].completed_at, null)
rows.vocab_attempts = reviews.slice(0, 4).map(w => ({ date, word_id: w.id, kind: 'review', correct: true }))
assert.equal((await (await GET()).json()).reviewPassed, false)
rows.vocab_attempts.push({ date, word_id: 5, kind: 'review', correct: true })
body = await (await GET()).json()
assert.equal(body.reviewPassed, true)
assert.deepEqual(body.newWords, newWords)
assert.equal(rows.vocab_daily.length, 1)
assert.equal((await POST()).status, 403)
rows.vocab_attempts.push(...newWords.map(w => ({ date, word_id: w.id, kind: 'new', correct: true })))
rows.homework[0].is_completed = false
assert.equal((await POST()).status, 200)
assert.equal(rows.points_log.length, 1)
assert.equal(rows.points_log[0].points, 0)
assert.equal((await extraPost()).status, 200)
assert.deepEqual(rows.points_log.map(r => r.points), [0, 0])
assert.equal((await POST()).status, 200)
assert.equal(rows.points_log.length, 2)
const completion = await homeworkPost(new Request('https://example.test/api/homework/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 1 }) }))
assert.equal(completion.status, 200)
assert.deepEqual(rows.points_log.map(r => r.points), [1, 1])
assert.equal((await POST()).status, 200)
assert.deepEqual(rows.points_log.map(r => r.points), [1, 1])
assert.equal((await (await GET()).json()).completedToday, true)
// Old, unfinished ten-new-word sessions adopt the new quotas once.
rows.vocab_daily = [{ ...session(), new_word_ids: Array.from({ length: 10 }, (_, i) => i + 11), review_word_ids: [] }]
rows.vocab_attempts = []
body = await (await GET()).json()
assert.equal(body.reviewWords.length, 5)
assert.equal(body.newWords.length, 0)
assert.equal(rows.vocab_daily[0].new_word_ids.length, 5)
// Cached, unfinished sessions must also stop serving words from another textbook.
rows.vocabulary.push({ id: 100, word: 'legacy', topic: '外研教材' })
rows.vocab_daily = [{ ...session(), review_word_ids: [100, 2, 3, 4, 5] }]
body = await (await GET()).json()
assert.ok(body.reviewWords.every(w => w.topic === '2026秋课本'))
assert.deepEqual(rows.vocab_daily[0].review_word_ids, [1, 2, 3, 4, 5])
// Completed sessions are not reset by the change.
rows.vocab_daily[0].completed_at = 'already completed'
assert.equal((await (await GET()).json()).completedToday, true)
console.log('daily vocabulary API lock, reload, migration and completion tests passed')
