// One-time preparation for the Grade 4 wordbook. Run explicitly with --run.
// The speech model is scheduled to retire in January 2027; saved MP3s remain usable.
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import curriculum from '../lib/semester-vocab.json' with { type: 'json' }
import { wordbookSpeechText } from '../lib/wordbook-pronunciation.mjs'

if (!process.argv.includes('--run')) throw new Error('Pass --run to generate and upload wordbook assets.')
const env = {}
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const match = line.match(/^([A-Z_0-9]+)=(.*)$/)
  if (match) env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '')
}
const key = env.OPENAI_API_KEY
if (!key || !env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Missing required environment variables')
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const bucket = db.storage.from('attachments')
const prefix = 'wordbook-audio/v1'
const { data: words, error } = await db.from('vocabulary').select('id,word,meaning_zh,example_en,example_zh').eq('topic', curriculum.topic).order('id')
if (error) throw error
if (words.length !== curriculum.units.reduce((n, u) => n + u.words.length, 0)) throw new Error(`Unexpected number of term words: ${words.length}`)
const { data: existing, error: listError } = await bucket.list(prefix, { limit: 1000 })
if (listError) throw listError
const files = new Set(existing.map(item => item.name))
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
async function request(url, body) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) })
    if (res.ok) return res
    const data = await res.json().catch(() => ({}))
    if ((res.status === 429 || res.status >= 500) && attempt < 3) { await sleep(1500 * (attempt + 1)); continue }
    throw new Error(`OpenAI HTTP ${res.status}: ${(data.error?.message || '').replaceAll(key, '[REDACTED]')}`)
  }
  throw new Error('OpenAI retry limit reached')
}
async function getExample(word) {
  if (word.example_en && word.example_zh) return { en: word.example_en, zh: word.example_zh }
  const prompt = `为英语单词或短语“${word.word}”（${word.meaning_zh}）写一个适合中国小学生的简短自然的英语例句，给出准确中文翻译。英语例句尽量包含目标词；如果目标含 sb 或 sth，应在句中使用合理的人或物。仅返回 JSON：{"en":"英语例句","zh":"中文翻译"}。`
  const res = await request('https://api.openai.com/v1/chat/completions', { model: 'gpt-5.4-mini', messages: [{ role: 'user', content: prompt }], reasoning_effort: 'none', temperature: 0.3, response_format: { type: 'json_object' } })
  const data = await res.json()
  const example = JSON.parse(data.choices[0].message.content)
  if (typeof example.en !== 'string' || typeof example.zh !== 'string' || !example.en.trim() || !example.zh.trim()) throw new Error(`Invalid example for word id ${word.id}`)
  const { error: updateError } = await db.from('vocabulary').update({ example_en: example.en.trim(), example_zh: example.zh.trim() }).eq('id', word.id).is('example_en', null).is('example_zh', null)
  if (updateError) throw updateError
  // Reload to avoid overwriting or diverging from an example changed concurrently.
  const { data: saved, error: readError } = await db.from('vocabulary').select('example_en,example_zh').eq('id', word.id).single()
  if (readError || !saved?.example_en || !saved?.example_zh) throw new Error(`Unable to preserve example for word id ${word.id}`)
  return { en: saved.example_en, zh: saved.example_zh }
}
async function audioFor(id, type, input) {
  const hash = createHash('sha256').update(`marin|${input}`).digest('hex').slice(0, 16)
  const name = `${id}-${type}-${hash}.mp3`
  if (!files.has(name)) {
    const res = await request('https://api.openai.com/v1/audio/speech', { model: 'gpt-4o-mini-tts', voice: 'marin', input, instructions: 'Speak clearly and slowly, in a warm friendly voice for a child learning English. Read only the supplied text.', response_format: 'mp3' })
    const audio = Buffer.from(await res.arrayBuffer())
    if (audio.length < 1000 || !(audio.subarray(0,3).toString() === 'ID3' || audio[0] === 0xff)) throw new Error(`Invalid audio for word id ${id}`)
    const { error: uploadError } = await bucket.upload(`${prefix}/${name}`, audio, { contentType: 'audio/mpeg', cacheControl: '31536000', upsert: false })
    if (uploadError && !/already exists|duplicate/i.test(uploadError.message)) throw uploadError
    files.add(name)
  }
  return bucket.getPublicUrl(`${prefix}/${name}`).data.publicUrl
}
let next = 0, completed = 0
const manifest = {}
async function worker() {
  while (next < words.length) {
    const word = words[next++]
    const example = await getExample(word)
    const wordAudio = await audioFor(word.id, 'word', wordbookSpeechText(word.word))
    const exampleAudio = await audioFor(word.id, 'example', example.en)
    manifest[word.id] = { word: word.word, example_en: example.en, wordAudio, exampleAudio }
    completed++
    if (completed % 5 === 0 || completed === words.length) console.log(`Prepared ${completed}/${words.length}`)
  }
}
try {
  await Promise.all(Array.from({ length: 8 }, () => worker()))
  if (Object.keys(manifest).length !== words.length) throw new Error('Manifest incomplete')
  const { error: manifestError } = await bucket.upload(`${prefix}/manifest.json`, Buffer.from(JSON.stringify(manifest)), { contentType: 'application/json', cacheControl: '60', upsert: true })
  if (manifestError) throw manifestError
  console.log(`Uploaded complete manifest with ${words.length} words and ${words.length * 2} audio files.`)
} catch (error) {
  console.error('Preparation failed:', String(error.message).replaceAll(key, '[REDACTED]'))
  process.exitCode = 1
}
