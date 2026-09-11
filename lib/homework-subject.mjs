const subjects = ['语文', '数学', '英语', '科学', '历史', '地理', '政治']

export function subjectFromText(text) {
  const matches = subjects.filter(subject => text.includes(subject))
  if (matches.length === 1) return matches[0]
  if (matches.length > 1) return '其它'
  if (/习作|大作文纸|生字|日积月累/.test(text)) return '语文'
  return '其它'
}

export async function recognizeSubject({ text = '', filename = '', imageUrl, apiKey }, request = fetch) {
  const fallback = subjectFromText(`${filename} ${text}`)
  if (!imageUrl && fallback !== '其它') return fallback
  if (!apiKey) return fallback
  const prompt = `判断作业学科，只输出以下一个词：${subjects.join('、')}、其它。文件名：${filename}。作业内容：${text}`
  const content = imageUrl ? [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: imageUrl } }] : prompt
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await request('https://ark.cn-beijing.volces.com/api/coding/v3/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({ model: 'doubao-seed-2.0-pro', messages: [{ role: 'user', content }], thinking: { type: 'disabled' }, max_tokens: 32 })
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()
      const result = data.choices?.[0]?.message?.content?.trim()
      if (![...subjects, '其它'].includes(result)) throw new Error('Invalid subject response')
      return result === '其它' ? fallback : result
    } catch (error) {
      console.error(`[subject] attempt ${attempt + 1} failed:`, error.message)
    }
  }
  return fallback
}
