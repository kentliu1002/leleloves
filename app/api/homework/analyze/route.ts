import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 300   // Vercel 现所有计划支持 300s；单次视觉分析约 40-60s
export const dynamic = 'force-dynamic'

const PROCESSING = '__PROCESSING__'

function cleanMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s*/g, '')
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^[\*\-]\s+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// 同步执行分析，返回 feedback 文本或 null（失败）
async function runAnalysis(content: string, proofImage: string | null): Promise<string | null> {
  let imageUrls: string[] = []
  try { imageUrls = JSON.parse(proofImage || '[]') }
  catch { if (proofImage) imageUrls = [proofImage] }
  if (imageUrls.length === 0) return null

  const aiContent: any[] = [
    {
      type: 'text',
      text: `你是一位认真严谨的小学老师助手，正在批改一份学生的作业。请按"先转写、再判断"两段式严格执行。

【老师布置的作业内容】
${content}

【学生的作业照片】共${imageUrls.length}张。

=== 第一阶段：精确转写（输出）===
逐题转写你在照片里看到的内容。手写字识别要尽可能准确，遵守以下规则：

A. 每道题分两行：
   第X题原题：[完整抄写老师印刷的题目文字 / 算式 / 填空格式]
   第X题学生答案：[完整抄写学生手写的答案，原样保留数字、符号、英文、错别字]

B. 对每个不确定的手写字符，用 [?字符1/字符2] 标记可能性。
   例如学生写的可能是 6 或 0：转写为 "[?6/0]"
   例如学生写的英文可能是 cat 或 cot：转写为 "[?cat/cot]"

C. 数字识别尤其重要：
   - 0 vs 6 vs 9 vs 8 容易混 → 仔细看封口
   - 1 vs 7 → 看顶部横笔
   - 2 vs Z 看曲度
   - 小数点位置必须看清

D. 看不清整道题就标注"该题照片模糊，无法识别"，不要瞎猜。

E. 如果照片角度倾斜、被遮挡，明确说明。

=== 第二阶段：批改判断（输出）===
基于第一阶段的转写，逐题判对错。不要使用 Markdown（不要用 #、*、**、- 等符号）。

输出格式分两段：

1. 完成情况
一两句话说明是否完成了全部内容。

2. 错题分析
对确定的错题，按格式列出："第X题：学生写___，正确应该___，原因是___"。
对存在歧义识别（含 [?...] 标记）的题，写："第X题学生答案可能是 ___ 或 ___，请家长核对原卷"。
对不清晰无法识别的题，写："第X题照片不清楚，建议家长直接看原卷"。
如全部正确，明确写"所有题目都做对了"。

宁可说"不确定/请家长核对"也不要瞎判对错。识别错误造成的误判比说不确定更严重。`
    },
    ...imageUrls.map((url: string) => ({ type: 'image_url', image_url: { url } }))
  ]

  // 调 AI（3 次重试，缓解 HK→阿里云网络抖动）
  let aiRes: Response | null = null
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      aiRes = await fetch('https://coding.dashscope.aliyuncs.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.DASHSCOPE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'qwen3.5-plus',
          messages: [{ role: 'user', content: aiContent }],
          temperature: 0.1
        })
      })
      if (aiRes.ok) break
      console.error('[analyze] AI HTTP', aiRes.status, 'attempt', attempt)
      aiRes = null
    } catch (e: any) {
      console.error('[analyze] fetch failed attempt', attempt, e?.message)
      if (attempt < 3) await new Promise(r => setTimeout(r, 500 * attempt))
    }
  }
  if (!aiRes) return null

  const data = await aiRes.json()
  const raw = data.choices?.[0]?.message?.content
  if (!raw) return null
  return cleanMarkdown(raw)
}

// POST: 同步分析，直接返回 feedback
export async function POST(request: Request) {
  try {
    const { id } = await request.json()
    const { data: hw, error } = await supabase
      .from('homework').select('id, content, proof_image, ai_feedback').eq('id', id).single()
    if (error || !hw) return NextResponse.json({ error: '作业不存在' }, { status: 404 })

    // 已有有效结果直接返回（忽略 PROCESSING 残留）
    if (hw.ai_feedback && hw.ai_feedback !== PROCESSING) {
      return NextResponse.json({ feedback: hw.ai_feedback })
    }

    const feedback = await runAnalysis(hw.content, hw.proof_image)
    if (!feedback) {
      // 清除任何 PROCESSING 残留，允许重试
      await supabase.from('homework').update({ ai_feedback: null }).eq('id', id)
      return NextResponse.json({ error: 'AI 分析失败，请稍后重试' }, { status: 502 })
    }

    await supabase.from('homework').update({ ai_feedback: feedback }).eq('id', id)
    return NextResponse.json({ feedback })
  } catch (e: any) {
    console.error('[analyze] POST error:', e?.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// GET: 兼容网页端轮询，直接返回当前状态
export async function GET(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: '缺 id' }, { status: 400 })
    const { data: hw, error } = await supabase
      .from('homework').select('ai_feedback').eq('id', id).single()
    if (error || !hw) return NextResponse.json({ error: '作业不存在' }, { status: 404 })
    if (hw.ai_feedback && hw.ai_feedback !== PROCESSING) {
      return NextResponse.json({ feedback: hw.ai_feedback })
    }
    return NextResponse.json({ pending: false })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
