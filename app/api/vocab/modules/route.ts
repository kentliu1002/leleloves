import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  try {
    // 拉模块列表 + 每个 module 的词数
    const { data: modules, error: modErr } = await supabase
      .from('textbook_modules').select('id, book, module_no, sort_order')
      .order('sort_order', { ascending: true })
    if (modErr) throw modErr

    const { data: links } = await supabase
      .from('vocab_module_words').select('module_id')
    const countByMod: Record<number, number> = {}
    ;(links || []).forEach(l => {
      countByMod[l.module_id] = (countByMod[l.module_id] || 0) + 1
    })

    // 按 book 分组
    const grouped: Record<string, { id: number, module_no: number, key: string, count: number }[]> = {}
    ;(modules || []).forEach(m => {
      if (!grouped[m.book]) grouped[m.book] = []
      grouped[m.book].push({
        id: m.id,
        module_no: m.module_no,
        key: `${m.book}.M${m.module_no}`,
        count: countByMod[m.id] || 0
      })
    })

    // 按 book 升序（3上 → 6下）保留 grouped 内顺序
    const orderedBooks = ['3上','3下','4上','4下','5上','5下','6上','6下']
    const result = orderedBooks
      .filter(b => grouped[b])
      .map(b => ({ book: b, modules: grouped[b] }))

    return NextResponse.json({ books: result })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
