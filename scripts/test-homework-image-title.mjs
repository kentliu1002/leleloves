import assert from 'node:assert/strict'
import { needsImageTitle, recognizeImageTitle } from '../lib/homework-image-title.mjs'
assert.equal(needsImageTitle({ content: 'IMG_1234', fileType: 'image', files: [] }), true)
assert.equal(needsImageTitle({ content: '周末阅读', filename: '周末阅读.jpg', contentProvided: false, fileType: 'image', files: [] }), true)
assert.equal(needsImageTitle({ content: '周末阅读', filename: '周末阅读.jpg', contentProvided: true, fileType: 'image', files: [] }), false)
assert.equal(needsImageTitle({ content: '周末阅读', fileType: 'image', files: [] }), false)
assert.equal(needsImageTitle({ content: '', fileType: 'pdf', files: [] }), false)
assert.equal(needsImageTitle({ content: '', fileType: 'image', files: [{type:'image'}, {type:'pdf'}] }), false)
let calls = 0
const result = await recognizeImageTitle({ imageUrl: 'https://example.test/image.jpg', apiKey: 'test' }, async (_, options) => {
  calls++
  const body = JSON.parse(options.body)
  assert.equal(body.messages[0].content[1].image_url.url, 'https://example.test/image.jpg')
  return { ok: true, json: async () => ({ choices: [{ message: { content: '《三位数乘两位数》练习' } }] }) }
})
assert.equal(result, '《三位数乘两位数》练习')
assert.equal(calls, 1)
console.log('image title tests passed')
