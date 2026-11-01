import { releaseVocabPoints } from '../../../../lib/vocab-points.mjs'
import { dailyVocabProgress } from '../../../../lib/daily-vocab.mjs'
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
    if (!daily.completed_at) {
      const { data: attempts, error: attemptsError } = await supabase
        .from('vocab_attempts').select('word_id,kind,correct,date')
        .eq('date', today).eq('correct', true)
      if (attemptsError) throw attemptsError
      const { reviewPassed, newPassed } = dailyVocabProgress(daily, attempts || [])
      if (!reviewPassed || !newPassed) {
        return NextResponse.json({ error: '请先通过全部抽查和新词测试' }, { status: 403 })
      }
      const { error: completionError } = await supabase.from('vocab_daily')
        .update({ completed_at: new Date().toISOString() })
        .eq('date', today)
      if (completionError) throw completionError
    }

    // 先记录待发放积分，避免只完成单词时加分。
    const { data: existingPts } = await supabase
      .from('points_log').select('id')
      .eq('date', today).eq('source', 'vocab_bonus').limit(1)
    if (!existingPts || existingPts.length === 0) {
      const { error } = await supabase.from('points_log').insert({
        date: today,
        day_type: 'manual',
        points: 0,
        reason: '单词任务完成，等待其他作业完成后 +5',
        source: 'vocab_bonus',
        homework_ids: []
      })
      if (error) throw error
    }

    const pointsAwarded = await releaseVocabPoints(supabase, today)
    return NextResponse.json({ success: true, pointsAwarded })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
