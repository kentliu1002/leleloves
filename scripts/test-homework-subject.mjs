import assert from 'node:assert/strict'
import { recognizeSubject, subjectFromText } from '../lib/homework-subject.mjs'
assert.equal(subjectFromText('完成习作，复习日积月累'), '语文')
assert.equal(subjectFromText('英语学习任务'), '英语')
assert.equal(subjectFromText('数学和英语'), '其它')
let calls = 0
assert.equal(await recognizeSubject({ imageUrl: 'https://example.test/photo.jpg', apiKey: 'test' }, async (_, options) => {
  calls++
  assert.equal(JSON.parse(options.body).thinking.type, 'disabled')
  if (calls < 3) throw new Error('connect timeout')
  return { ok: true, json: async () => ({ choices: [{ message: { content: '英语' } }] }) }
}), '英语')
assert.equal(calls, 3)
assert.equal(await recognizeSubject({ text: '完成习作', apiKey: 'test' }, () => { throw new Error('should not call AI') }), '语文')
console.log('subject tests passed')
