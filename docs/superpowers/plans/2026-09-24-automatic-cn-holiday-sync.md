# Automatic China Holiday Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically import official Chinese holiday and transferred-workday schedules while preserving all later manual adjustments.

**Architecture:** A pure parser validates yearly `holiday-cn` JSON against its `gov.cn` source and converts daily entries into holiday ranges and workday records. A database-backed sync service upserts government records, API readers merge them with manual overrides, and a protected daily Vercel Cron syncs the current and next year.

**Tech Stack:** Next.js 14 App Router, TypeScript/JavaScript, Supabase Postgres, Vercel Cron, Node `assert`

---

### Task 1: Add calendar provenance schema

**Files:**
- Create: `supabase/migrations/202609240001_calendar_sync.sql`
- Create: `scripts/test-calendar-migration.mjs`

- [ ] **Step 1: Write the failing migration contract test**

Create a test that reads the SQL and asserts both tables receive `source`, `source_key`, `source_year`, `source_url`, `is_disabled`, and `synced_at`, plus the `calendar_sync_state` table and partial unique indexes.

```js
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
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node scripts/test-calendar-migration.mjs`

Expected: FAIL with `ENOENT` because the migration does not exist.

- [ ] **Step 3: Write the migration**

Create idempotent SQL that adds the six provenance columns to both existing tables, creates one partial unique index per table on `source_key` where `source = 'government'`, and creates `calendar_sync_state` with this shape:

```sql
create table if not exists public.calendar_sync_state (
  id text primary key,
  last_success_at timestamptz,
  synced_years integer[] not null default '{}',
  source_urls text[] not null default '{}',
  last_error text,
  updated_at timestamptz not null default now()
);
```

Existing records receive `source = 'manual'`; automatic records use `government`.

- [ ] **Step 4: Run the contract test**

Run: `node scripts/test-calendar-migration.mjs`

Expected: `calendar migration contract passed`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/202609240001_calendar_sync.sql scripts/test-calendar-migration.mjs
git commit -m "feat: add calendar synchronization schema"
```

### Task 2: Validate and transform annual government data

**Files:**
- Create: `lib/china-calendar-sync.mjs`
- Create: `scripts/test-china-calendar-sync.mjs`

- [ ] **Step 1: Write failing parser tests**

Use a fixture with three consecutive 中秋节 off-days, one 国庆节 transferred workday, and a `gov.cn` paper. Assert the parser returns one holiday range and one workday. Add rejection cases for a non-government paper and a date outside the target year.

```js
const parsed = parseGovernmentCalendar(fixture)
assert.deepEqual(parsed.holidays, [{
  sourceKey: 'government:2026:holiday:中秋节',
  name: '中秋节', startDate: '2026-09-25', endDate: '2026-09-27'
}])
assert.deepEqual(parsed.workdays, [{
  sourceKey: 'government:2026:workday:2026-10-10',
  date: '2026-10-10', note: '国庆节调休'
}])
assert.throws(() => parseGovernmentCalendar(nonGovernment), /gov.cn/)
assert.throws(() => parseGovernmentCalendar(wrongYear), /目标年份/)
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node scripts/test-china-calendar-sync.mjs`

Expected: FAIL because `lib/china-calendar-sync.mjs` does not exist.

- [ ] **Step 3: Implement the pure parser**

Export `parseGovernmentCalendar(payload)` and `calendarUrl(year)`. Validate the schema and government paper host, sort dates, group adjacent off-days only when their names match, and map workdays individually. Use UTC date arithmetic to avoid timezone shifts.

- [ ] **Step 4: Run parser tests**

Run: `node scripts/test-china-calendar-sync.mjs`

Expected: all parser assertions pass.

- [ ] **Step 5: Commit**

```bash
git add lib/china-calendar-sync.mjs scripts/test-china-calendar-sync.mjs
git commit -m "feat: parse official China holiday schedules"
```

### Task 3: Implement idempotent synchronization and manual precedence

**Files:**
- Modify: `lib/china-calendar-sync.mjs`
- Modify: `scripts/test-china-calendar-sync.mjs`

- [ ] **Step 1: Write failing synchronization tests**

Add an in-memory repository and run `syncGovernmentCalendar` twice. Assert only one row per `sourceKey`, disabled automatic rows stay disabled, manual overlapping holidays suppress automatic rows in `mergeCalendarRows`, and fetch failure performs no writes.

```js
await syncGovernmentCalendar({ years: [2026], fetchYear, repository })
await syncGovernmentCalendar({ years: [2026], fetchYear, repository })
assert.equal(repository.holidays.filter(row => row.source === 'government').length, 1)
assert.equal(repository.holidays.find(row => row.sourceKey.includes('中秋节')).isDisabled, true)
assert.deepEqual(mergeCalendarRows([manualHoliday, automaticHoliday]), [manualHoliday])
await assert.rejects(() => syncGovernmentCalendar({ years: [2027], fetchYear: failingFetch, repository }))
assert.equal(repository.writeCount, previousWriteCount)
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node scripts/test-china-calendar-sync.mjs`

Expected: FAIL because the synchronization and merge exports do not exist.

- [ ] **Step 3: Implement synchronization**

Export:

```js
syncGovernmentCalendar({ years, fetchYear, repository })
mergeCalendarRows(rows, kind)
createSupabaseCalendarRepository(supabase)
```

The repository upserts automatic rows on `source_key`, never changes `is_disabled` during upsert, skips automatic dates covered by manual rows, removes stale automatic rows only after all upserts for that year succeed, and updates `calendar_sync_state`. Treat next-year HTTP 404 as unpublished; all other invalid data remains an error.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `node scripts/test-china-calendar-sync.mjs`

Expected: all parser, idempotency, precedence, disabled-row, and failure-preservation tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/china-calendar-sync.mjs scripts/test-china-calendar-sync.mjs
git commit -m "feat: synchronize government calendar safely"
```

