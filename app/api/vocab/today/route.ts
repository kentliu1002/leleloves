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

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
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
      return NextResponse.json({
        date: today,
        newWords: newIds.map(id => wordMap.get(id)).filter(Boolean),
        reviewWords: reviewIds.map(id => wordMap.get(id)).filter(Boolean),
        completedToday: !!existing.completed_at
      })
    }

    // 2. 创建新 session
    const { data: settings } = await supabase
      .from('vocab_settings').select('enabled_topics').eq('id', 1).single()
    const enabledTopics: string[] = settings?.enabled_topics || []

    if (enabledTopics.length === 0) {
      return NextResponse.json({
        date: today, newWords: [], reviewWords: [], completedToday: false,
        warning: '尚未设置考查主题，请家长在小程序"单词"页选择主题'
      })
    }

    // 选 5 个新词：在 enabled topics 中且从未在 vocab_attempts 出现
    const { data: attemptedIds } = await supabase
      .from('vocab_attempts').select('word_id')
    const seenIds = new Set((attemptedIds || []).map(r => r.word_id))

    const { data: candidateWords } = await supabase
      .from('vocabulary').select('*').in('topic', enabledTopics)
    const unseen = (candidateWords || []).filter(w => !seenIds.has(w.id))
    const newWords = shuffle(unseen).slice(0, 5)

    // 选 5 个复习词：有过 correct=true 的
    const { data: correctAttempts } = await supabase
      .from('vocab_attempts').select('word_id').eq('correct', true)
    const masteredIds = [...new Set((correctAttempts || []).map(r => r.word_id))]
    const reviewPool = masteredIds.length > 0
      ? (await supabase.from('vocabulary').select('*').in('id', masteredIds)).data || []
      : []
    const reviewWords = shuffle(reviewPool).slice(0, 5)

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
