import assert from 'node:assert/strict'
import { findRecentDuplicate, storageNames } from '../lib/homework-dedup.mjs'

const rows = [{
  id: 'first', content: '微信图片', subject: '其它',
  file_urls: JSON.stringify([{ filename: '微信图片.png', url: 'https://example.test/attachments/first.png' }])
}]

assert.equal(findRecentDuplicate(rows, { filename: '微信图片.png', content: '数学' })?.id, 'first')
assert.equal(findRecentDuplicate(rows, { filename: 'different.png', content: '微信图片' }), null)
assert.equal(findRecentDuplicate([{ id: 'text', content: '背诵课文' }], { filename: '', content: '背诵课文' })?.id, 'text')
assert.deepEqual(storageNames([{ url: 'https://example.test/attachments/retry.png?x=1' }]), ['retry.png'])

console.log('homework deduplication tests passed')
