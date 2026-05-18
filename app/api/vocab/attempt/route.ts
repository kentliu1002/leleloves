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

export async function POST(request: Request) {
  try {
    const { wordId, kind, correct, attempt_no } = await request.json()
    if (!wordId || !kind || typeof correct !== 'boolean' || !attempt_no) {
      return NextResponse.json({ error: '参数缺失' }, { status: 400 })
    }
    const { error } = await supabase.from('vocab_attempts').insert({
      date: bjToday(),
      word_id: wordId,
      kind,
      correct,
      attempt_no
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
