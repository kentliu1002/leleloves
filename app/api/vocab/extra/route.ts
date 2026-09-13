import { getSemesterGroup } from '../../../../lib/semester-vocab.mjs'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// 北京日期 YYYY-MM-DD
function bjToday(): string {
  return new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10)
}

const MAX_EXTRA_PER_DAY = 3

async function countExtraToday(today: string): Promise<number> {
  const { data } = await supabase
    .from('points_log').select('id')
    .eq('date', today).eq('source', 'vocab_extra')
  return (data || []).length
}

// 校验是否可以开/记额外组：硬性必须已完成；返回 { ok, status, extraGroupsToday }
async function guard(today: string): Promise<
  { ok: true; extraGroupsToday: number } |
  { ok: false; status: number; error: string; extraGroupsToday: number }
> {
  const { data: daily } = await supabase
    .from('vocab_daily').select('completed_at').eq('date', today).single()
  if (!daily?.completed_at) {
    return { ok: false, status: 403, error: '请先完成今日硬性单词任务', extraGroupsToday: 0 }
  }
  const extraGroupsToday = await countExtraToday(today)
  if (extraGroupsToday >= MAX_EXTRA_PER_DAY) {
    return { ok: false, status: 429, error: '今日额外组已达上限', extraGroupsToday }
  }
  return { ok: true, extraGroupsToday }
}

// GET：与每日任务相同，优先本学期已开放词，旧词补满 10 个
export async function GET() {
  try {
    const today = bjToday()
    const g = await guard(today)
    if (!g.ok) {
      return NextResponse.json(
        { error: g.error, extraGroupsToday: g.extraGroupsToday, maxPerDay: MAX_EXTRA_PER_DAY },
        { status: g.status }
      )
    }

    const { newWords, reviewWords } = await getSemesterGroup(supabase, today)

    return NextResponse.json({
      newWords,
      reviewWords,
      extraGroupsToday: g.extraGroupsToday,
      maxPerDay: MAX_EXTRA_PER_DAY
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST：完成额外一组 → 加 5 分
export async function POST() {
  try {
    const today = bjToday()
    const g = await guard(today)
    if (!g.ok) {
      return NextResponse.json(
        { error: g.error, extraGroupsToday: g.extraGroupsToday, maxPerDay: MAX_EXTRA_PER_DAY },
        { status: g.status }
      )
    }

    await supabase.from('points_log').insert({
      date: today,
      day_type: 'manual',
      points: 5,
      reason: '附加任务：额外背单词一组 +5',
      source: 'vocab_extra',
      homework_ids: []
    })

    return NextResponse.json({
      success: true,
      extraGroupsToday: g.extraGroupsToday + 1,
      maxPerDay: MAX_EXTRA_PER_DAY
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
