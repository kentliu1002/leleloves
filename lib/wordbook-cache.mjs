export const WORDBOOK_AUDIO_CACHE = 'lele-wordbook-audio-v1'

export function audioUrls(units) {
  const words = units.flatMap(unit => unit.words)
  if (!words.length || words.some(word => !word.word_audio_url || !word.example_audio_url)) throw new Error('部分音频还未准备好，请稍后再试。')
  return [...new Set(words.flatMap(word => [word.word_audio_url, word.example_audio_url]))]
}

export async function downloadWordbookAudio(urls, cache, fetchAudio, onProgress) {
  let next = 0, completed = 0, failure
  const existing = await Promise.all(urls.map(url => cache.match(url)))
  completed = existing.filter(Boolean).length
  onProgress(completed, urls.length)
  async function worker() {
    while (!failure && next < urls.length) {
      const index = next++
      if (existing[index]) continue
      try {
        const response = await fetchAudio(urls[index])
        if (!response.ok) throw new Error('音频下载失败')
        await cache.put(urls[index], response)
        onProgress(++completed, urls.length)
      } catch (error) { failure = error }
    }
  }
  await Promise.all(Array.from({ length: 4 }, () => worker()))
  if (failure) throw failure
}

export const WORDBOOK_OFFLINE_CACHE = 'lele-wordbook-offline-v1'
export const WORDBOOK_IPA_PATH = '/wordbook/offline-ipa.json'

export async function downloadWordbookShell(cache, fetchResource, origin, assets) {
  const pageUrl = `${origin}/wordbook`
  const page = await fetchResource(pageUrl)
  if (!page.ok) throw new Error('离线页面下载失败，请检查网络后重试。')
  const html = await page.clone().text()
  const fromHtml = [...html.matchAll(/(?:src|href)=["']([^"']*\/_next\/static\/[^"']+)["']/g)].map(match => match[1].replaceAll('&amp;', '&'))
  const urls = [...new Set([...assets, ...fromHtml].map(value => new URL(value, origin)).filter(url => url.origin === origin && url.pathname.startsWith('/_next/static/')).map(url => url.href))]
  if (!urls.length) throw new Error('离线页面资源未准备好，请刷新后重试。')
  const requests = [...urls, `${origin}/api/vocab/library`]
  const responses = await Promise.all(requests.map(async url => {
    const response = await fetchResource(url)
    if (!response.ok) throw new Error('离线页面下载失败，请检查网络后重试。')
    return response
  }))
  const data = await responses[urls.length].clone().json()
  if (!Array.isArray(data.units)) throw new Error('离线单词表下载失败，请重试。')
  for (let i = 0; i < requests.length; i++) await cache.put(requests[i], responses[i])
  await cache.put(pageUrl, page)
  return data.units
}

export async function downloadWordbookIpa(units, fetchIpa, saved = {}) {
  const words = units.flatMap(unit => unit.words).filter(word => !word.ipa && !saved[word.id])
  const results = { ...saved }
  let next = 0
  async function worker() {
    while (next < words.length) {
      const word = words[next++]
      try {
        const response = await fetchIpa(word.word)
        const entries = response.ok ? await response.json() : []
        const ipa = Array.isArray(entries) ? entries.flatMap(entry => [entry.phonetic, ...(entry.phonetics || []).map(p => p.text)]).find(value => typeof value === 'string' && value.trim()) : ''
        if (ipa) results[word.id] = ipa
      } catch {}
    }
  }
  await Promise.all(Array.from({ length: 4 }, () => worker()))
  return results
}
