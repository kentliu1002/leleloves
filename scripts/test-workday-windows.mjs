import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
function load(path, names) {
  const source = fs.readFileSync(path, 'utf8')
  const code = ts.transpile(source + `\n;globalThis.testFunctions = {${names.join(',')}}`, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 })
  const context = { exports: {}, require: () => ({ createClient: () => ({}) }), process: { env: {} }, Page: () => {}, getApp: () => ({}) }
  vm.runInNewContext(code, context)
  return context.testFunctions
}
const points = load('app/api/points/route.ts', ['getWindowForDay', 'getWindowRestDays'])
const cron = load('app/api/cron/score/route.ts', ['getNonNormalWindow', 'isNormalSchoolDay'])
const sunday = ['2026-09-20']
assert.equal(points.getWindowForDay('2026-09-20', [], sunday), null)
assert.equal(points.getWindowRestDays('2026-09-20', [], sunday), null)
for (const date of ['2026-09-18', '2026-09-19']) {
 assert.equal(points.getWindowForDay(date, [], sunday).windowEnd, '2026-09-19')
 assert.equal(points.getWindowRestDays(date, [], sunday), 1)
}
assert.equal(points.getWindowForDay('2026-09-20', [], []).windowStart, '2026-09-18')
assert.equal(points.getWindowRestDays('2026-09-20', [], []), 2)
assert.equal(cron.getNonNormalWindow('2026-09-20', [], sunday), null)
assert.equal(cron.isNormalSchoolDay('2026-09-20', [], sunday), true)
const shortened = cron.getNonNormalWindow('2026-09-19', [], sunday)
assert.equal(shortened?.windowStart, '2026-09-18')
assert.equal(shortened?.windowEnd, '2026-09-19')
assert.equal(shortened?.restDays, 1)
assert.equal(cron.getNonNormalWindow('2026-09-20', [], []).restDays, 2)
for (const file of ['../weixin/pages/index/index.js', '../weixin/pages/history/history.js']) {
 if (!fs.existsSync(file)) continue
 const mini = load(file, ['getWindowForDay'])
 const today = mini.getWindowForDay('2026-09-20', [], sunday)
 assert.equal(today.kind, 'day')
 assert.equal(today.windowStart, '2026-09-20')
 for (const date of ['2026-09-18', '2026-09-19']) assert.equal(mini.getWindowForDay(date, [], sunday).windowEnd, '2026-09-19')
}
console.log('school-day override and shortened-weekend tests passed')
