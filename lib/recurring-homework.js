function bjDateParts(now = new Date()) {
  const bjNow = new Date(now.getTime() + 8 * 3600_000)
  return {
    today: bjNow.toISOString().slice(0, 10),
    weekday: bjNow.getUTCDay()
  }
}

async function ensureTodayRecurringHomework(supabase, now = new Date()) {
  const { today, weekday } = bjDateParts(now)
  const { data: templates } = await supabase
    .from('recurring_homework').select('*')
    .eq('enabled', true).lte('start_date', today).gte('end_date', today)

  if (!templates || templates.length === 0) return

  const todayStart = `${today}T00:00:00+08:00`
  for (const template of templates) {
    if (!Array.isArray(template.weekdays) || !template.weekdays.includes(weekday)) continue

    const { count } = await supabase
      .from('homework').select('*', { count: 'exact', head: true })
      .eq('recurring_id', template.id).gte('created_at', todayStart)

    if ((count || 0) > 0) continue

    const content = template.note ? `${template.subject}：${template.note}` : template.subject
    await supabase.from('homework').insert({
      content,
      subject: template.subject,
      is_completed: false,
      recurring_id: template.id,
      submit_type: template.submit_type || 'photo'
    })
  }
}

exports.ensureTodayRecurringHomework = ensureTodayRecurringHomework
