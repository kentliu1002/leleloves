import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { groupVocabLibrary } from '../../../../lib/vocab-library.mjs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  try {
    const rows = []
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.from('vocabulary')
        .select('id,word,topic,ipa,meaning_zh,example_en,example_zh')
        .order('id').range(offset, offset + 999)
      if (error) throw error
      rows.push(...data)
      if (data.length < 1000) break
    }
    return NextResponse.json(groupVocabLibrary(rows))
  } catch (e: any) {
    return NextResponse.json({ error: e.message || '单词书加载失败' }, { status: 500 })
  }
}
