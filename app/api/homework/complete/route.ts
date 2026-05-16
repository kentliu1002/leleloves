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
    const formData = await request.formData()
    const id = formData.get('id') as string
    const files = formData.getAll('file') as File[]

    console.log('[complete-api] id:', id, 'fileCount:', files.length,
      'sizes:', files.map(f => f && f.size ? `${f.name}=${(f.size / 1024).toFixed(0)}KB` : 'empty').join(','))

    if (!id) {
      return NextResponse.json({ success: false, error: 'id 缺失' }, { status: 400 })
    }

    const proofUrls: string[] = []
    for (const file of files) {
      if (file && file.size > 0) {
        const fileExt = file.name.split('.').pop() || 'png'
        const fileName = `proof-${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`
        const { error: uploadError } = await supabase.storage.from('attachments').upload(fileName, file)
        if (uploadError) {
          return NextResponse.json({ success: false, error: '图片上传失败: ' + uploadError.message }, { status: 500 })
        }
        const { data: publicUrlData } = supabase.storage.from('attachments').getPublicUrl(fileName)
        proofUrls.push(publicUrlData.publicUrl)
      }
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
