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

export async function GET() {
  try {
    const today = bjToday()

    // 1. 已有当日 session 直接返回
    const { data: existing } = await supabase
      .from('vocab_daily').select('*').eq('date', today).single()

    if (existing) {
      const newIds: number[] = existing.new_word_ids || []
      const reviewIds: number[] = existing.review_word_ids || []
      const allIds = [...newIds, ...reviewIds]
      const { data: words } = await supabase
        .from('vocabulary').select('*').in('id', allIds.length > 0 ? allIds : [-1])
      const wordMap = new Map((words || []).map(w => [w.id, w]))
      // 今日已完成的额外组数（用于 done 阶段显示进度）
      const { data: extraLogs } = await supabase
        .from('points_log').select('id').eq('date', today).eq('source', 'vocab_extra')
      return NextResponse.json({
        date: today,
        newWords: newIds.map(id => wordMap.get(id)).filter(Boolean),
        reviewWords: reviewIds.map(id => wordMap.get(id)).filter(Boolean),
        completedToday: !!existing.completed_at,
        extraGroupsToday: (extraLogs || []).length
      })
    }

    const { newWords, reviewWords } = await getSemesterGroup(supabase, today)

    // 写入 vocab_daily
    await supabase.from('vocab_daily').insert({
      date: today,
      new_word_ids: newWords.map(w => w.id),
      review_word_ids: reviewWords.map(w => w.id),
      completed_at: null
    })

    return NextResponse.json({
      date: today,
      newWords,
      reviewWords,
      completedToday: false
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
