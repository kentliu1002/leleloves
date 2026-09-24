const DATA_ROOT = 'https://raw.githubusercontent.com/NateScarlet/holiday-cn/master'

export function calendarUrl(year) {
  return `${DATA_ROOT}/${year}.json`
}

function nextDate(date) {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + 1)
  return value.toISOString().slice(0, 10)
}

function isGovernmentUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && (url.hostname === 'gov.cn' || url.hostname.endsWith('.gov.cn'))
  } catch {
    return false
  }
}

export function parseGovernmentCalendar(payload) {
  if (!Number.isInteger(payload?.year)) throw new Error('缺少有效年份')
  if (!Array.isArray(payload.papers) || !payload.papers.some(isGovernmentUrl)) {
    throw new Error('节假日数据缺少 gov.cn 官方来源')
  }
  if (!Array.isArray(payload.days) || payload.days.length === 0) {
    throw new Error('节假日日期数据为空')
  }

  const days = payload.days.map(day => {
    if (!day?.name?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(day.date || '') || typeof day.isOffDay !== 'boolean') {
      throw new Error('节假日日期数据格式错误')
    }
    if (!day.date.startsWith(`${payload.year}-`)) throw new Error('节假日日期不属于目标年份')
    return { name: day.name.trim(), date: day.date, isOffDay: day.isOffDay }
  }).sort((a, b) => a.date.localeCompare(b.date))

  const holidays = []
  for (const day of days.filter(item => item.isOffDay)) {
    const previous = holidays.at(-1)
    if (previous && previous.name === day.name && nextDate(previous.endDate) === day.date) {
      previous.endDate = day.date
    } else {
      holidays.push({
        sourceKey: `government:${payload.year}:holiday:${day.name}`,
        name: day.name,
        startDate: day.date,
        endDate: day.date
      })
    }
  }

  const workdays = days.filter(item => !item.isOffDay).map(day => ({
    sourceKey: `government:${payload.year}:workday:${day.date}`,
    date: day.date,
    note: `${day.name}调休`
  }))

  return {
    year: payload.year,
    holidays,
    workdays,
    sourceUrls: payload.papers.filter(isGovernmentUrl)
  }
}

function overlaps(left, right) {
  return left.start_date <= right.end_date && right.start_date <= left.end_date
}

export function mergeCalendarRows(rows, kind) {
  const enabled = rows.filter(row => !row.is_disabled)
  const manual = enabled.filter(row => row.source !== 'government')
  return enabled.filter(row => {
    if (row.source !== 'government') return true
    if (kind === 'workday') return !manual.some(item => item.date === row.date)
    return !manual.some(item => overlaps(item, row))
  })
}

export async function fetchGovernmentYear(year, request = fetch) {
  const response = await request(calendarUrl(year), { signal: AbortSignal.timeout(15000) })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`获取 ${year} 年节假日失败：HTTP ${response.status}`)
  return parseGovernmentCalendar(await response.json())
}

export async function syncGovernmentCalendar({ years, fetchYear = fetchGovernmentYear, repository }) {
  try {
    const calendars = (await Promise.all(years.map(fetchYear))).filter(Boolean)
    const syncedAt = new Date().toISOString()

    for (const calendar of calendars) {
      const existing = await repository.readYear(calendar.year)
      const manualHolidays = existing.holidays.filter(row => row.source !== 'government' && !row.is_disabled)
      const manualWorkdays = existing.workdays.filter(row => row.source !== 'government' && !row.is_disabled)
      const sourceUrl = calendar.sourceUrls[0]
      const holidays = calendar.holidays.filter(item => !manualHolidays.some(row => overlaps(row, {
        start_date: item.startDate,
        end_date: item.endDate
      })))
      const workdays = calendar.workdays.filter(item => !manualWorkdays.some(row => row.date === item.date))

      for (const item of holidays) {
        await repository.saveHoliday({
          source: 'government',
          source_key: item.sourceKey,
          source_year: calendar.year,
          source_url: sourceUrl,
          synced_at: syncedAt,
          name: item.name,
          start_date: item.startDate,
          end_date: item.endDate
        })
      }
      for (const item of workdays) {
        await repository.saveWorkday({
          source: 'government',
          source_key: item.sourceKey,
          source_year: calendar.year,
          source_url: sourceUrl,
          synced_at: syncedAt,
          date: item.date,
          note: item.note
        })
      }
      await repository.removeStale(
        calendar.year,
        holidays.map(item => item.sourceKey),
        workdays.map(item => item.sourceKey)
      )
    }

    await repository.markSuccess({
      syncedAt,
      years: calendars.map(item => item.year),
      sourceUrls: [...new Set(calendars.flatMap(item => item.sourceUrls))]
    })
    return { syncedAt, years: calendars.map(item => item.year) }
  } catch (error) {
    await repository.markError(error instanceof Error ? error.message : String(error))
    throw error
  }
}

export function createSupabaseCalendarRepository(supabase) {
  async function saveBySourceKey(table, row) {
    const { data: existing, error: readError } = await supabase
      .from(table)
      .select('id')
      .eq('source_key', row.source_key)
      .maybeSingle()
    if (readError) throw readError
    const query = existing
      ? supabase.from(table).update(row).eq('id', existing.id)
      : supabase.from(table).insert(row)
    const { error } = await query
    if (error) throw error
  }

  return {
    async readYear(year) {
      const [{ data: holidays, error: holidayError }, { data: workdays, error: workdayError }] = await Promise.all([
        supabase.from('holidays').select('*'),
        supabase.from('workday_overrides').select('*')
      ])
      if (holidayError) throw holidayError
      if (workdayError) throw workdayError
      return {
        holidays: (holidays || []).filter(row => row.source_year === year || (row.start_date <= `${year}-12-31` && row.end_date >= `${year}-01-01`)),
        workdays: (workdays || []).filter(row => row.source_year === year || row.date?.startsWith(`${year}-`))
      }
    },
    saveHoliday(row) {
      return saveBySourceKey('holidays', row)
    },
    saveWorkday(row) {
      return saveBySourceKey('workday_overrides', row)
    },
    async removeStale(year, holidayKeys, workdayKeys) {
      for (const [table, keys] of [['holidays', holidayKeys], ['workday_overrides', workdayKeys]]) {
        const { data, error } = await supabase.from(table).select('id, source_key, is_disabled')
          .eq('source', 'government').eq('source_year', year)
        if (error) throw error
        const staleIds = (data || []).filter(row => !row.is_disabled && !keys.includes(row.source_key)).map(row => row.id)
        if (staleIds.length) {
          const { error: deleteError } = await supabase.from(table).delete().in('id', staleIds)
          if (deleteError) throw deleteError
        }
      }
    },
    async markSuccess({ syncedAt, years, sourceUrls }) {
      const { error } = await supabase.from('calendar_sync_state').upsert({
        id: 'cn-government',
        last_success_at: syncedAt,
        synced_years: years,
        source_urls: sourceUrls,
        last_error: null,
        updated_at: syncedAt
      }, { onConflict: 'id' })
      if (error) throw error
    },
    async markError(message) {
      const { error } = await supabase.from('calendar_sync_state').upsert({
        id: 'cn-government',
        last_error: message,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' })
      if (error) console.error('[calendar-sync] failed to record error:', error.message)
    }
  }
}
