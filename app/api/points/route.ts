import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  try {
    const [
      { data: logs, error },
      { data: workdayRows }
    ] = await Promise.all([
      supabase
        .from('points_log')
        .select('points, date, reason, source, day_type, created_at')
        .order('created_at', { ascending: false }),
      supabase
        .from('workday_overrides')
        .select('date')
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

    // 今天是否是调休工作日
    const bjToday = new Date(Date.now() + 8 * 3600_000)
    const todayStr = bjToday.toISOString().slice(0, 10)
    const workdays = (workdayRows || []).map((r: { date: string }) => r.date)
    const todayIsWorkday = workdays.includes(todayStr)

    return NextResponse.json({
      total,
      yesterday: {
        date: yesterdayStr,
        points: yesterdayPoints,
        reason: yesterdayReason,
        hasRecord: yesterdayLogs.length > 0,
      },
      todayIsWorkday,
      recentLogs: (logs || []).slice(0, 20), // 最近20条流水
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
