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

export async function GET() {
  try {
    // 拉取全部 attempts（数据量不大，无需分页）
    const { data: attempts } = await supabase
      .from('vocab_attempts').select('*').order('created_at', { ascending: false })
    const all = attempts || []

    // 已掌握：去重 word_id where correct=true
    const masteredSet = new Set(
      all.filter(a => a.correct).map(a => a.word_id)
    )
    const masteredCount = masteredSet.size

    // 一次性答对率：按 (date, word_id) 取 attempt_no=1 那一条
    const firstAttempts = all.filter(a => a.attempt_no === 1)
    const reviewFirst = firstAttempts.filter(a => a.kind === 'review')
    const newFirst = firstAttempts.filter(a => a.kind === 'new')
    const reviewFirstAcc = reviewFirst.length > 0
      ? Math.round(reviewFirst.filter(a => a.correct).length / reviewFirst.length * 100)
      : 0
    const newFirstAcc = newFirst.length > 0
      ? Math.round(newFirst.filter(a => a.correct).length / newFirst.length * 100)
      : 0

    // 最近 14 天每日完成情况
    const { data: dailies } = await supabase
      .from('vocab_daily').select('*').order('date', { ascending: false }).limit(14)
    const recentDays = (dailies || []).map(d => ({
      date: d.date,
      completed: !!d.completed_at,
      newCount: (d.new_word_ids || []).length,
      reviewCount: (d.review_word_ids || []).length
    }))

    // 今日状态
    const today = bjToday()
    const todayRow = (dailies || []).find(d => d.date === today)
    const todayStatus = todayRow ? {
      newCount: (todayRow.new_word_ids || []).length,
      reviewCount: (todayRow.review_word_ids || []).length,
      completed: !!todayRow.completed_at
    } : { newCount: 0, reviewCount: 0, completed: false }

    return NextResponse.json({
      masteredCount,
      reviewFirstAcc,
      newFirstAcc,
      reviewFirstTotal: reviewFirst.length,
      newFirstTotal: newFirst.length,
      recentDays,
      todayStatus
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
