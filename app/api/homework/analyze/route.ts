import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  const { id } = await request.json()

  const { data: hw, error } = await supabase
    .from('homework').select('*').eq('id', id).single()
  if (error || !hw) return NextResponse.json({ error: '作业不存在', detail: error?.message }, { status: 404 })

  if (hw.ai_feedback) return NextResponse.json({ feedback: hw.ai_feedback })

  let imageUrls: string[] = []
  try { imageUrls = JSON.parse(hw.proof_image || '[]') }
  catch { if (hw.proof_image) imageUrls = [hw.proof_image] }
  if (imageUrls.length === 0)
    return NextResponse.json({ error: '没有打卡照片可供分析' }, { status: 400 })

  const content: any[] = [
    {
      type: 'text',
      text: `你是一位认真负责的小学老师助手。以下是布置给学生的作业：\n\n【作业内容】${hw.content}\n\n学生已完成打卡，以下是学生的作业照片（共${imageUrls.length}张）。请仔细分析：\n1. 学生是否完成了全部作业？\n2. 哪些题目或内容有错误？请明确指出并解释原因。\n3. 哪些地方完成得好？\n\n请用简洁清晰的中文回复，方便学生和家长阅读。如果照片模糊看不清，请说明。`
    },
    ...imageUrls.map((url: string) => ({ type: 'image_url', image_url: { url } }))
  ]

  const aiRes = await fetch('https://coding.dashscope.aliyuncs.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.DASHSCOPE_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ model: 'qwen-vl-plus', messages: [{ role: 'user', content }] })
  })
  const aiData = await aiRes.json()
  const feedback = aiData.choices?.[0]?.message?.content || 'AI 分析失败，请稍后重试'

  await supabase.from('homework').update({ ai_feedback: feedback }).eq('id', id)

  return NextResponse.json({ feedback })
}
