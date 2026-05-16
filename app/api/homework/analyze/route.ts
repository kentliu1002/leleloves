import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 60   // 视觉模型慢，给到 Vercel 函数最大 60s

function cleanMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s*/g, '')           // 去掉 ### 标题符
    .replace(/\*\*([^*]*)\*\*/g, '$1')   // **加粗** → 普通文字
    .replace(/\*([^*]+)\*/g, '$1')       // *斜体* → 普通文字
    .replace(/^[\*\-]\s+/gm, '• ')       // * / - 列表 → •
    .replace(/\n{3,}/g, '\n\n')          // 多余空行合并为一行
    .trim()
}

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
      text: `你是一位认真负责的小学老师助手。以下是布置给学生的作业：\n\n【作业内容】${hw.content}\n\n学生已完成打卡，以下是学生的作业照片（共${imageUrls.length}张）。请仔细分析并按以下格式回复，不要使用任何Markdown格式（不要用#、*、**、- 等符号）：\n\n1. 完成情况\n说明学生是否完成了全部作业内容。\n\n2. 错题分析\n如有错误，指出题号和错误原因；如无错误，请说明。\n\n3. 表扬与建议\n指出做得好的地方，并给出一条具体建议。\n\n语气友好简洁，方便学生和家长阅读。如果照片模糊看不清，请说明。`
    },
    ...imageUrls.map((url: string) => ({ type: 'image_url', image_url: { url } }))
  ]

  const t0 = Date.now()
  const aiRes = await fetch('https://coding.dashscope.aliyuncs.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.DASHSCOPE_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ model: 'qwen3.5-plus', messages: [{ role: 'user', content }] })
  })
  const t1 = Date.now()
  const aiData = await aiRes.json()
  const t2 = Date.now()
  console.log(`[analyze] images=${imageUrls.length} ai_fetch=${t1-t0}ms parse=${t2-t1}ms total=${t2-t0}ms`)

  const raw = aiData.choices?.[0]?.message?.content || 'AI 分析失败，请稍后重试'
  const feedback = cleanMarkdown(raw)

  await supabase.from('homework').update({ ai_feedback: feedback }).eq('id', id)

  return NextResponse.json({ feedback })
}
