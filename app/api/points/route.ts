import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'   // 禁止静态缓存，每次请求都实时查库

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface Holiday { id: string; name: string; start_date: string; end_date: string }

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00+08:00')
  d.setDate(d.getDate() + days)
  return new Date(d.getTime() + 8 * 3600_000).toISOString().slice(0, 10)
}

function holidayDays(h: Holiday): number {
  return Math.round(
    (new Date(h.end_date + 'T12:00:00+08:00').getTime()
      - new Date(h.start_date + 'T12:00:00+08:00').getTime()) / 86_400_000
  ) + 1
}

/** 返回今天所在积分窗口的实际休息天数（restDays），上学日返回 null */
function getWindowRestDays(
  todayStr: string,
  holidays: Holiday[],
  workdays: string[]
): number | null {
  const wd = new Date(todayStr + 'T12:00:00+08:00').getDay()
  const tomorrowStr = shiftDate(todayStr, 1)
  const ydayStr     = shiftDate(todayStr, -1)

  // 1. 今天在某节假日内
  const inHoliday = holidays.find(h => todayStr >= h.start_date && todayStr <= h.end_date)
  if (inHoliday) return holidayDays(inHoliday)

  // 2. 今天是节假日前一天
  const beforeHoliday = holidays.find(h => h.start_date === tomorrowStr)
  if (beforeHoliday) return holidayDays(beforeHoliday)

  // 3. 今天是周六（非调休上班）
  if (wd === 6 && !workdays.includes(todayStr)) return 2

  // 4. 今天是周日
  if (wd === 0) return workdays.includes(ydayStr) ? 1 : 2

  // 5. 今天是周五（非调休，明天也不是节假日开始）
  if (wd === 5 && !workdays.includes(tomorrowStr)) return 2

  // 正常上学日
  return null
}

export async function GET() {
  try {
    const [
      { data: logs, error },
      { data: workdayRows },
      { data: holidayRows }
    ] = await Promise.all([
      supabase
        .from('points_log')
        .select('points, date, reason, source, day_type, created_at')
        .order('created_at', { ascending: false }),
      supabase.from('workday_overrides').select('date'),
      supabase.from('holidays').select('id, name, start_date, end_date')
    ])

    if (error) throw error

    // 总积分
    const total = (logs || []).reduce((sum, r) => sum + r.points, 0)

    // 昨日北京日期
    const bjYesterday = new Date(Date.now() - 86_400_000 + 8 * 3600_000)
    const yesterdayStr = bjYesterday.toISOString().slice(0, 10)

    const yesterdayLogs = (logs || []).filter(r => r.date === yesterdayStr)
    const yesterdayPoints = yesterdayLogs.reduce((sum, r) => sum + r.points, 0)
    const yesterdayReason = yesterdayLogs.length > 0 ? yesterdayLogs[0].reason : null

    // 今天 / 明天 / 昨天 是否是调休工作日
    const bjNow = Date.now() + 8 * 3600_000
    const todayStr     = new Date(bjNow).toISOString().slice(0, 10)
    const tomorrowStr  = new Date(bjNow + 86_400_000).toISOString().slice(0, 10)
    const ydayStr      = new Date(bjNow - 86_400_000).toISOString().slice(0, 10)
    const workdays = (workdayRows || []).map((r: { date: string }) => r.date)
    const todayIsWorkday      = workdays.includes(todayStr)
    const tomorrowIsWorkday   = workdays.includes(tomorrowStr)
    const yesterdayWasWorkday = workdays.includes(ydayStr)

    const windowRestDays = getWindowRestDays(todayStr, holidayRows || [], workdays)

    return NextResponse.json({
      total,
      yesterday: {
        date: yesterdayStr,
        points: yesterdayPoints,
        reason: yesterdayReason,
        hasRecord: yesterdayLogs.length > 0,
      },
      todayIsWorkday,
      tomorrowIsWorkday,
      yesterdayWasWorkday,
      windowRestDays,
      recentLogs: (logs || []).slice(0, 20), // 最近20条流水
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
