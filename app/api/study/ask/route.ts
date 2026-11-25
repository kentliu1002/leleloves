import { NextResponse } from 'next/server'
import { callStudyAI } from '../_ai'

export const runtime = 'nodejs'
export const preferredRegion = 'sin1'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

function cleanText(text: string): string {
  return text
    .replace(/#{1,6}\s*/g, '')
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export async function POST(request: Request) {
  try {
    const requiredCode = process.env.STUDY_ACCESS_CODE
    if (requiredCode) {
      const provided = request.headers.get('x-access-code') || ''
      if (provided !== requiredCode) {
        return NextResponse.json({ error: '访问码不正确，请在「我的 → 设置」核对' }, { status: 401 })
      }
    }

    const body = await request.json()
    const question = String(body?.question || '').trim()
    const ctx = body?.context || null

    if (!question) {
      return NextResponse.json({ error: '请先输入你的问题哦' }, { status: 400 })
    }
    if (question.length > 500) {
      return NextResponse.json({ error: '问题太长啦，请精简到 500 字以内' }, { status: 400 })
    }

    const contextBlock = ctx
      ? `\n【当前正在复习的知识点】\n科目：${ctx.subjectName || '初中学科'}\n题目：${ctx.prompt || ''}\n标准答案：${ctx.answer || ''}\n补充要点：${ctx.note || ''}\n`
      : ''

    const systemPrompt = `你是「Ponyo」，一位温柔、聪明、说话简洁清晰的初中学习搭子，专门辅导一位初中女生（Qiqi）复习功课。

回答要求：
1. 控制在 150 字以内，不要长篇大论，不要用 Markdown 符号（不要 #、**、*）。
2. 严格按中国初中课本和考纲解释，绝不超纲。
3. 先用 1~2 句生活化或直观的语言讲清“为什么”，最后附 1 句好记的「💡 记法：...」。
4. 化学式和角标尽量用 Unicode 上下标（如 H₂O、CO₂、Fe²⁺、Fe³⁺、↑、↓）。
5. 如果问题与学习无关，礼貌引导回到复习内容。`

    const raw = await callStudyAI({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `${contextBlock}学生提问：${question}` }
      ],
      vision: false,
      temperature: 0.35
    })

    return NextResponse.json({ answer: cleanText(raw) })
  } catch (e: any) {
    console.error('[study/ask] error:', e?.message)
    return NextResponse.json({ error: e?.message || '服务异常' }, { status: 502 })
  }
}
