import { releaseVocabPoints } from '../../../../lib/vocab-points.mjs'
import curriculum from '../../../../lib/semester-vocab.json'
import { getSemesterGroup } from '../../../../lib/semester-vocab.mjs'
import { dailyVocabProgress } from '../../../../lib/daily-vocab.mjs'
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

    const { data: existing, error: sessionError } = await supabase
      .from('vocab_daily').select('*').eq('date', today).maybeSingle()
    if (sessionError) throw sessionError
    let daily = existing

    let outsideSemester = false
    if (daily && !daily.completed_at) {
      const ids: number[] = [...(daily.new_word_ids || []), ...(daily.review_word_ids || [])]
      const { data: assigned, error } = await supabase
        .from('vocabulary').select('id,topic').in('id', ids.length ? ids : [-1])
      if (error) throw error
      outsideSemester = (assigned || []).some(w => w.topic !== curriculum.topic)
    }

    // 未完成的旧规则或含其他课本词汇的任务重新安排；已完成的任务保留。
    if (!daily || (!daily.completed_at && (
      outsideSemester || (daily.new_word_ids || []).length > 5 || (daily.review_word_ids || []).length > 5
    ))) {
      const { newWords, reviewWords } = await getSemesterGroup(supabase, today, true)
      daily = {
        date: today,
        new_word_ids: newWords.map(w => w.id),
        review_word_ids: reviewWords.map(w => w.id),
        completed_at: null
      }
      const query = existing
        ? supabase.from('vocab_daily').update(daily).eq('date', today)
        : supabase.from('vocab_daily').insert(daily)
      const { error } = await query
      if (error) throw error
    }

    const { data: attempts, error: attemptsError } = await supabase
      .from('vocab_attempts').select('word_id,kind,correct,date')
      .eq('date', today).eq('kind', 'review').eq('correct', true)
    if (attemptsError) throw attemptsError
    const { reviewPassed } = dailyVocabProgress(daily, attempts || [])
    // 抽查通过前不向页面返回新词，刷新后也按已记录的答题结果恢复。
    const newIds: number[] = reviewPassed ? daily.new_word_ids || [] : []
    const reviewIds: number[] = daily.review_word_ids || []
    const allIds = [...newIds, ...reviewIds]
    const { data: words, error: wordsError } = await supabase
      .from('vocabulary').select('*').in('id', allIds.length > 0 ? allIds : [-1])
    if (wordsError) throw wordsError
    const wordMap = new Map((words || []).map(w => [w.id, w]))
    if (daily.completed_at) await releaseVocabPoints(supabase, today)
    const { data: extraLogs } = await supabase
      .from('points_log').select('id').eq('date', today).eq('source', 'vocab_extra')
    return NextResponse.json({
      date: today,
      newWords: newIds.map(id => wordMap.get(id)).filter(Boolean),
      reviewWords: reviewIds.map(id => wordMap.get(id)).filter(Boolean),
      reviewPassed,
      completedToday: !!daily.completed_at,
      extraGroupsToday: (extraLogs || []).length
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
