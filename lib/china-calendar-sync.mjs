const DATA_ROOT = 'https://raw.githubusercontent.com/NateScarlet/holiday-cn/master'

export function calendarUrl(year) {
  return `${DATA_ROOT}/${year}.json`
}

function nextDate(date) {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + 1)
  return value.toISOString().slice(0, 10)
}

function isGovernmentUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && (url.hostname === 'gov.cn' || url.hostname.endsWith('.gov.cn'))
  } catch {
    return false
  }
}

export function parseGovernmentCalendar(payload) {
  if (!Number.isInteger(payload?.year)) throw new Error('缺少有效年份')
  if (!Array.isArray(payload.papers) || !payload.papers.some(isGovernmentUrl)) {
    throw new Error('节假日数据缺少 gov.cn 官方来源')
  }
  if (!Array.isArray(payload.days) || payload.days.length === 0) {
    throw new Error('节假日日期数据为空')
  }

  const days = payload.days.map(day => {
    if (!day?.name?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(day.date || '') || typeof day.isOffDay !== 'boolean') {
      throw new Error('节假日日期数据格式错误')
    }
    if (!day.date.startsWith(`${payload.year}-`)) throw new Error('节假日日期不属于目标年份')
    return { name: day.name.trim(), date: day.date, isOffDay: day.isOffDay }
  }).sort((a, b) => a.date.localeCompare(b.date))

  const holidays = []
  for (const day of days.filter(item => item.isOffDay)) {
    const previous = holidays.at(-1)
    if (previous && previous.name === day.name && nextDate(previous.endDate) === day.date) {
      previous.endDate = day.date
    } else {
      holidays.push({
        sourceKey: `government:${payload.year}:holiday:${day.name}`,
        name: day.name,
        startDate: day.date,
        endDate: day.date
      })
    }
  }

  const workdays = days.filter(item => !item.isOffDay).map(day => ({
    sourceKey: `government:${payload.year}:workday:${day.date}`,
    date: day.date,
    note: `${day.name}调休`
  }))

  return {
    year: payload.year,
    holidays,
    workdays,
    sourceUrls: payload.papers.filter(isGovernmentUrl)
  }
}
