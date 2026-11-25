import { NextResponse } from 'next/server'
import sharp from 'sharp'
import { callStudyAI } from '../_ai'

export const runtime = 'nodejs'
export const preferredRegion = 'sin1'
export const maxDuration = 180
export const dynamic = 'force-dynamic'

const SUBJECT_MAP: Record<string, string> = {
  化学: 'chemistry',
  初中化学: 'chemistry',
  物理: 'physics',
  初中物理: 'physics',
  数学: 'math',
  初中数学: 'math',
  英语: 'english',
  初中英语: 'english',
  语文: 'chinese',
  初中语文: 'chinese',
  生物: 'biology',
  初中生物: 'biology',
  历史: 'history',
  初中历史: 'history',
  地理: 'geography',
  初中地理: 'geography',
  道法: 'politics',
  道德与法治: 'politics',
  政治: 'politics'
}

async function compressBase64Image(rawBase64: string): Promise<string> {
  const cleaned = rawBase64.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '')
  const buf = Buffer.from(cleaned, 'base64')
  try {
    const out = await sharp(buf)
      .rotate()
      .resize(1500, 1500, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 76 })
      .toBuffer()
    return `data:image/jpeg;base64,${out.toString('base64')}`
  } catch {
    return `data:image/jpeg;base64,${cleaned}`
  }
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
    const rawText = String(body?.text || '').trim()
    const imageBase64 = String(body?.imageBase64 || '').trim()

    if (!rawText && !imageBase64) {
      return NextResponse.json({ error: '请拍照或输入要整理的知识点内容' }, { status: 400 })
    }

    const instruction = `你是「Ponyo」，一位专业的初中各科学习整理助手。
请把学生发来的复习讲义照片或笔记文字，整理成结构化的复习卡片 JSON。

严格要求：
1. 只输出纯 JSON，不要任何前言、解释或 Markdown 代码块。
2. 自动判断所属初中科目（subject 必须从以下 9 个之一选择：化学、物理、数学、英语、语文、生物、历史、地理、道法），并给出简洁的章节/专题名 sectionTitle。
3. 最多拆出 25 条最核心、可独立记忆的知识点 items。
4. 化学角标与符号请使用 Unicode（如 H₂O、CO₂、Cu²⁺、Fe³⁺、↑、↓、△）。
5. 如果是化学方程式，type 设为 "equation"，dictation 设为 true，必须提供 equation: { left, condition, right }；其他知识点 type 设为 "card"。
6. 每条卡片都要附带：prompt、answerLines（字符串数组）、hint、mnemonic（1 句 Ponyo 口诀）、distractors（3 个四选一易错干扰项）、note（可选）。

输出 JSON 结构：
{"subject":"物理","sectionTitle":"第三章 光现象","items":[{"type":"card","important":true,"dictation":false,"prompt":"...","hint":"...","mnemonic":"...","answerLines":["..."],"distractors":["...","...","..."],"note":"..."}]}`

    const userContent: any = imageBase64
      ? [
          { type: 'text', text: rawText ? `${instruction}\n\n【学生提供的文字】\n${rawText}` : instruction },
          { type: 'image_url', image_url: { url: await compressBase64Image(imageBase64) } }
        ]
      : `${instruction}\n\n【学生提供的文字】\n${rawText}`

    const raw = await callStudyAI({
      messages: [{ role: 'user', content: userContent }],
      vision: Boolean(imageBase64),
      temperature: 0.2
    })

    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim()

    let parsed: any
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      const m = cleaned.match(/\{[\s\S]*\}/)
      if (!m) return NextResponse.json({ error: 'AI 返回格式无法解析，请重试' }, { status: 502 })
      parsed = JSON.parse(m[0])
    }

    const subject = String(parsed?.subject || '化学').trim()
    const subjectId = SUBJECT_MAP[subject] || 'chemistry'
    const sectionTitle = String(parsed?.sectionTitle || 'AI 整理专题').trim()
    const items = Array.isArray(parsed?.items) ? parsed.items.slice(0, 25) : []

    if (items.length === 0) {
      return NextResponse.json({ error: '没有识别出有效知识点，请换一张清晰的照片或补充文字' }, { status: 422 })
    }

    return NextResponse.json({ subject, subjectId, sectionTitle, items })
  } catch (e: any) {
    console.error('[study/organize] error:', e?.message)
    return NextResponse.json({ error: e?.message || '整理失败' }, { status: 502 })
  }
}
