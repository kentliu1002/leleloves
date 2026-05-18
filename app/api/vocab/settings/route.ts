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
  const body = await request.json()
  const patch: any = { updated_at: new Date().toISOString() }
  if (Array.isArray(body.enabled_topics)) patch.enabled_topics = body.enabled_topics
  if (Array.isArray(body.enabled_modules)) patch.enabled_modules = body.enabled_modules
  if (!('enabled_topics' in patch) && !('enabled_modules' in patch)) {
    return NextResponse.json({ error: '需要传 enabled_topics 或 enabled_modules' }, { status: 400 })
  }
  const { error } = await supabase
    .from('vocab_settings').update(patch).eq('id', 1)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, ...patch })
}
