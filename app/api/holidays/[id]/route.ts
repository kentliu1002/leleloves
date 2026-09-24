import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { deletePolicy } from '../../../../lib/china-calendar-sync.mjs'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { data, error: readError } = await supabase.from('holidays').select('source').eq('id', params.id).single()
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 })
  const query = deletePolicy(data) === 'disable'
    ? supabase.from('holidays').update({ is_disabled: true }).eq('id', params.id)
    : supabase.from('holidays').delete().eq('id', params.id)
  const { error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