### Task 4: Apply precedence in holiday and workday APIs

**Files:**
- Modify: `app/api/holidays/route.ts`
- Modify: `app/api/holidays/[id]/route.ts`
- Modify: `app/api/workdays/route.ts`
- Modify: `app/api/workdays/[id]/route.ts`
- Modify: `scripts/test-china-calendar-sync.mjs`

- [ ] **Step 1: Add failing delete-policy tests**

Add a pure `deletePolicy(row)` export and assert manual records use `delete`, while government records use `disable`.

```js
assert.equal(deletePolicy({ source: 'manual' }), 'delete')
assert.equal(deletePolicy({ source: 'government' }), 'disable')
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node scripts/test-china-calendar-sync.mjs`

Expected: FAIL because `deletePolicy` does not exist.

- [ ] **Step 3: Update APIs**

GET routes select provenance fields, remove disabled rows, and call `mergeCalendarRows`. POST routes explicitly write `source: 'manual'`. DELETE routes fetch the target row first, physically delete manual rows, and set `is_disabled: true` for government rows.

- [ ] **Step 4: Run tests and build**

Run:

```bash
node scripts/test-china-calendar-sync.mjs
npm run build
```

Expected: tests pass and Next.js completes the production build.

- [ ] **Step 5: Commit**

```bash
git add app/api/holidays app/api/workdays lib/china-calendar-sync.mjs scripts/test-china-calendar-sync.mjs
git commit -m "feat: preserve manual calendar overrides"
```

### Task 5: Add protected daily synchronization

**Files:**
- Create: `app/api/calendar-sync/route.ts`
- Modify: `vercel.json`
- Modify: `scripts/test-china-calendar-sync.mjs`

- [ ] **Step 1: Add a failing year-selection test**

```js
assert.deepEqual(syncYears(new Date('2026-09-24T12:00:00+08:00')), [2026, 2027])
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node scripts/test-china-calendar-sync.mjs`

Expected: FAIL because `syncYears` does not exist.

- [ ] **Step 3: Implement route and cron**

GET reads `calendar_sync_state`. POST checks `Authorization: Bearer ${CRON_SECRET}`, constructs the Supabase repository, and calls the sync service for `syncYears(new Date())`. Add this Vercel schedule:

```json
{
  "path": "/api/calendar-sync",
  "schedule": "30 18 * * *"
}
```

- [ ] **Step 4: Verify tests, JSON, and build**

Run:

```bash
node scripts/test-china-calendar-sync.mjs
python3 -m json.tool vercel.json >/dev/null
npm run build
```

Expected: tests pass, JSON is valid, and build succeeds.

- [ ] **Step 5: Commit**

```bash
git add app/api/calendar-sync/route.ts vercel.json lib/china-calendar-sync.mjs scripts/test-china-calendar-sync.mjs
git commit -m "feat: schedule daily holiday synchronization"
```

### Task 6: Show provenance and synchronization status

**Files:**
- Modify: `app/parent/page.tsx`

- [ ] **Step 1: Extend page types and loading**

Add `source` to `Holiday` and `WorkdayOverride`, add `CalendarSyncState`, and fetch `/api/calendar-sync` when the holiday tab opens.

- [ ] **Step 2: Render status and badges**

Render the last successful sync time and synchronized years above the forms. Each row displays either `政府同步` or `手工设置`; errors say existing data remains active.

- [ ] **Step 3: Run production build**

Run: `npm run build`

Expected: build succeeds with the updated page.

- [ ] **Step 4: Commit**

```bash
git add app/parent/page.tsx
git commit -m "feat: show calendar synchronization status"
```

### Task 7: Migrate, backfill, deploy, and verify production

**Files:**
- No new source files

- [ ] **Step 1: Apply the database migration**

Run the migration against `POSTGRES_URL_NON_POOLING` with Supabase CLI, then query the REST API to confirm existing 中秋、端午和调休 rows have `source = 'manual'`.

- [ ] **Step 2: Run the full local verification suite**

```bash
node scripts/test-calendar-migration.mjs
node scripts/test-china-calendar-sync.mjs
node scripts/test-workday-windows.mjs
npm run build
git diff --check
```

Expected: every command exits 0.

- [ ] **Step 3: Push and wait for production deployment**

Push `main`, wait until Vercel reports `Ready`, and confirm `/api/calendar-sync` without authorization returns only status for GET and 401 for POST.

- [ ] **Step 4: Perform the initial 2026/2027 synchronization**

Run the same sync service locally against production Supabase credentials. Confirm 2026 imports all seven official holiday ranges and six transferred workdays, while the existing manual 中秋 and `2026-09-20` records remain the visible winners.

- [ ] **Step 5: Verify live consumers**

Check:

```text
/api/holidays       -> no duplicate 中秋; includes 2026-10-01 through 2026-10-07
/api/workdays       -> includes 2026-10-10; manual 2026-09-20 remains
/api/calendar-sync  -> last_success_at populated; synced_years includes 2026
/api/points         -> 200
/api/homework       -> 200
```

Open `/parent`, verify provenance badges and sync status, then confirm the WeChat mini-program history still receives array responses.

- [ ] **Step 6: Final commit if production verification required no corrections**

Confirm `git status --short` is empty and record the deployed commit hash in the completion report.
