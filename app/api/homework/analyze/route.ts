import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 60
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

// 重型分析工作（不被请求超时限制——通过 Vercel 后台任务延续）
async function runAnalysis(hwId: string, content: string, proofImage: string | null) {
  try {
    let imageUrls: string[] = []
    try { imageUrls = JSON.parse(proofImage || '[]') }
    catch { if (proofImage) imageUrls = [proofImage] }
    if (imageUrls.length === 0) {
      await supabase.from('homework').update({ ai_feedback: null }).eq('id', hwId)
      return
    }

    const aiContent: any[] = [
      {
        type: 'text',
        text: `你是一位认真严谨的小学老师助手，正在批改一份学生的作业。

【老师布置的作业内容】
${content}

【学生的作业照片】共${imageUrls.length}张。

请按以下严格步骤思考并输出。不要使用 Markdown（不要用 #、*、**、- 等符号）。

第一步【内部观察】：识别每道题的题号、题目内容、学生答案。
第二步【内部判断】：逐题判断对错。数学题在心里走一遍算式；语文题核对字词。看不清的归"不确定"。
第三步【正式输出】两段：

1. 完成情况
一两句话说明是否完成了全部内容。

2. 错题分析
对确定的错题，列出"第X题：学生写___，正确应该___，原因是___"。
不确定的题写"第X题照片不清，建议确认"。全对则写"所有题目都做对了"。

宁可说"不确定"也不要瞎猜。`
      },
      ...imageUrls.map((url: string) => ({ type: 'image_url', image_url: { url } }))
    ]

    // 调 AI（3 次重试）
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
        aiRes = null
      } catch (e) {
        if (attempt < 3) await new Promise(r => setTimeout(r, 500 * attempt))
      }
    }

    if (!aiRes) {
      console.error('[analyze-bg] AI all 3 retries failed for', hwId)
      await supabase.from('homework').update({ ai_feedback: null }).eq('id', hwId)
      return
    }

    const data = await aiRes.json()
    const raw = data.choices?.[0]?.message?.content
    if (!raw) {
      console.error('[analyze-bg] AI returned no content for', hwId)
      await supabase.from('homework').update({ ai_feedback: null }).eq('id', hwId)
      return
    }

    const feedback = cleanMarkdown(raw)
    await supabase.from('homework').update({ ai_feedback: feedback }).eq('id', hwId)
    console.log('[analyze-bg] done', hwId, 'len', feedback.length)
  } catch (e: any) {
    console.error('[analyze-bg] uncaught for', hwId, ':', e?.message)
    await supabase.from('homework').update({ ai_feedback: null }).eq('id', hwId).catch(() => {})
  }
}

// POST: 触发分析（异步），立即返回
export async function POST(request: Request) {
  try {
    const { id } = await request.json()
    const { data: hw, error } = await supabase
      .from('homework').select('id, content, proof_image, ai_feedback').eq('id', id).single()
    if (error || !hw) return NextResponse.json({ error: '作业不存在' }, { status: 404 })

    // 已有结果直接返回
    if (hw.ai_feedback && hw.ai_feedback !== PROCESSING) {
      return NextResponse.json({ feedback: hw.ai_feedback })
    }
    // 正在分析中
    if (hw.ai_feedback === PROCESSING) {
      return NextResponse.json({ pending: true })
    }

    // 标记为分析中
    await supabase.from('homework').update({ ai_feedback: PROCESSING }).eq('id', id)

    // 触发后台任务（不 await，函数立即返回 pending）
    runAnalysis(id, hw.content, hw.proof_image)

    return NextResponse.json({ pending: true })
  } catch (e: any) {
    console.error('[analyze] POST error:', e?.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// GET: 查询状态（前端轮询用）
export async function GET(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: '缺 id' }, { status: 400 })
    const { data: hw, error } = await supabase
      .from('homework').select('ai_feedback').eq('id', id).single()
    if (error || !hw) return NextResponse.json({ error: '作业不存在' }, { status: 404 })

    if (hw.ai_feedback === PROCESSING) return NextResponse.json({ pending: true })
    if (hw.ai_feedback) return NextResponse.json({ feedback: hw.ai_feedback })
    return NextResponse.json({ pending: false })  // 未触发或失败
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
