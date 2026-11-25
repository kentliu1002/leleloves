interface CallAIOptions {
  messages: any[]
  vision?: boolean
  temperature?: number
}

export async function callStudyAI({ messages, temperature = 0.3 }: CallAIOptions): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY || ''
  if (!apiKey) {
    throw new Error('请在 Vercel leleloves 项目的环境变量中配置 OPENAI_API_KEY')
  }

  const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '')
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 50000)

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages,
        temperature
      }),
      signal: ctrl.signal
    })
    clearTimeout(timer)

    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      console.error(`[study-openai] HTTP ${res.status}: ${errBody.slice(0, 300)}`)
      throw new Error(`OpenAI 请求失败 (HTTP ${res.status})`)
    }

    const data = await res.json()
    const content = String(data?.choices?.[0]?.message?.content || '').trim()
    if (!content) {
      throw new Error('OpenAI 返回内容为空')
    }
    return content
  } catch (e: any) {
    clearTimeout(timer)
    if (e?.name === 'AbortError') {
      throw new Error('OpenAI 响应超时，请稍后重试')
    }
    throw e
  }
}
