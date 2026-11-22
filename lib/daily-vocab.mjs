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

export function vocabularyStreak(completedDates, date, allowYesterday = false, workdays = []) {
  const completed = new Set(completedDates)
  const overrides = new Set(workdays)
  const shift = (value, days) => {
    const day = new Date(`${value}T00:00:00Z`)
    day.setUTCDate(day.getUTCDate() + days)
    return day.toISOString().slice(0, 10)
  }
  let cursor = date
  let count = 0
  while (true) {
    const weekday = new Date(`${cursor}T00:00:00Z`).getUTCDay()
    if (weekday === 6 || weekday === 0) {
      const saturday = weekday === 6 ? cursor : shift(cursor, -1)
      const sunday = shift(saturday, 1)
      if (!overrides.has(saturday) && !overrides.has(sunday)) {
        const done = [saturday, sunday].filter(day => day <= date && completed.has(day)).length
        // 今天仍在周末时，允许等到周末结束再完成一次。
        if (!done && !(allowYesterday && date >= saturday && date <= sunday)) break
        count += done
        cursor = shift(saturday, -1)
        continue
      }
    }
    if (completed.has(cursor)) count++
    else if (!(allowYesterday && cursor === date)) break
    cursor = shift(cursor, -1)
  }
  return count
}
