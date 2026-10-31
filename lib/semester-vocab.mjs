import curriculum from './semester-vocab.json' with { type: 'json' }

export function availableSemesterWords(date) {
  const days = Math.floor((Date.parse(`${date}T00:00:00+08:00`) - Date.parse(`${curriculum.nextUnitStart}T00:00:00+08:00`)) / 86400000)
  return curriculum.units.flatMap(unit => {
    if (unit.unit === 1) return unit.words
    const activeDays = Math.min(7, Math.max(0, days - (unit.unit - 2) * 7 + 1))
    return unit.words.slice(0, Math.ceil(unit.words.length * activeDays / 7))
  })
}

export function selectSemesterWords(words, attempts, date, size = 10, random = Math.random, daily = false) {
  const available = availableSemesterWords(date)
  const termWords = new Map(words.filter(w => w.topic === curriculum.topic).map(w => [w.word, w]))
  const ordered = available.map(w => termWords.get(w.word)).filter(Boolean)
  const passed = new Set(attempts.filter(a => a.correct && a.date >= curriculum.anchorDate).map(a => a.word_id))
  const newWords = ordered.filter(w => !passed.has(w.id)).slice(0, daily ? 5 : size)
  const reviewLimit = daily ? 5 : size - newWords.length
  const selected = new Set(newWords.map(w => w.word.toLowerCase()))
  const unitByWord = new Map(curriculum.units.flatMap(u => u.words.map(w => [w.word, u.unit])))
  const currentUnit = Math.max(...available.map(w => unitByWord.get(w.word)))
  const reviewed = ordered.filter(w => passed.has(w.id))
  const pools = daily ? [
    reviewed
  ] : [
    reviewed.filter(w => unitByWord.get(w.word) === currentUnit),
    reviewed.filter(w => unitByWord.get(w.word) === currentUnit - 1)
  ]
  const reviewWords = []
  for (const candidates of pools) {
    const pool = candidates.filter(w => {
      const key = w.word.toLowerCase()
      if (selected.has(key)) return false
      selected.add(key)
      return true
    })
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1))
      ;[pool[i], pool[j]] = [pool[j], pool[i]]
    }
    reviewWords.push(...pool.slice(0, reviewLimit - reviewWords.length))
    if (reviewWords.length >= reviewLimit) break
  }
  return { newWords, reviewWords }
}

async function readAll(db, table, columns) {
  const rows = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.from(table).select(columns).order('id').range(offset, offset + 999)
    if (error) throw error
    rows.push(...data)
    if (data.length < 1000) return rows
  }
}

export async function getSemesterGroup(db, date, daily = false) {
  const [words, attempts] = await Promise.all([
    readAll(db, 'vocabulary', '*'),
    readAll(db, 'vocab_attempts', 'id,word_id,correct,date')
  ])
  if (!words.some(w => w.topic === curriculum.topic)) throw new Error('本学期词库尚未导入')
  return selectSemesterWords(words, attempts, date, 10, Math.random, daily)
}
