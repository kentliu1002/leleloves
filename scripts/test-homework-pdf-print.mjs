import assert from 'node:assert/strict'
import { openPdfDirectlyForPrint } from '../lib/homework-pdf-print.mjs'
assert.equal(openPdfDirectlyForPrint('pdf', 'https://example.test/file', 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)', 'iPad', 5), true)
assert.equal(openPdfDirectlyForPrint('pdf', 'https://example.test/file.pdf?x=1', 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', 'MacIntel', 5), true)
assert.equal(openPdfDirectlyForPrint('image', 'https://example.test/photo.jpg', 'Mozilla/5.0 (iPad)', 'iPad', 5), false)
assert.equal(openPdfDirectlyForPrint('pdf', 'https://example.test/file.pdf', 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', 'MacIntel', 0), false)
console.log('iPad PDF print routing tests passed')
