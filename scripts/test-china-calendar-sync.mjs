import assert from 'node:assert/strict'
import {
  calendarUrl,
  deletePolicy,
  fetchGovernmentYear,
  mergeCalendarRows,
  parseGovernmentCalendar,
  syncGovernmentCalendar,
  syncYears
} from '../lib/china-calendar-sync.mjs'

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

function createRepository() {
  return {
    holidays: [{
      id: 'disabled-mid-autumn', source: 'government', source_key: 'government:2026:holiday:中秋节',
      source_year: 2026, name: '中秋节', start_date: '2026-09-25', end_date: '2026-09-27', is_disabled: true
    }],
    workdays: [],
    writes: 0,
    async readYear(year) {
      return {
        holidays: this.holidays.filter(row => row.source_year === year || row.start_date?.startsWith(`${year}-`)),
        workdays: this.workdays.filter(row => row.source_year === year || row.date?.startsWith(`${year}-`))
      }
    },
    async saveHoliday(row) {
      this.writes++
      const existing = this.holidays.find(item => item.source_key === row.source_key)
      if (existing) Object.assign(existing, row, { is_disabled: existing.is_disabled })
      else this.holidays.push({ ...row, id: `h-${this.holidays.length + 1}`, is_disabled: false })
    },
    async saveWorkday(row) {
      this.writes++
      const existing = this.workdays.find(item => item.source_key === row.source_key)
      if (existing) Object.assign(existing, row, { is_disabled: existing.is_disabled })
      else this.workdays.push({ ...row, id: `w-${this.workdays.length + 1}`, is_disabled: false })
    },
    async removeStale(year, holidayKeys, workdayKeys) {
      this.holidays = this.holidays.filter(row => row.source !== 'government' || row.source_year !== year || row.is_disabled || holidayKeys.includes(row.source_key))
      this.workdays = this.workdays.filter(row => row.source !== 'government' || row.source_year !== year || row.is_disabled || workdayKeys.includes(row.source_key))
    },
    async markSuccess() {},
    async markError() {}
  }
}

const repository = createRepository()
const fetchYear = async () => parseGovernmentCalendar(fixture)
await syncGovernmentCalendar({ years: [2026], fetchYear, repository })
await syncGovernmentCalendar({ years: [2026], fetchYear, repository })
assert.equal(repository.holidays.filter(row => row.source === 'government').length, 1)
assert.equal(repository.holidays[0].is_disabled, true)
assert.equal(repository.workdays.filter(row => row.source === 'government').length, 1)

const manualHoliday = { id: 'manual', source: 'manual', start_date: '2026-09-26', end_date: '2026-09-28', is_disabled: false }
const automaticHoliday = { id: 'automatic', source: 'government', start_date: '2026-09-25', end_date: '2026-09-27', is_disabled: false }
assert.deepEqual(mergeCalendarRows([automaticHoliday, manualHoliday], 'holiday'), [manualHoliday])
const manualWorkday = { id: 'manual-w', source: 'manual', date: '2026-10-10', is_disabled: false }
const automaticWorkday = { id: 'automatic-w', source: 'government', date: '2026-10-10', is_disabled: false }
assert.deepEqual(mergeCalendarRows([automaticWorkday, manualWorkday], 'workday'), [manualWorkday])

const failedRepository = createRepository()
const beforeFailure = JSON.stringify(failedRepository.holidays)
await assert.rejects(() => syncGovernmentCalendar({
  years: [2026],
  fetchYear: async () => { throw new Error('network down') },
  repository: failedRepository
}), /network down/)
assert.equal(JSON.stringify(failedRepository.holidays), beforeFailure)
assert.equal(failedRepository.writes, 0)

assert.equal(deletePolicy({ source: 'manual' }), 'delete')
assert.equal(deletePolicy({ source: 'government' }), 'disable')
assert.deepEqual(syncYears(new Date('2026-09-24T04:00:00Z')), [2026, 2027])
assert.equal(await fetchGovernmentYear(2027, async () => ({
  status: 200,
  ok: true,
  json: async () => ({ year: 2027, papers: [], days: [] })
})), null)

console.log('China calendar synchronization tests passed')
