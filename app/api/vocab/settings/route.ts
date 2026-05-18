import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const { data, error } = await supabase
    .from('vocab_settings').select('*').eq('id', 1).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PUT(request: Request) {
  const { enabled_topics } = await request.json()
  if (!Array.isArray(enabled_topics)) {
    return NextResponse.json({ error: 'enabled_topics 必须是数组' }, { status: 400 })
  }
  const { error } = await supabase
    .from('vocab_settings')
    .update({ enabled_topics, updated_at: new Date().toISOString() })
    .eq('id', 1)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, enabled_topics })
}
