import { createHash } from 'node:crypto'

function parseFiles(value) {
  if (!value) return []
  if (Array.isArray(value)) return value
  try { return JSON.parse(value) } catch { return [] }
}

export function findRecentDuplicate(rows, { filename, content }) {
  const wantedName = (filename || '').trim()
  const wantedContent = (content || '').trim()

  return rows.find(row => {
    const files = parseFiles(row.file_urls)
    if (wantedName && files.some(file => file?.filename === wantedName)) return true
    return !wantedName && wantedContent && row.content?.trim() === wantedContent
  }) || null
}

export function storageNames(files) {
  return (Array.isArray(files) ? files : [])
    .map(file => file?.url?.split('?')[0].split('/').pop())
    .filter(Boolean)
}

export function submissionId({ filename, content, date }) {
  const identity = (filename || '').trim()
    ? `file:${filename.trim()}`
    : `text:${(content || '').trim()}`
  const hex = createHash('sha256').update(`${date}|${identity}`).digest('hex').slice(0, 32).split('')
  hex[12] = '5'
  hex[16] = ((parseInt(hex[16], 16) & 3) | 8).toString(16)
  const value = hex.join('')
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`
}
