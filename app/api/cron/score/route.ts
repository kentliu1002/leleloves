import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface Holiday { id: string; name: string; start_date: string; end_date: string }
interface WorkdayOverride { id: string; date: string; note: string | null }

// ── 日期工具（全部使用北京时间字符串 YYYY-MM-DD）──────────────────────────

/** 把 UTC Date 转成北京日期字符串 */
function toBJDateStr(d: Date): string {
  const bj = new Date(d.getTime() + 8 * 3600_000)
  return bj.toISOString().slice(0, 10)
}

/** 对日期字符串加减天数 */
function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00+08:00')
  d.setDate(d.getDate() + days)
  return toBJDateStr(d)
}

/** 返回某北京日期的星期几（0=周日 … 6=周六）*/
function weekday(dateStr: string): number {
  return new Date(dateStr + 'T12:00:00+08:00').getDay()
}

/** 构造北京时间截止点（返回 UTC Date，用于与 completed_at 比较）*/
function bjDeadline(dateStr: string, h: number, m: number): Date {
  return new Date(`${dateStr}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00+08:00`)
}

// ── 业务判断 ──────────────────────────────────────────────────────────────

function isHolidayDay(dateStr: string, holidays: Holiday[]): boolean {
  return holidays.some(h => dateStr >= h.start_date && dateStr <= h.end_date)
}

function isDayBeforeHoliday(dateStr: string, holidays: Holiday[]): boolean {
  const tomorrow = shiftDate(dateStr, 1)
  return holidays.some(h => h.start_date === tomorrow)
}

function isNormalSchoolDay(dateStr: string, holidays: Holiday[], workdays: string[]): boolean {
  // 调休工作日本身：按上学日计算
  if (workdays.includes(dateStr)) return true
  // 明天是调休工作日：今天也按上学日计算（今晚要完成作业）
  if (workdays.includes(shiftDate(dateStr, 1))) return true
  const wd = weekday(dateStr)
  if (wd < 1 || wd > 4) return false          // 只有周一~周四
  if (isHolidayDay(dateStr, holidays)) return false
  if (isDayBeforeHoliday(dateStr, holidays)) return false
  return true
}

/** 判断该日期是否是某个"非正常窗口"的最后一天。
 *  返回窗口信息，否则 null。 */
function getNonNormalWindow(dateStr: string, holidays: Holiday[], workdays: string[]
): { windowStart: string; windowEnd: string; label: string } | null {
  // 调休工作日：不触发周末窗口
  if (workdays.includes(dateStr)) return null
  // 优先：是否是某节假日的最后一天
  const holiday = holidays.find(h => h.end_date === dateStr)
  if (holiday) {
    const windowStart = shiftDate(holiday.start_date, -1) // 放假前一天
    return { windowStart, windowEnd: dateStr, label: holiday.name }
  }
  // 普通周末：周日是最后一天
  if (weekday(dateStr) === 0) {
    return { windowStart: shiftDate(dateStr, -2), windowEnd: dateStr, label: '周末' }
  }
  return null
}

// ── 积分计算 ──────────────────────────────────────────────────────────────

function calcNormal(lastDone: Date, dateStr: string): { points: number; reason: string } {
  if (lastDone <= bjDeadline(dateStr, 21,  0)) return { points: 10, reason: '正常上课日 21:00前完成全部作业 🏆' }
  if (lastDone <= bjDeadline(dateStr, 21, 30)) return { points:  8, reason: '正常上课日 21:30前完成全部作业 ⭐' }
  if (lastDone <= bjDeadline(dateStr, 24,  0)) return { points:  6, reason: '正常上课日 24:00前完成全部作业' }
  return { points: 0, reason: '正常上课日 24:00前未完成全部作业' }
}

function calcNonNormal(lastDone: Date, windowEnd: string): { points: number; reason: string } {
  const day2 = shiftDate(windowEnd, -1)
  if (lastDone <= bjDeadline(day2,     12,  0)) return { points: 10, reason: '假期作业 倒数第二天12:00前完成 🏆' }
  if (lastDone <= bjDeadline(day2,     24,  0)) return { points:  8, reason: '假期作业 倒数第二天24:00前完成 ⭐' }
  if (lastDone <= bjDeadline(windowEnd, 21,  0)) return { points:  6, reason: '假期作业 倒数第一天21:00前完成' }
  return { points: 0, reason: '假期作业 倒数第一天21:00后未完成全部作业' }
}

