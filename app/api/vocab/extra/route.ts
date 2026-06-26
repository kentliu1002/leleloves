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

const MAX_EXTRA_PER_DAY = 3
const GROUP_SIZE = 10        // 每组目标词数（优先 5 新 + 5 复习；新词不足用复习补满）
const NEW_TARGET = 5

// 计算考查范围内的候选 word id（与 today 一致：topic ∪ module）
async function getCandidateIds(): Promise<number[]> {
  const { data: settings } = await supabase
    .from('vocab_settings').select('enabled_topics, enabled_modules').eq('id', 1).single()
  const enabledTopics: string[] = settings?.enabled_topics || []
  const enabledModules: string[] = settings?.enabled_modules || []

  const candidateIdSet = new Set<number>()

  if (enabledTopics.length > 0) {
    const { data: topicWords } = await supabase
      .from('vocabulary').select('id').in('topic', enabledTopics)
    ;(topicWords || []).forEach(w => candidateIdSet.add(w.id))
  }

  if (enabledModules.length > 0) {
    const moduleConditions = enabledModules.map(k => {
      const idx = k.indexOf('.')
      if (idx < 0) return null
      return { book: k.substring(0, idx), label: k.substring(idx + 1) }
    }).filter(Boolean) as { book: string, label: string }[]

    if (moduleConditions.length > 0) {
      const books = [...new Set(moduleConditions.map(c => c.book))]
      const { data: modRows } = await supabase
        .from('textbook_modules').select('id, book, module_no, unit_label').in('book', books)
      const moduleIds = (modRows || [])
        .filter(m => moduleConditions.some(c =>
          c.book === m.book && (c.label === (m.unit_label || `M${m.module_no}`))
        ))
        .map(m => m.id)
      if (moduleIds.length > 0) {
        const { data: links } = await supabase
          .from('vocab_module_words').select('word_id').in('module_id', moduleIds)
        ;(links || []).forEach(l => candidateIdSet.add(l.word_id))
      }
    }
  }

  return [...candidateIdSet]
}

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

// GET：生成额外一组（5 新 + 复习补满 10；新词耗尽则纯复习 10）
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

    const candidateIds = await getCandidateIds()
    if (candidateIds.length === 0) {
      return NextResponse.json({ error: '尚未设置考查范围' }, { status: 400 })
    }

    // 新词：候选中从未在 vocab_attempts 出现过的
    const { data: attempted } = await supabase
      .from('vocab_attempts').select('word_id')
    const seenIds = new Set((attempted || []).map(r => r.word_id))
    const unseenIds = candidateIds.filter(id => !seenIds.has(id))
    let newPool: any[] = []
    if (unseenIds.length > 0) {
      const { data } = await supabase.from('vocabulary').select('*').in('id', unseenIds)
      newPool = data || []
    }
    const newWords = shuffle(newPool).slice(0, NEW_TARGET)

    // 复习词：曾答对过的词，补满到 GROUP_SIZE，且排除本组新词
    const reviewNeeded = GROUP_SIZE - newWords.length
    const { data: correctAttempts } = await supabase
      .from('vocab_attempts').select('word_id').eq('correct', true)
    const masteredIds = [...new Set((correctAttempts || []).map(r => r.word_id))]
    const newIdSet = new Set(newWords.map(w => w.id))
    let reviewPool: any[] = []
    if (masteredIds.length > 0) {
      const { data } = await supabase.from('vocabulary').select('*').in('id', masteredIds)
      reviewPool = (data || []).filter(w => !newIdSet.has(w.id))
    }
    const reviewWords = shuffle(reviewPool).slice(0, reviewNeeded)

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
