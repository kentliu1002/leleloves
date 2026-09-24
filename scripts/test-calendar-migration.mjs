import assert from 'node:assert/strict'
import fs from 'node:fs'

const sql = fs.readFileSync('supabase/migrations/202609240001_calendar_sync.sql', 'utf8')

for (const table of ['holidays', 'workday_overrides']) {
  assert.match(sql, new RegExp(`alter table public\\.${table}`))
}
for (const column of ['source', 'source_key', 'source_year', 'source_url', 'is_disabled', 'synced_at']) {
  assert.match(sql, new RegExp(column))
}
assert.match(sql, /create table if not exists public\.calendar_sync_state/)
assert.match(sql, /where source = 'government'/)
console.log('calendar migration contract passed')
