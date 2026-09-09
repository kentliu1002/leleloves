import sharp from 'sharp'
import { randomUUID } from 'node:crypto'
import { parseReview, formatReview, reconcileReviews, isUsableFeedback, REVIEW_PROMPT } from './ai-feedback.mjs'

const ENDPOINTS = ['https://ark.cn-beijing.volces.com/api/coding/v3/chat/completions']

async function askAI(apiKey, prompt, urls, timeout, deadline) {
  const body = JSON.stringify({
    model: 'doubao-seed-2.0-pro',
    messages: [{ role: 'user', content: [
      { type: 'text', text: prompt },
      ...urls.map(url => ({ type: 'image_url', image_url: { url } }))
    ] }],
    temperature: 0.1,
    thinking: { type: 'disabled' },
    response_format: { type: 'json_object' },
    max_tokens: 1500
  })
  let lastError
  for (const endpoint of ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(Math.max(1, Math.min(timeout, deadline - Date.now())))
      })
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 300)
        throw new Error(`HTTP ${response.status}: ${detail}`)
      }
      return await response.json()
    } catch (error) {
      lastError = error
      console.error('[analyze] AI endpoint failed:', new URL(endpoint).host, error.message, error.cause?.code || '')
    }
  }
  throw new Error('AI 服务暂不可用，请稍后重试', { cause: lastError })
}

async function askForReview(apiKey, prompt, url, deadline) {
  let lastError
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return parseReview(await askAI(apiKey, prompt, [url], 70000, deadline))
    } catch (error) {
      lastError = error
      if (Date.now() >= deadline) break
    }
  }
  throw lastError
}

async function askForAllReviews(requests) {
  const outcomes = await Promise.allSettled(requests)
  const failed = outcomes.find(outcome => outcome.status === 'rejected')
  if (failed) throw failed.reason
  return outcomes.map(outcome => outcome.value)
}

export async function runAnalysis(content, proofImage, supabase, apiKey) {
  const deadline = Date.now() + 240000
  let urls
  try { urls = JSON.parse(proofImage || '[]') }
  catch { urls = proofImage ? [proofImage] : [] }
  if (!Array.isArray(urls)) urls = [urls]
  if (!urls.length || urls.some(u => typeof u !== 'string' || !/^https:\/\//.test(u))) {
    throw new Error('请先上传清晰的作业照片')
  }
  const bucket = supabase.storage.from('attachments')
  const temporary = []
  try {
    // EXIF first; URL payloads keep the cross-border AI request small.
    const inputs = await Promise.all(urls.map(async url => {
      const response = await fetch(url, { signal: AbortSignal.timeout(20000) })
      if (!response.ok) throw new Error('作业照片下载失败，请重试')
      return sharp(Buffer.from(await response.arrayBuffer())).rotate().resize(2048, 2048, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer()
    }))
    const upload = async buffer => {
      if (Date.now() >= deadline) throw new Error('批改用时过长，请重试')
      const name = `ai-review/${randomUUID()}.jpg`
      const { error } = await bucket.upload(name, buffer, { contentType: 'image/jpeg' })
      if (error) throw new Error('作业照片预处理失败，请重试')
      temporary.push(name)
      return bucket.getPublicUrl(name).data.publicUrl
    }
    const sections = []
    for (const buffer of inputs) {
      const metadata = await sharp(buffer).metadata()
      const rotation = metadata.width > metadata.height ? 90 : 0
      const upright = await sharp(buffer).rotate(rotation).jpeg({ quality: 90 }).toBuffer()
      const uprightMeta = await sharp(upright).metadata()
      const overlap = Math.round(uprightMeta.height * 0.08)
      const half = Math.ceil(uprightMeta.height / 2)
      const top = await sharp(upright).extract({ left: 0, top: 0, width: uprightMeta.width, height: Math.min(uprightMeta.height, half + overlap) }).toBuffer()
      const bottomTop = Math.max(0, half - overlap)
      const bottom = await sharp(upright).extract({ left: 0, top: bottomTop, width: uprightMeta.width, height: uprightMeta.height - bottomTop }).toBuffer()
      sections.push(await upload(top), await upload(bottom))
    }
    const prompt = `${REVIEW_PROMPT}\n图片是试卷的一个局部，只核对图中完整可见的题；边缘被截断的题不要列出。\n作业要求：${content}`
    const first = await askForAllReviews(sections.map(url => askForReview(apiKey, prompt, url, deadline)))
    const checked = await askForAllReviews(sections.map((url, index) => askForReview(apiKey,
      `${prompt}\n请独立重新核对图片，再审查以下候选结论（它可能有识别或计算错误，不可直接照抄）。删掉误判；识别不确定的移入uncertain。只返回相同格式的最终JSON。\n候选结论：${JSON.stringify(first[index])}`,
      url, deadline)))
    const combined = { summary: '已完成作业核对。', errors: [], uncertain: [] }
    for (const [index, review] of checked.entries()) {
      const reconciled = reconcileReviews(first[index], review)
      combined.errors.push(...reconciled.errors)
      combined.uncertain.push(...reconciled.uncertain)
    }
    const unique = list => [...new Map(list.map(item => [item.question, item])).values()]
    combined.errors = unique(combined.errors)
    combined.uncertain = unique(combined.uncertain).filter(item => !combined.errors.some(error => error.question === item.question))
    const feedback = formatReview(combined)
    if (!isUsableFeedback(feedback)) throw new Error('AI 批改未通过质量检查，请重试')
    return feedback
  } finally {
    if (temporary.length) {
      try {
        const { error } = await bucket.remove(temporary)
        if (error) console.error('[analyze] temporary image cleanup failed:', error.message)
      } catch (error) {
        console.error('[analyze] temporary image cleanup failed:', error.message)
      }
    }
  }
}
