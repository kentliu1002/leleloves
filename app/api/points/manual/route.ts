import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  try {
    const { points, reason } = await request.json()

    if (typeof points !== 'number' || points === 0) {
      return NextResponse.json({ error: '积分值不能为 0' }, { status: 400 })
    }
    if (!reason?.trim()) {
      return NextResponse.json({ error: '请填写原因' }, { status: 400 })
    }

    // 北京日期
    const today = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10)

    const { error } = await supabase.from('points_log').insert({
      date: today,
      day_type: 'manual',
      points,
      reason: reason.trim(),
      source: 'parent_manual',
      homework_ids: [],
    })

    if (error) throw error
    return NextResponse.json({ success: true, points, date: today })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
