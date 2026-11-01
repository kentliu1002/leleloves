import assert from 'node:assert/strict'
import { releaseVocabPoints } from '../lib/vocab-points.mjs'

function mockDb(homework, logs) {
  return { from(table) {
    let tests = [], changes
    const query = {
      select() { return query },
      eq(k,v) { tests.push(r => r[k] === v); return query },
      in(k,v) { tests.push(r => v.includes(r[k])); return query },
      gte(k,v) { tests.push(r => r[k] >= v); return query },
      lt(k,v) { tests.push(r => r[k] < v); return query },
      update(v) { changes = v; return query },
      then(resolve,reject) {
        const data = (table === 'homework' ? homework : logs).filter(r => tests.every(f => f(r)))
        if (changes) data.forEach(r => Object.assign(r, changes))
        return Promise.resolve({ data, error: null }).then(resolve,reject)
      }
    }
    return query
  } }
}
const date = '2026-11-01'
const rows = [
  { id: 1, date, source: 'vocab_bonus', points: 0 },
  { id: 2, date, source: 'vocab_extra', points: 0 },
  { id: 3, date, source: 'manual', points: 0 },
  { id: 4, date: '2026-10-31', source: 'vocab_bonus', points: 0 }
]
const hw = [{ id: 1, created_at: '2026-11-01T09:00:00+08:00', is_completed: true }, { id: 2, created_at: '2026-11-01T10:00:00+08:00', is_completed: false }]
const db = mockDb(hw, rows)
assert.equal(await releaseVocabPoints(db, date), false)
assert.deepEqual(rows.map(r => r.points), [0,0,0,0])
hw[1].is_completed = true
assert.equal(await releaseVocabPoints(db, date), true)
assert.deepEqual(rows.map(r => r.points), [1,1,0,0])
await releaseVocabPoints(db, date)
assert.deepEqual(rows.map(r => r.points), [1,1,0,0])
assert.equal(await releaseVocabPoints(mockDb([], []), date), false)
console.log('vocabulary points depend on same-day homework; release is idempotent')
