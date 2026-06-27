import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { waitUntil } from '@vercel/functions'

export const runtime = 'nodejs'
export const maxDuration = 300   // 后台 waitUntil 跑 AI 分析需存活到分析完成

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

    // 打卡成功后自动后台触发 AI 分析（仅当有照片）。
    // waitUntil 保证响应返回后后台任务继续执行不被回收。
    // 自调 analyze 接口复用其压缩+重试逻辑；学生端无需等待，结果稍后自动出现。
    // 录音作业（submit_type=audio）只提交不批改，跳过 AI 分析。
    const isAudioSubmit = data[0]?.submit_type === 'audio'
    if (proofUrls.length > 0 && !isAudioSubmit) {
      const origin = new URL(request.url).origin
      waitUntil(
        fetch(`${origin}/api/homework/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id })
        }).then(r => console.log('[complete-api] auto-analyze triggered:', r.status))
          .catch(e => console.error('[complete-api] auto-analyze failed:', e?.message))
      )
    }

    return NextResponse.json({ success: true, updatedRow: data[0] })
  } catch (e: any) {
    console.error('[complete-api] fatal:', e)
    return NextResponse.json({ success: false, error: e.message || String(e) }, { status: 500 })
  }
}
