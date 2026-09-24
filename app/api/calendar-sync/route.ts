import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  createSupabaseCalendarRepository,
  syncGovernmentCalendar,
  syncYears
} from '../../../lib/china-calendar-sync.mjs'

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function status() {
  const { data, error } = await supabase
    .from('calendar_sync_state')
    .select('*')
    .eq('id', 'cn-government')
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || {
    id: 'cn-government',
    last_success_at: null,
    synced_years: [],
    source_urls: [],
    last_error: null
  })
}

async function runSync() {
  try {
    const result = await syncGovernmentCalendar({
      years: syncYears(),
      repository: createSupabaseCalendarRepository(supabase)
    })
    return NextResponse.json({ success: true, ...result })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

function authorized(request: Request) {
  return Boolean(process.env.CRON_SECRET) && request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`
}

export async function GET(request: Request) {
  return authorized(request) ? runSync() : status()
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return runSync()
}
