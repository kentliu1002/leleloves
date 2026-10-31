import assert from 'node:assert/strict'
import sharp from 'sharp'
import { runAnalysis } from '../lib/homework-analysis.mjs'
const originalFetch = globalThis.fetch
const photo = await sharp({ create: { width: 120, height: 80, channels: 3, background: 'white' } }).jpeg().toBuffer()
const report = { summary: '已完成。', errors: [], uncertain: [] }
const reply = data => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(data) } }] })
async function scenario(responses, downloadFails = false) {
  const uploaded = [], removed = [], calls = []
  const bucket = {
    async upload(name, buffer) { uploaded.push({ name, meta: await sharp(buffer).metadata() }); return {} },
    getPublicUrl(name) { return { data: { publicUrl: `https://example.test/${name}` } } },
    async remove(names) { removed.push(...names); return {} }
  }
  globalThis.fetch = async (url, options) => {
    if (!options?.method) return new Response(photo, { status: downloadFails ? 500 : 200 })
    assert.equal(url, 'https://api.openai.com/v1/chat/completions')
    calls.push(JSON.parse(options.body))
    return Response.json(responses.shift())
  }
  let result, error
  try { result = await runAnalysis('数学', '["https://example.test/original.jpg"]', { storage: { from: () => bucket } }, 'test') }
  catch (e) { error = e }
  finally { globalThis.fetch = originalFetch }
  return { result, error, uploaded, removed, calls }
}
const candidate = reply({ ...report, errors: [{ question: '一(2)', student: '十万', correct: '万', reason: '候选误判' }] })
const success = await scenario([candidate, reply(report), reply(report), reply(report)])
assert.ifError(success.error)
assert.ok(success.calls.every(c => c.model === 'gpt-5.4-mini' && c.reasoning_effort === 'none'))
assert.ok(success.calls.every(c => c.max_completion_tokens === 1500 && !('thinking' in c) && !('max_tokens' in c)))
assert.ok(success.calls.every(c => c.temperature === 0.1 && c.response_format.type === 'json_object'))
assert.match(success.result, /未发现可确认/)
assert.doesNotMatch(success.result, /候选误判/)
assert.equal(success.uploaded[0].meta.width, 80)
assert.ok(success.uploaded[0].meta.height < 120)
assert.deepEqual(success.removed, success.uploaded.map(x => x.name))
assert.ok(success.calls.every(c => c.messages[0].content.filter(x => x.type === 'image_url').every(x => x.image_url.url.startsWith('https://'))))
const incomplete = { choices: [{ finish_reason: 'length', message: { content: '{}' } }] }
const truncated = await scenario([incomplete, incomplete, incomplete, incomplete])
assert.ok(truncated.error)
assert.deepEqual(truncated.removed, truncated.uploaded.map(x => x.name))
const unavailable = await scenario([], true)
assert.ok(unavailable.error)
assert.equal(unavailable.calls.length, 0)
assert.equal(unavailable.uploaded.length, 0)
console.log('AI workflow tests passed')
