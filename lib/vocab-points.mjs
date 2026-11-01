// 单词积分先记为待发放；当天其他作业全部完成后再计入总分。
export async function releaseVocabPoints(db, date) {
  const start = `${date}T00:00:00+08:00`
  const next = new Date(Date.parse(start) + 86400000).toISOString()
  const { data: homework, error } = await db.from('homework')
    .select('id,is_completed').gte('created_at', start).lt('created_at', next)
  if (error) throw error
  if (!homework?.length || homework.some(item => !item.is_completed)) return false

  const { data: pending, error: pendingError } = await db.from('points_log')
    .select('id,source').eq('date', date).eq('points', 0).in('source', ['vocab_bonus', 'vocab_extra'])
  if (pendingError) throw pendingError
  for (const item of pending || []) {
    const points = item.source === 'vocab_bonus' ? 1 : 5
    const reason = item.source === 'vocab_bonus' ? '附加任务：完成英语单词学习 +1' : '附加任务：额外背单词一组 +5'
    const { error: updateError } = await db.from('points_log').update({ points, reason }).eq('id', item.id).eq('points', 0)
    if (updateError) throw updateError
  }
  return true
}
