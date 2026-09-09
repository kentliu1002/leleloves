import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isUsableFeedback } from '../../../../lib/ai-feedback.mjs'
import { runAnalysis } from '../../../../lib/homework-analysis.mjs'

export const runtime = 'nodejs'
export const maxDuration = 300
export const preferredRegion = 'sin1'
export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15000) }) } }
)

// POST: 同步分析，直接返回 feedback
export async function POST(request: Request) {
  try {
    const { id } = await request.json()
    const { data: hw, error } = await supabase
      .from('homework').select('id, content, proof_image, ai_feedback').eq('id', id).single()
    if (error || !hw) return NextResponse.json({ error: '作业不存在' }, { status: 404 })

    // 已有有效结果直接返回（忽略 PROCESSING 残留）
    if (isUsableFeedback(hw.ai_feedback)) {
      return NextResponse.json({ feedback: hw.ai_feedback })
    }

    const feedback = await runAnalysis(hw.content, hw.proof_image, supabase, process.env.ARK_API_KEY)
    // Preview validation must not overwrite production homework.
    if (process.env.VERCEL_ENV === 'preview') return NextResponse.json({ feedback })

    const { error: saveError } = await supabase.from('homework').update({ ai_feedback: feedback }).eq('id', id)
    if (saveError) throw new Error('批改结果保存失败，请重试')
    return NextResponse.json({ feedback })
  } catch (e: any) {
    console.error('[analyze] POST error:', e?.message, e?.cause?.code || '')
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// GET: 兼容网页端轮询，直接返回当前状态
export async function GET(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: '缺 id' }, { status: 400 })
    const { data: hw, error } = await supabase
      .from('homework').select('ai_feedback').eq('id', id).single()
    if (error || !hw) return NextResponse.json({ error: '作业不存在' }, { status: 404 })
    if (isUsableFeedback(hw.ai_feedback)) {
      return NextResponse.json({ feedback: hw.ai_feedback })
    }
    return NextResponse.json({ pending: false })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
