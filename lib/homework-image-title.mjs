export const IMAGE_TITLE_PENDING = '图片作业（标题识别中）'

export function needsImageTitle({ content = '', fileType, files = [], contentProvided }) {
  if (fileType !== 'image' || files.some(file => file.type && file.type !== 'image')) return false
  if (typeof contentProvided === 'boolean') return !contentProvided
  return !content.trim() || /^(?:wx[-_]|mmexport|img[-_]|image[-_]|微信图片|截图|\d{10,})/i.test(content.trim())
}

export async function recognizeImageTitle({ imageUrl, apiKey, fallbackUrl, fallbackKey }, request = fetch) {
  if (!apiKey) throw new Error('图片标题识别服务不可用')
  const body = JSON.stringify({
    model: 'gpt-5.4-mini', reasoning_effort: 'none', max_completion_tokens: 100,
    messages: [{ role: 'user', content: [
      { type: 'text', text: '读取图片中的作业或试卷主要标题，仅输出标题原文，最多30个字；没有清晰标题时只输出“图片作业”。不要猜测或编造。' },
      { type: 'image_url', image_url: { url: imageUrl } }
    ] }]
  })
  const providers = [{ url: 'https://api.openai.com/v1/chat/completions', key: apiKey }]
  if (fallbackUrl && fallbackKey) providers.push({ url: fallbackUrl, key: fallbackKey })
  for (const provider of providers) {
    try {
      const response = await request(provider.url, { method: 'POST', headers: { Authorization: `Bearer ${provider.key}`, 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(15000) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const result = (await response.json()).choices?.[0]?.message?.content?.trim()
      if (result) return result.replace(/^[“"']|[”"']$/g, '').slice(0, 30)
    } catch (error) { console.error('[image-title] request failed:', error.message) }
  }
  throw new Error('图片标题识别服务暂时不可用')
}
