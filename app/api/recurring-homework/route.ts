import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// 列出全部固定作业模板（按假期分组由前端处理）
export async function GET() {
  const { data, error } = await supabase
    .from('recurring_homework')
    .select('*')
    .order('start_date', { ascending: false })
    .order('subject', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

// 新增一条固定作业模板
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name, start_date, end_date, subject, weekdays, note, submit_type } = body

    if (!name?.trim() || !start_date || !end_date) {
      return NextResponse.json({ error: '请填写假期名称和起止日期' }, { status: 400 })
    }
    if (end_date < start_date) {
      return NextResponse.json({ error: '结束日期不能早于开始日期' }, { status: 400 })
    }
    if (!subject?.trim()) {
      return NextResponse.json({ error: '请选择科目' }, { status: 400 })
    }
    if (!Array.isArray(weekdays) || weekdays.length === 0) {
      return NextResponse.json({ error: '请至少选择一个星期几' }, { status: 400 })
    }
    const st = submit_type === 'audio' ? 'audio' : 'photo'

    const { data, error } = await supabase
      .from('recurring_homework')
      .insert({
        name: name.trim(),
        start_date,
        end_date,
        subject: subject.trim(),
        weekdays: weekdays.map((n: any) => Number(n)).filter((n: number) => n >= 0 && n <= 6),
        note: note?.trim() || null,
        submit_type: st,
        enabled: true
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// 删除一条模板：/api/recurring-homework?id=123
export async function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })
    const { error } = await supabase.from('recurring_homework').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
