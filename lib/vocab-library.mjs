import curriculum from './semester-vocab.json' with { type: 'json' }

export function groupVocabLibrary(rows) {
  const term = new Map()
  const pronunciation = new Map()
  for (const row of rows) {
    const key = row.word.toLowerCase().trim()
    if (row.topic === curriculum.topic) term.set(key, row)
    if (row.ipa?.trim() && !pronunciation.has(key)) pronunciation.set(key, row.ipa.trim())
  }
  return {
    book: curriculum.book,
    units: curriculum.units.map(unit => ({
      unit: unit.unit,
      words: unit.words.map(entry => {
        const key = entry.word.toLowerCase().trim()
        const word = term.get(key)
        if (!word) return null
        return {
          id: word.id, word: word.word, meaning_zh: word.meaning_zh,
          ipa: word.ipa?.trim() || pronunciation.get(key) || '',
          example_en: word.example_en || '', example_zh: word.example_zh || ''
        }
      }).filter(Boolean)
    }))
  }
}
