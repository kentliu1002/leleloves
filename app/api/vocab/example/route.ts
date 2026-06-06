import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 30
export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// 使用 qwen3.6-plus 生成一个适合小学生水平的简单例句 + 中文翻译
async function generateExample(word: string, meaning: string): Promise<{ en: string, zh: string }> {
  const prompt = `请为英语单词 "${word}" (${meaning}) 生成一个适合中国小学生水平的简单英语例句（10个单词以内，使用最基础的语法），并给出对应中文翻译。

严格按 JSON 格式返回，只输出 JSON 不要任何其他文字：
{"en":"英语例句", "zh":"中文翻译"}

要求：
- 例句必须包含目标单词 "${word}"
- 句子简单自然，符合小学生日常生活情景
- 中文翻译流畅准确`

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch('https://coding.dashscope.aliyuncs.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.DASHSCOPE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'qwen3.6-plus',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3
        })
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const raw = (data.choices?.[0]?.message?.content || '').trim()
      // 容错：去掉可能的 ```json 包裹
      const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
      const parsed = JSON.parse(cleaned)
      if (parsed.en && parsed.zh) return { en: parsed.en, zh: parsed.zh }
      throw new Error('AI 返回缺字段')
    } catch (e: any) {
      console.error(`[example] attempt ${attempt} failed:`, e?.message)
      if (attempt < 3) await new Promise(r => setTimeout(r, 500 * attempt))
    }
  }
  throw new Error('AI 生成例句失败（已重试3次）')
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const id = url.searchParams.get('id')
    if (!id) return NextResponse.json({ error: '缺 id 参数' }, { status: 400 })

    const { data: word, error } = await supabase
      .from('vocabulary').select('id, word, meaning_zh, example_en, example_zh')
      .eq('id', id).single()
    if (error || !word) return NextResponse.json({ error: '单词不存在' }, { status: 404 })

    // 已缓存直接返回
    if (word.example_en && word.example_zh) {
      return NextResponse.json({ en: word.example_en, zh: word.example_zh, cached: true })
    }

    // 生成 + 缓存
    const example = await generateExample(word.word, word.meaning_zh)
    await supabase.from('vocabulary')
      .update({ example_en: example.en, example_zh: example.zh })
      .eq('id', id)

    return NextResponse.json({ ...example, cached: false })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 })
  }
}
