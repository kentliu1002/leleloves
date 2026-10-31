import assert from 'node:assert/strict'
import { recognizeSubject, recognizeSubjectForPublish, subjectFromText } from '../lib/homework-subject.mjs'
assert.equal(subjectFromText('完成习作，复习日积月累'), '语文')
assert.equal(subjectFromText('英语学习任务'), '英语')
assert.equal(subjectFromText('数学和英语'), '其它')
let calls = 0
assert.equal(await recognizeSubject({ imageUrl: 'https://example.test/photo.jpg', apiKey: 'test' }, async (_, options) => {
  calls++
  const body = JSON.parse(options.body)
  assert.equal(body.model, 'gpt-5.4-mini')
  assert.equal(body.reasoning_effort, 'none')
  assert.equal(body.max_completion_tokens, 32)
  assert.equal('thinking' in body, false)
  assert.equal('max_tokens' in body, false)
  if (calls < 3) throw new Error('connect timeout')
  return { ok: true, json: async () => ({ choices: [{ message: { content: '英语' } }] }) }
}), '英语')
assert.equal(calls, 3)

const providerUrls = []
assert.equal(await recognizeSubject({
  imageUrl: 'https://example.test/math.png',
  apiKey: 'openai-test',
  fallbackUrl: 'https://example.test/subject-relay',
  fallbackKey: 'relay-test'
}, async (url, options) => {
  providerUrls.push(url)
  if (url.includes('api.openai.com')) throw new Error('connect timeout')
  const body = JSON.parse(options.body)
  assert.equal(body.model, 'gpt-5.4-mini')
  assert.equal(body.reasoning_effort, 'none')
  assert.equal('thinking' in body, false)
  assert.equal('max_tokens' in body, false)
  assert.equal(options.headers.Authorization, 'Bearer relay-test')
  return { ok: true, json: async () => ({ choices: [{ message: { content: '数学' } }] }) }
}), '数学')
assert.deepEqual(providerUrls, [
  'https://api.openai.com/v1/chat/completions',
  'https://example.test/subject-relay'
])

assert.equal(await recognizeSubject({ text: '完成习作', apiKey: 'test' }, () => { throw new Error('should not call AI') }), '语文')

assert.equal(subjectFromText('学习了《方帽子店》，完成周练3语基部分，今天听写全对'), '语文')
await assert.rejects(() => recognizeSubject({ imageUrl: 'https://example.test/english.png', apiKey: 'test' }, async () => { throw new Error('fetch failed') }), /识别服务暂时不可用/)

assert.equal(await recognizeSubject({ text: '🌞9月20日\n🌻「学习内容」\n1.讲评校本、周练\n🌻「课后任务」\n1.订正校本《方帽子店》\n2.预习《田忌赛马》《园地二》', apiKey: 'test' }, async () => { throw new Error('fetch failed') }), '语文')

assert.deepEqual(await recognizeSubjectForPublish({ imageUrl: 'https://example.test/photo.jpg', apiKey: 'test' }, async () => { throw new Error('should not call AI before saving') }), { subject: '待识别', pending: true })
assert.deepEqual(await recognizeSubjectForPublish({ text: '英语学习任务', apiKey: 'test' }, async () => { throw new Error('should not call') }), { subject: '英语', pending: false })
console.log('subject tests passed')
