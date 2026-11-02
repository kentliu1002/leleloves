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
