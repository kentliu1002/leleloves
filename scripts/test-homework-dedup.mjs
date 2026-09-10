import assert from 'node:assert/strict'
import { findRecentDuplicate, storageNames, submissionId } from '../lib/homework-dedup.mjs'

const rows = [{
  id: 'first', content: '微信图片', subject: '其它',
  file_urls: JSON.stringify([{ filename: '微信图片.png', url: 'https://example.test/attachments/first.png' }])
}]

assert.equal(findRecentDuplicate(rows, { filename: '微信图片.png', content: '数学' })?.id, 'first')
assert.equal(findRecentDuplicate(rows, { filename: 'different.png', content: '微信图片' }), null)
assert.equal(findRecentDuplicate([{ id: 'text', content: '背诵课文' }], { filename: '', content: '背诵课文' })?.id, 'text')
assert.deepEqual(storageNames([{ url: 'https://example.test/attachments/retry.png?x=1' }]), ['retry.png'])
const id = submissionId({ filename: '微信图片.png', content: '', date: '2026-09-10' })
assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
assert.equal(id, submissionId({ filename: '微信图片.png', content: 'ignored', date: '2026-09-10' }))
assert.notEqual(id, submissionId({ filename: '微信图片2.png', content: '', date: '2026-09-10' }))

console.log('homework deduplication tests passed')
