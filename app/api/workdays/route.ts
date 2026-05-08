import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const { data, error } = await supabase
    .from('workday_overrides')
    .select('*')
    .order('date', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

export async function POST(request: Request) {
  try {
    const { date, note } = await request.json()
    if (!date) return NextResponse.json({ error: '请选择日期' }, { status: 400 })

    // 周一~周四本来就是上学日，不需要设置
    const wd = new Date(date + 'T12:00:00+08:00').getDay()
    if (wd >= 1 && wd <= 4) {
      return NextResponse.json({ error: '周一到周四本来就是上学日，无需设置调休' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('workday_overrides')
      .insert({ date, note: note?.trim() || null })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
