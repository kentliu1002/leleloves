import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!  // 用 service role 绕过任何 RLS
)

export async function POST(request: Request) {
  try {
    // 改为接收 JSON：{ id, proof_urls: [...] }
    // 图片由浏览器直接传到 Supabase Storage，绕开 Vercel 4.5MB 请求体限制
    const body = await request.json()
    const id = body.id as string
    const proofUrls = (body.proof_urls as string[]) || []

    console.log('[complete-api] id:', id, 'proofUrls:', proofUrls.length)

    if (!id) {
      return NextResponse.json({ success: false, error: 'id 缺失' }, { status: 400 })
    }

    const proofValue = proofUrls.length > 0 ? JSON.stringify(proofUrls) : null

    const { data, error } = await supabase
      .from('homework')
      .update({ is_completed: true, proof_image: proofValue, completed_at: new Date().toISOString() })
      .eq('id', id)
      .select()

    console.log('[complete-api] update id:', id, 'error:', error, 'rows:', data?.length)

    if (error) {
      return NextResponse.json({ success: false, error: 'DB 错误: ' + error.message }, { status: 500 })
    }
    if (!data || data.length === 0) {
      return NextResponse.json({ success: false, error: `作业 ${id} 未找到` }, { status: 404 })
    }

    return NextResponse.json({ success: true, updatedRow: data[0] })
  } catch (e: any) {
    console.error('[complete-api] fatal:', e)
    return NextResponse.json({ success: false, error: e.message || String(e) }, { status: 500 })
  }
}
