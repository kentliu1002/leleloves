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
      text: `你是一位认真严谨的小学老师助手，正在批改一份学生的作业。

【老师布置的作业内容】
${hw.content}

【学生的作业照片】共${imageUrls.length}张，已附在下方。

请按以下严格步骤思考并输出。不要使用 Markdown（不要用 #、*、**、- 等符号），也不要输出"步骤一""步骤二"等字样。

第一步【内部观察，不要输出】：仔细看图，识别出每一道题的题号、题目内容、学生写的答案。
第二步【内部判断，不要输出】：对每一道你能看清的题目，逐题判断对错——
  - 数学题：必须在心里列出算式或推理过程，确认答案是否正确。
  - 语文题（字词/拼音/造句）：核对每个字、拼音、句子结构。
  - 如果某题你看不清或不确定，归类为"不确定"，绝对不要乱判。
第三步【正式输出】：按以下三段格式回复给学生和家长：

1. 完成情况
用一两句话说明学生是否完成了老师布置的全部内容（比如"按要求完成了全部 5 道题"或"只完成了前 3 题"）。

2. 错题分析
对你看清且确定的错题，逐题列出："第X题：学生写的答案是 ___，正确答案应该是 ___，原因是 ___"。
对你不确定的题目，说明："第X题照片不太清楚，建议家长确认"。
如果全部正确，明确写"所有题目都做对了"。

3. 表扬与建议
指出做得好的具体地方（比如"字迹工整""步骤清晰"），并给出一条针对性的改进建议。

语气友好但要专业准确。宁可说"不确定"，也不要瞎猜对错。`
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
    body: JSON.stringify({
      model: 'qwen-vl-max-latest',  // 阿里旗舰视觉模型，比 qwen3.5-plus 视觉模式推理更强
      messages: [{ role: 'user', content }],
      temperature: 0.1               // 降低随机性，减少瞎猜
    })
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
