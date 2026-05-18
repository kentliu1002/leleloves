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
      await supabase.from('homework').update({ ai_feedback: null, ai_started_at: null }).eq('id', hwId)
      return
    }

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
      await supabase.from('homework').update({ ai_feedback: null, ai_started_at: null }).eq('id', hwId)
      return
    }

    const data = await aiRes.json()
    const raw = data.choices?.[0]?.message?.content
    if (!raw) {
      console.error('[analyze-bg] AI returned no content for', hwId)
      await supabase.from('homework').update({ ai_feedback: null, ai_started_at: null }).eq('id', hwId)
      return
    }

    const feedback = cleanMarkdown(raw)
    await supabase.from('homework').update({ ai_feedback: feedback, ai_started_at: null }).eq('id', hwId)
    console.log('[analyze-bg] done', hwId, 'len', feedback.length)
  } catch (e: any) {
    console.error('[analyze-bg] uncaught for', hwId, ':', e?.message)
    await supabase.from('homework').update({ ai_feedback: null, ai_started_at: null }).eq('id', hwId).catch(() => {})
  }
}

const STALE_MINUTES = 5  // PROCESSING 超过这个分钟数视为僵死

// 检查并清理僵死的 PROCESSING：返回最新状态
async function unstickIfStale(id: string, ai_feedback: string | null, ai_started_at: string | null) {
  if (ai_feedback !== PROCESSING) return ai_feedback
  if (!ai_started_at) {
    // 异常：处于 PROCESSING 但没有起始时间，直接清掉
    await supabase.from('homework').update({ ai_feedback: null }).eq('id', id)
    return null
  }
  const ageMin = (Date.now() - new Date(ai_started_at).getTime()) / 60000
  if (ageMin > STALE_MINUTES) {
    await supabase.from('homework').update({ ai_feedback: null, ai_started_at: null }).eq('id', id)
    return null
  }
  return PROCESSING
}

// POST: 触发分析（异步），立即返回
export async function POST(request: Request) {
  try {
    const { id } = await request.json()
    const { data: hw, error } = await supabase
      .from('homework').select('id, content, proof_image, ai_feedback, ai_started_at').eq('id', id).single()
    if (error || !hw) return NextResponse.json({ error: '作业不存在' }, { status: 404 })

    const currentFb = await unstickIfStale(id, hw.ai_feedback, hw.ai_started_at)

    // 已有结果直接返回
    if (currentFb && currentFb !== PROCESSING) {
      return NextResponse.json({ feedback: currentFb })
    }
    // 仍在合理时间内的分析中
    if (currentFb === PROCESSING) {
      return NextResponse.json({ pending: true })
    }

    // 标记为分析中 + 记录起始时间
    await supabase.from('homework')
      .update({ ai_feedback: PROCESSING, ai_started_at: new Date().toISOString() })
      .eq('id', id)

    // 触发后台任务（不 await）
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
      .from('homework').select('ai_feedback, ai_started_at').eq('id', id).single()
    if (error || !hw) return NextResponse.json({ error: '作业不存在' }, { status: 404 })

    const currentFb = await unstickIfStale(id, hw.ai_feedback, hw.ai_started_at)

    if (currentFb === PROCESSING) return NextResponse.json({ pending: true })
    if (currentFb) return NextResponse.json({ feedback: currentFb })
    return NextResponse.json({ pending: false })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
