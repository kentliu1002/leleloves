import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'

const PROCESSING = '__PROCESSING__'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// 兜底补漏：扫描已打卡但还没 AI 结果的作业，串行补跑分析。
// 配合打卡时的即时触发，保证最终都有结果（即时那次失败也会被这里补上）。
// 每次最多处理 3 条（3×~80s 控制在 maxDuration 300s 内），按时间正序先补老的。
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = request.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
  }

  try {
    const { data: rows, error } = await supabase
      .from('homework')
      .select('id')
      .eq('is_completed', true)
      .not('proof_image', 'is', null)
      .or(`ai_feedback.is.null,ai_feedback.eq.${PROCESSING}`)
      .order('created_at', { ascending: true })
      .limit(3)
    if (error) throw error
    if (!rows || rows.length === 0) {
      return NextResponse.json({ processed: 0, done: 0, fail: 0 })
    }

    const origin = new URL(request.url).origin
    let done = 0, fail = 0
    for (const r of rows) {
      try {
        const res = await fetch(`${origin}/api/homework/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: r.id })
        })
        if (res.ok) {
          const j = await res.json().catch(() => ({}))
          if (j.feedback) done++; else fail++
        } else {
          fail++
        }
      } catch {
        fail++
      }
    }
    console.log(`[cron analyze-pending] processed=${rows.length} done=${done} fail=${fail}`)
    return NextResponse.json({ processed: rows.length, done, fail })
  } catch (e: any) {
    console.error('[cron analyze-pending] error:', e?.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
