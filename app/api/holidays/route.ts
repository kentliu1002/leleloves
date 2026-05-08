import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const { data, error } = await supabase
    .from('holidays')
    .select('*')
    .order('start_date', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

export async function POST(request: Request) {
  try {
    const { name, start_date, end_date } = await request.json()

    if (!name?.trim() || !start_date || !end_date) {
      return NextResponse.json({ error: '请填写假期名称、开始和结束日期' }, { status: 400 })
    }
    if (end_date < start_date) {
      return NextResponse.json({ error: '结束日期不能早于开始日期' }, { status: 400 })
    }

    // 最多7天
    const days = (new Date(end_date).getTime() - new Date(start_date).getTime()) / 86_400_000 + 1
    if (days > 7) {
      return NextResponse.json({ error: '假期最长为 7 天' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('holidays')
      .insert({ name: name.trim(), start_date, end_date })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
