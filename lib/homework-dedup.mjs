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
