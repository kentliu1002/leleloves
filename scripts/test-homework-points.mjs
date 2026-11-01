import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
function load(path, names) {
  const source = fs.readFileSync(path, 'utf8')
  const code = ts.transpile(source + `\n;globalThis.testFunctions = {${names.join(',')}}`, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 })
  const context = { exports: {}, require: () => ({ createClient: () => ({}) }), process: { env: {} } }
  vm.runInNewContext(code, context)
  return context.testFunctions
}
const { calcNormal, calcNonNormal, getNonNormalWindow } = load('app/api/cron/score/route.ts', ['calcNormal','calcNonNormal','getNonNormalWindow'])
const time = s => new Date(`${s}+08:00`)
for (const [t, expected] of [['21:00:00',5], ['21:00:01',3], ['21:30:00',3], ['21:30:01',1], ['22:00:00',1], ['22:00:01',0]])
  assert.equal(calcNormal(time(`2026-11-02T${t}`),'2026-11-02').points, expected)
const weekend = getNonNormalWindow('2026-11-08', [], [])
for (const [t, expected] of [['2026-11-07T18:00:00',10], ['2026-11-07T18:00:01',8], ['2026-11-08T12:00:00',8], ['2026-11-08T12:00:01',6], ['2026-11-08T18:00:00',6], ['2026-11-08T18:00:01',0]])
  assert.equal(calcNonNormal(time(t), weekend.windowEnd, weekend.restDays, weekend.isOrdinaryWeekend).points, expected)
assert.equal(calcNonNormal(time('2026-11-07T17:00:00'), '2026-11-08', 2, false).points, 30)
assert.equal(calcNonNormal(time('2026-11-08T15:00:00'), '2026-11-08', 1, false).points, 20)
const { isOrdinaryWeekend } = load('app/api/points/route.ts', ['isOrdinaryWeekend'])
assert.equal(isOrdinaryWeekend({windowStart:'2026-11-06',windowEnd:'2026-11-08'},2,[]),true)
assert.equal(isOrdinaryWeekend({windowStart:'2026-11-06',windowEnd:'2026-11-08'},2,[{start_date:'2026-11-07',end_date:'2026-11-08'}]),false)
assert.equal(isOrdinaryWeekend({windowStart:'2026-11-07',windowEnd:'2026-11-08'},1,[]),false)
assert.equal(isOrdinaryWeekend(null,null,[]),false)
console.log('homework scoring boundaries and holiday isolation passed')
