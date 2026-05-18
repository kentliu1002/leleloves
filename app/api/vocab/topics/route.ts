import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  // 返回所有主题及每主题词数
  const { data, error } = await supabase
    .from('vocabulary').select('topic')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const countByTopic: Record<string, number> = {}
  data!.forEach(r => { countByTopic[r.topic] = (countByTopic[r.topic] || 0) + 1 })

  const topics = Object.entries(countByTopic)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)

  return NextResponse.json({ topics, total: data!.length })
}
