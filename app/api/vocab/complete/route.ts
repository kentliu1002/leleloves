import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function bjToday(): string {
  return new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10)
}

export async function POST() {
  try {
    const today = bjToday()

    // 标记 vocab_daily 完成（如果还没标记）
    const { data: daily } = await supabase
      .from('vocab_daily').select('*').eq('date', today).single()
    if (!daily) {
      return NextResponse.json({ error: '今日 session 不存在' }, { status: 404 })
    }
    if (daily.completed_at) {
      return NextResponse.json({ success: true, alreadyCompleted: true })
    }

    await supabase.from('vocab_daily')
      .update({ completed_at: new Date().toISOString() })
      .eq('date', today)

    // 加 5 分到 points_log（先查同一天是否已有 vocab_bonus 防重复）
    const { data: existingPts } = await supabase
      .from('points_log').select('id')
      .eq('date', today).eq('source', 'vocab_bonus').limit(1)
    if (!existingPts || existingPts.length === 0) {
      await supabase.from('points_log').insert({
        date: today,
        day_type: 'manual',
        points: 5,
        reason: '附加任务：完成英语单词学习 +5',
        source: 'vocab_bonus',
        homework_ids: []
      })
    }

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