// ── 写积分记录 ────────────────────────────────────────────────────────────

async function writePoints(
  date: string,
  day_type: 'normal' | 'non_normal',
  points: number,
  reason: string,
  homeworkIds: string[]
) {
  const { error } = await supabase.from('points_log').insert({
    date, day_type, points, reason,
    source: 'auto',
    homework_ids: homeworkIds,
  })
  if (error) throw new Error('写积分失败: ' + error.message)
}

// ── 主处理函数 ────────────────────────────────────────────────────────────

async function scoreDay(yesterdayStr: string, holidays: Holiday[], workdays: string[]) {
  // 是否已经结算过
  const { data: exist } = await supabase
    .from('points_log')
    .select('id')
    .eq('date', yesterdayStr)
    .eq('source', 'auto')
    .limit(1)
  if (exist && exist.length > 0) return { skipped: true, reason: '已结算' }

  const window = getNonNormalWindow(yesterdayStr, holidays, workdays)

  // ── 非正常上课日窗口 ─────────────────────────────────────────────────
  if (window) {
    const bounds = {
      start: window.windowStart + 'T00:00:00+08:00',
      end:   window.windowEnd   + 'T23:59:59+08:00',
    }
    const { data: hw } = await supabase
      .from('homework').select('id, is_completed, completed_at')
      .gte('created_at', bounds.start).lte('created_at', bounds.end)

    if (!hw || hw.length === 0)
      return { points: null, reason: `${window.label} 窗口内无作业，不记分` }

    const allDone = hw.every(h => h.is_completed && h.completed_at)
    if (!allDone) {
      await writePoints(yesterdayStr, 'non_normal', 0,
        `${window.label}(${window.windowStart}~${window.windowEnd}) 未全部完成作业`,
        hw.map(h => h.id))
      return { points: 0, reason: '未全部完成' }
    }

    const lastDone = new Date(Math.max(...hw.map(h => new Date(h.completed_at).getTime())))
    const { points, reason } = calcNonNormal(lastDone, window.windowEnd)
    const fullReason = `${reason}（${window.windowStart}~${window.windowEnd}）`
    await writePoints(yesterdayStr, 'non_normal', points, fullReason, hw.map(h => h.id))
    return { points, reason: fullReason }
  }

  // ── 正常上课日 ───────────────────────────────────────────────────────
  if (isNormalSchoolDay(yesterdayStr, holidays, workdays)) {
    const bounds = {
      start: yesterdayStr + 'T00:00:00+08:00',
      end:   yesterdayStr + 'T23:59:59+08:00',
    }
    const { data: hw } = await supabase
      .from('homework').select('id, is_completed, completed_at')
      .gte('created_at', bounds.start).lte('created_at', bounds.end)

    if (!hw || hw.length === 0)
      return { points: null, reason: `${yesterdayStr} 正常上课日无作业，不记分` }

    const allDone = hw.every(h => h.is_completed && h.completed_at)
    if (!allDone) {
      await writePoints(yesterdayStr, 'normal', 0,
        `正常上课日(${yesterdayStr}) 未全部完成作业`, hw.map(h => h.id))
      return { points: 0, reason: '未全部完成' }
    }

    const lastDone = new Date(Math.max(...hw.map(h => new Date(h.completed_at).getTime())))
    const { points, reason } = calcNormal(lastDone, yesterdayStr)
    await writePoints(yesterdayStr, 'normal', points, reason, hw.map(h => h.id))
    return { points, reason }
  }

  // ── 不需要结算的日期（周六/假期中间日）────────────────────────────────
  return { points: null, reason: `${yesterdayStr} 非结算日，跳过` }
}

// ── HTTP Handler ──────────────────────────────────────────────────────────

export async function POST(request: Request) {
  // 验证 CRON_SECRET
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // 昨天的北京日期
    const yesterdayStr = toBJDateStr(new Date(Date.now() - 86_400_000))

    const { data: holidays } = await supabase.from('holidays').select('*')
    const { data: workdayRows } = await supabase.from('workday_overrides').select('date')
    const workdays = (workdayRows || []).map((r: { date: string }) => r.date)
    const result = await scoreDay(yesterdayStr, holidays || [], workdays)

    return NextResponse.json({ date: yesterdayStr, ...result })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// 允许 GET 方便调试（同样需要 secret）
export async function GET(request: Request) {
  return POST(request)
}
