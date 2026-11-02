import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { vocabularyStreak } from '../../../../lib/daily-vocab.mjs'

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
    const { data: dailies, error: dailyError } = await supabase
      .from('vocab_daily').select('*').order('date', { ascending: false }).limit(14)
    if (dailyError) throw dailyError
    const dailyRows = dailies || []
    const wordIds = Array.from(new Set(dailyRows.flatMap(d => [
      ...(d.new_word_ids || []),
      ...(d.review_word_ids || [])
    ])))
    const { data: words } = await supabase
      .from('vocabulary')
      .select('id,word,meaning_zh,topic')
      .in('id', wordIds.length > 0 ? wordIds : [-1])
    const wordMap = new Map((words || []).map(w => [w.id, w]))

    const recentDays = (dailies || []).map(d => ({
      date: d.date,
      completed: !!d.completed_at,
      newCount: (d.new_word_ids || []).length,
      reviewCount: (d.review_word_ids || []).length,
      newWords: (d.new_word_ids || []).map((id: number) => wordMap.get(id)).filter(Boolean),
      reviewWords: (d.review_word_ids || []).map((id: number) => wordMap.get(id)).filter(Boolean)
    }))

    // 今日状态
    const today = bjToday()
    const completedDates: string[] = []
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.from('vocab_daily')
        .select('date').not('completed_at', 'is', null).lte('date', today)
        .order('date', { ascending: false }).range(offset, offset + 999)
      if (error) throw error
      completedDates.push(...(data || []).map(row => row.date))
      if ((data || []).length < 1000) break
    }
    const streaks: Record<string, number> = {}
    for (let i = 0; i < 7; i++) {
      const day = new Date(`${today}T00:00:00Z`)
      day.setUTCDate(day.getUTCDate() - i)
      const date = day.toISOString().slice(0, 10)
      streaks[date] = vocabularyStreak(completedDates, date, i === 0)
    }
    const todayRow = (dailies || []).find(d => d.date === today)
    const todayStatus = todayRow ? {
      newCount: (todayRow.new_word_ids || []).length,
      reviewCount: (todayRow.review_word_ids || []).length,
      completed: !!todayRow.completed_at,
      newWords: (todayRow.new_word_ids || []).map((id: number) => wordMap.get(id)).filter(Boolean),
      reviewWords: (todayRow.review_word_ids || []).map((id: number) => wordMap.get(id)).filter(Boolean)
    } : { newCount: 0, reviewCount: 0, completed: false }

    return NextResponse.json({
      masteredCount,
      reviewFirstAcc,
      newFirstAcc,
      reviewFirstTotal: reviewFirst.length,
      newFirstTotal: newFirst.length,
      recentDays,
      streaks,
      todayStatus
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
