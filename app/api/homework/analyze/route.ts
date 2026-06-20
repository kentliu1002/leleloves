import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'

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

// 下载图片 → sharp 压缩 → base64 内联。
// 1) 豆包国内拉海外 Supabase 图常超时，改由 Vercel（香港，离 Supabase 近）下载内联
// 2) 关键：压缩到 1600px / JPEG76，请求体从 ~1MB 降到 ~350KB，
//    大幅减少香港→火山北京跨境上传量，降低超时概率
async function toDataUrl(url: string, count: number = 1): Promise<string | null> {
  // 图越多压越狠，控制香港→火山北京跨境总请求体（多图大 body 易在传输中被重置）
  const dim = count >= 3 ? 900 : count === 2 ? 1024 : 1600
  const q = count >= 3 ? 66 : count === 2 ? 70 : 76
  try {
    const r = await fetch(url)
    if (!r.ok) return null
    const input = Buffer.from(await r.arrayBuffer())
    try {
      const out = await sharp(input)
        .rotate()  // 按 EXIF 自动转正
        .resize(dim, dim, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: q })
        .toBuffer()
      return `data:image/jpeg;base64,${out.toString('base64')}`
    } catch {
      // sharp 失败（极少）回退原图
      const mime = r.headers.get('content-type') || 'image/jpeg'
      return `data:${mime};base64,${input.toString('base64')}`
    }
  } catch {
    return null
  }
}

// 同步执行分析，返回 feedback 文本或 null（失败）
async function runAnalysis(content: string, proofImage: string | null): Promise<string | null> {
  let imageUrls: string[] = []
  try { imageUrls = JSON.parse(proofImage || '[]') }
  catch { if (proofImage) imageUrls = [proofImage] }
  if (imageUrls.length === 0) return null

  // 下载所有图片转 base64（并发），按图片数动态压缩，过滤失败的
  const dataUrls = (await Promise.all(
    imageUrls.map(u => toDataUrl(u, imageUrls.length))
  )).filter(Boolean) as string[]
  if (dataUrls.length === 0) return null

  const aiContent: any[] = [
    {
      type: 'text',
      text: `你是一位认真严谨的小学老师助手，正在批改一份学生的作业。

【老师布置的作业内容】
${content}

【学生的作业照片】共${imageUrls.length}张。

=== 第一阶段：精确转写（这部分只在你心里完成，绝对不要输出）===
逐题在心里转写你看到的内容，手写字识别要尽可能准确：
A. 在心里记下每道题的原题（老师印刷的题目/算式/填空）和学生手写的答案。
B. 数字识别尤其重要：0 vs 6 vs 9 vs 8 看封口；1 vs 7 看顶部横笔；2 vs Z 看曲度；小数点位置必须看清。
C. 对每个不确定的手写字符，在心里标记多种可能（如可能是 6 或 0）。
D. 看不清整道题就在心里归为"无法识别"，不要瞎猜。

注意：第一阶段的转写内容绝对不要出现在你的回复里，它只是你判断的依据。

=== 第二阶段：批改判断（这才是你要输出的内容）===
基于心里的转写，逐题判对错。不要使用 Markdown（不要用 #、*、**、- 等符号）。
直接从"1. 完成情况"开始输出，只输出下面两段，不要任何前言或转写过程：

1. 完成情况
一两句话说明是否完成了全部内容。

2. 错题分析
对确定的错题，按格式列出："第X题：学生写___，正确应该___，原因是___"。
对识别有歧义的题（你心里不确定那个手写字符），写："第X题学生答案可能是 ___ 或 ___，请家长核对原卷"。
对不清晰无法识别的题，写："第X题照片不清楚，建议家长直接看原卷"。
如全部正确，明确写"所有题目都做对了"。

宁可说"不确定/请家长核对"也不要瞎判对错。识别错误造成的误判比说不确定更严重。`
    },
    ...dataUrls.map((url: string) => ({ type: 'image_url', image_url: { url } }))
  ]

  // 调 AI：4 次重试 + 每次 70s 单次超时 + 退避，缓解香港→火山北京跨境抖动。
  // 最坏 4×70 + 退避 ≈ 286s，控制在 maxDuration 300s 内。
  const body = JSON.stringify({
    model: 'doubao-seed-2.0-pro',
    messages: [{ role: 'user', content: aiContent }],
    temperature: 0.1
  })
  let aiRes: Response | null = null
  for (let attempt = 1; attempt <= 4; attempt++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 70000)
    try {
      const t0 = Date.now()
      aiRes = await fetch('https://ark.cn-beijing.volces.com/api/coding/v3/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.ARK_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body,
        signal: ctrl.signal
      })
      clearTimeout(timer)
      console.error(`[analyze] attempt ${attempt} status=${aiRes.status} in ${Date.now() - t0}ms`)
      if (aiRes.ok) break
      aiRes = null
    } catch (e: any) {
      clearTimeout(timer)
      console.error(`[analyze] attempt ${attempt} failed:`, e?.name === 'AbortError' ? 'timeout(70s)' : e?.message)
    }
    if (attempt < 4) await new Promise(r => setTimeout(r, 1000 * attempt))
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
