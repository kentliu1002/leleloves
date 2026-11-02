export function dailyVocabProgress(daily, attempts) {
  const passed = kind => new Set(attempts
    .filter(a => a.date === daily.date && a.kind === kind && a.correct)
    .map(a => a.word_id))
  const reviews = passed('review')
  const newWords = passed('new')
  return {
    reviewPassed: (daily.review_word_ids || []).every(id => reviews.has(id)),
    newPassed: (daily.new_word_ids || []).every(id => newWords.has(id))
  }
}

export function historicalVocabStatus(recentDays, date) {
  return recentDays ? !!recentDays.find(day => day.date === date)?.completed : null
}

export function vocabularyStreak(completedDates, date, allowYesterday = false) {
  const completed = new Set(completedDates)
  const day = new Date(`${date}T00:00:00Z`)
  const previous = () => day.setUTCDate(day.getUTCDate() - 1)
  if (allowYesterday && !completed.has(date)) previous()
  let count = 0
  while (completed.has(day.toISOString().slice(0, 10))) {
    count++
    previous()
  }
  return count
}
