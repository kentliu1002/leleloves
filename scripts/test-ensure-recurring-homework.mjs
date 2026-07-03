import assert from 'node:assert/strict'
import { ensureTodayRecurringHomework } from '../lib/recurring-homework.js'

function makeFakeClient({ templates, existingCounts = new Map() }) {
  const inserts = []

  function table(name) {
    const query = {
      select() { return this },
      eq(column, value) {
        this.filters = { ...(this.filters || {}), [column]: value }
        return this
      },
      lte(column, value) {
        this.lteFilter = { column, value }
        return this
      },
      gte(column, value) {
        this.gteFilter = { column, value }
        if (name === 'recurring_homework') {
          return Promise.resolve({
            data: templates.filter(t =>
              t.enabled === this.filters?.enabled &&
              t.start_date <= this.lteFilter.value &&
              t.end_date >= value
            )
          })
        }
        return this
      },
      then(resolve) {
        if (name === 'homework') {
          const count = existingCounts.get(this.filters?.recurring_id) || 0
          resolve({ count })
        }
      },
      insert(row) {
        inserts.push(row)
        return Promise.resolve({ error: null })
      }
    }
    return query
  }

  return {
    inserts,
    from: table
  }
}

const fridayNoonUtc = new Date('2026-07-03T04:00:00.000Z')
const templates = [
  {
    id: 4,
    enabled: true,
    subject: '数学',
    weekdays: [1, 2, 3, 4, 5],
    note: '小猿练习机每天完成3关',
    submit_type: 'photo',
    start_date: '2026-06-30',
    end_date: '2026-08-30'
  },
  {
    id: 5,
    enabled: true,
    subject: '英语',
    weekdays: [1, 2, 3, 4, 5],
    note: '小猿练习机每天完成3关',
    submit_type: 'photo',
    start_date: '2026-06-30',
    end_date: '2026-08-30'
  }
]

{
  const fake = makeFakeClient({ templates })
  await ensureTodayRecurringHomework(fake, fridayNoonUtc)
  assert.deepEqual(fake.inserts.map(r => r.subject), ['数学', '英语'])
  assert.equal(fake.inserts[0].content, '数学：小猿练习机每天完成3关')
  assert.equal(fake.inserts[0].recurring_id, 4)
}

{
  const fake = makeFakeClient({
    templates,
    existingCounts: new Map([[4, 1], [5, 1]])
  })
  await ensureTodayRecurringHomework(fake, fridayNoonUtc)
  assert.equal(fake.inserts.length, 0)
}

console.log('ensureTodayRecurringHomework tests passed')
