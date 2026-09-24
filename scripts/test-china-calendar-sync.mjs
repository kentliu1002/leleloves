import assert from 'node:assert/strict'
import { calendarUrl, parseGovernmentCalendar } from '../lib/china-calendar-sync.mjs'

const fixture = {
  year: 2026,
  papers: ['https://www.gov.cn/zhengce/content_123.htm'],
  days: [
    { name: '中秋节', date: '2026-09-27', isOffDay: true },
    { name: '中秋节', date: '2026-09-25', isOffDay: true },
    { name: '中秋节', date: '2026-09-26', isOffDay: true },
    { name: '国庆节', date: '2026-10-10', isOffDay: false }
  ]
}

assert.equal(calendarUrl(2026), 'https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/2026.json')
const parsed = parseGovernmentCalendar(fixture)
assert.deepEqual(parsed.holidays, [{
  sourceKey: 'government:2026:holiday:中秋节',
  name: '中秋节',
  startDate: '2026-09-25',
  endDate: '2026-09-27'
}])
assert.deepEqual(parsed.workdays, [{
  sourceKey: 'government:2026:workday:2026-10-10',
  date: '2026-10-10',
  note: '国庆节调休'
}])
assert.deepEqual(parsed.sourceUrls, fixture.papers)

assert.throws(() => parseGovernmentCalendar({
  ...fixture,
  papers: ['https://example.com/holiday-notice']
}), /gov.cn/)

assert.throws(() => parseGovernmentCalendar({
  ...fixture,
  days: [...fixture.days, { name: '元旦', date: '2027-01-01', isOffDay: true }]
}), /目标年份/)

assert.throws(() => parseGovernmentCalendar({ ...fixture, days: [] }), /日期数据/)

console.log('China calendar parser tests passed')
