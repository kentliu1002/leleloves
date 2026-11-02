'use client'
import React, { useState, useEffect } from 'react'
import { getHomework } from '../lib/actions'
import CheckInButton from './CheckInButton'
import SubjectIcon from './SubjectIcon'
import { historicalVocabStatus } from '../lib/daily-vocab.mjs'

// ── 积分数据类型 ──────────────────────────────────────────────────────────
interface PointsData {
  total: number
  yesterday: { points: number; reason: string | null; hasRecord: boolean; date: string }
  todayIsWorkday: boolean
  tomorrowIsWorkday: boolean
  yesterdayWasWorkday: boolean
  ordinaryWeekend: boolean
  windowRestDays: number | null
  currentWindow: { windowStart: string; windowEnd: string } | null
}

function cleanMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s*/g, '')
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^[\*\-]\s+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const toBJDate = (ts: string) =>
  new Date(new Date(ts).getTime() + 8 * 3600_000).toISOString().slice(0, 10)

function shiftBJDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00+08:00')
  d.setDate(d.getDate() + days)
  return toBJDate(d.toISOString())
}

function bjToday(): string {
  return toBJDate(new Date().toISOString())
}

function bjDateObj(dateStr: string): Date {
  return new Date(dateStr + 'T12:00:00+08:00')
}

export default function ChildDashboard() {
  const [allHomework, setAllHomework] = useState<any[]>([])
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [pointsData, setPointsData] = useState<PointsData | null>(null)
  const [analyzing, setAnalyzing] = useState<Set<string>>(new Set())
  const [expandedFeedback, setExpandedFeedback] = useState<Set<string>>(new Set())
  const [localFeedback, setLocalFeedback] = useState<Record<string, string>>({})
  const [vocabStats, setVocabStats] = useState<{ masteredCount: number, todayStatus: { completed: boolean, newCount: number, reviewCount: number } } | null>(null)
  const [vocabHistory, setVocabHistory] = useState<{ date: string, completed: boolean }[] | null>(null)
  
  // 📅 生成过去7天的北京日期数组
  const today = bjToday()
  const last7Days = Array.from({length: 7}, (_, i) => shiftBJDate(today, -i));
  
  // 默认选中“今天”
  const [selectedDate, setSelectedDate] = useState(last7Days[0]);

  const fetchPoints = async () => {
    try {
      const res = await fetch('/api/points', { cache: 'no-store' })
      if (res.ok) setPointsData(await res.json())
    } catch {}
  }

  const fetchVocabStats = async () => {
    try {
      // 同时调 today（幂等生成今天 session 并返回准确待学数量）和 stats（累计掌握数）
      const [statsRes, todayRes] = await Promise.all([
        fetch('/api/vocab/stats', { cache: 'no-store' }),
        fetch('/api/vocab/today', { cache: 'no-store' })
      ])
      const stats = statsRes.ok ? await statsRes.json() : {}
      const today = todayRes.ok ? await todayRes.json() : {}
      setVocabHistory(statsRes.ok && Array.isArray(stats.recentDays) ? stats.recentDays : null)
      setVocabStats({
        masteredCount: stats.masteredCount ?? 0,
        todayStatus: {
          completed: !!today.completedToday,
          newCount: (today.newWords || []).length,
          reviewCount: (today.reviewWords || []).length
        }
      })
    } catch { setVocabHistory(null) }
  }

  const fetchHW = async () => {
    setIsRefreshing(true)
    const data = await getHomework()
    setAllHomework(data || [])
    setTimeout(() => setIsRefreshing(false), 500)
  }

  useEffect(() => {
    fetchHW()
    fetchPoints()
    fetchVocabStats()
    const timer = setInterval(() => { fetchHW(); fetchPoints(); fetchVocabStats() }, 300000) // 每5分钟自动刷新
    return () => clearInterval(timer)
  }, [])

  const hasPendingImageTitle = allHomework.some(item => item.content === '图片作业（标题识别中）')
  useEffect(() => {
    if (!hasPendingImageTitle) return
    const timer = setInterval(fetchHW, 10000)
    const stop = setTimeout(() => clearInterval(timer), 60000)
    return () => { clearInterval(timer); clearTimeout(stop) }
  }, [hasPendingImageTitle])

  const openTextHomework = (content: string, print: boolean) => {
    const view = window.open('', '_blank')
    if (!view) { alert('请允许浏览器弹出窗口哦'); return }
    view.document.title = '作业内容'
    const text = view.document.createElement('pre')
    text.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;font:18px/1.8 sans-serif;max-width:800px;margin:32px auto;padding:0 20px;'
    text.textContent = content
    view.document.body.appendChild(text)
    if (print) { view.focus(); view.print() }
  }

  // 🚀 全自动打印函数（纯净 DOM 版，防 Vercel 报错）
  const handlePrint = (e: React.MouseEvent, url: string) => {
    e.preventDefault();
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('请允许浏览器弹出窗口哦');
      return;
    }

    const isPdf = url.toLowerCase().includes('.pdf');
    
    printWindow.document.write("<!DOCTYPE html><html><head><title>打印作业</title></head><body></body></html>");
    printWindow.document.close();
    
    const doc = printWindow.document;
    
    const style = doc.createElement('style');
    style.innerHTML = "@media print { @page { margin: 0; } body { margin: 0; padding: 0; } .no-print { display: none; } img, iframe { max-width: 100%; max-height: 100vh; object-fit: contain; } } body { margin: 0; display: flex; flex-direction: column; align-items: center; height: 100vh; background: #fff; font-family: sans-serif;} .header { width: 100%; padding: 15px; text-align: center; color: #666; font-size: 14px; background: #f8f9fa; border-bottom: 1px solid #eee; } .content { flex: 1; width: 100%; display: flex; justify-content: center; align-items: center; } .back-btn { display: inline-block; margin-top: 12px; padding: 10px 28px; background: #2563eb; color: #fff; font-size: 15px; font-weight: bold; border: none; border-radius: 10px; cursor: pointer; }";
    doc.head.appendChild(style);

    const header = doc.createElement('div');
    header.className = "header no-print";
    const tip = isPdf ? '⚠️ iPad 提示：如果未自动弹出打印界面，请点击下方文档，点击右上角 <b>“共享 ↗”</b> 选择 <b>“打印”</b>。' : '正在准备打印机，请稍候...';
    header.innerHTML = '<div>' + tip + '</div><button class="back-btn" onclick="window.close()">← 返回作业主页</button>';
    doc.body.appendChild(header);

    const content = doc.createElement('div');
    content.className = "content";
    
    if (isPdf) {
      const iframe = doc.createElement('iframe');
      iframe.src = url;
      iframe.style.width = "100%";
      iframe.style.height = "100%";
      iframe.style.border = "none";
      iframe.onload = () => setTimeout(() => printWindow.print(), 1500);
      content.appendChild(iframe);
    } else {
      const img = doc.createElement('img');
      img.src = url;
      img.onload = () => setTimeout(() => printWindow.print(), 500);
      content.appendChild(img);
    }
    
    doc.body.appendChild(content);
  };

  const handleAnalyze = async (id: string) => {
    setAnalyzing(prev => new Set(prev).add(id))
    try {
      // 1. 触发分析（异步）
      const res = await fetch('/api/homework/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      })
      const data = await res.json()
      // 已有缓存结果直接展示
      if (data.feedback) {
        setLocalFeedback(prev => ({ ...prev, [id]: data.feedback }))
        setExpandedFeedback(prev => new Set(prev).add(id))
        return
      }
      // pending: 开始轮询
      if (data.pending) {
        for (let i = 0; i < 60; i++) {  // 最多 60×5s = 5 分钟
          await new Promise(r => setTimeout(r, 5000))
          try {
            const statusRes = await fetch(`/api/homework/analyze?id=${id}`)
            const status = await statusRes.json()
            if (status.feedback) {
              setLocalFeedback(prev => ({ ...prev, [id]: status.feedback }))
              setExpandedFeedback(prev => new Set(prev).add(id))
              return
            }
            if (status.pending === false && !status.feedback) {
              // 分析失败（已被重置为 null）
              alert('AI 分析失败，请稍后重试')
              return
            }
          } catch {}
        }
        alert('AI 分析超时（5 分钟仍未完成），请稍后刷新页面查看')
      }
    } catch (e: any) {
      alert('AI 分析触发失败：' + e.message)
    } finally {
      setAnalyzing(prev => { const s = new Set(prev); s.delete(id); return s })
    }
  }

  const isTodaySelected = selectedDate === last7Days[0];

  // 今天所属的积分窗口（假期/周末时非空）
  const currentWindow = pointsData?.currentWindow ?? null

  // 💡 作业过滤：
  //   - 选的是「今天」且处于非正常窗口 → 聚合整个窗口内的作业（放假前一天到假期最后一天）
  //   - 其他情况 → 只显示当日作业
  const displayHomework = (() => {
    if (isTodaySelected && currentWindow) {
      const { windowStart, windowEnd } = currentWindow
      return allHomework.filter((item: any) => {
        const d = toBJDate(item.created_at)
        return d >= windowStart && d <= windowEnd
      })
    }
    return allHomework.filter((item: any) => toBJDate(item.created_at) === selectedDate)
  })()

  // 动态计算顶部面板的显示信息
  const displayDateObj = bjDateObj(selectedDate);
  const displayDateStr = displayDateObj.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });

  // 📋 今日得分规则（根据星期几+调休工作日动态生成）
  const getTodayScoreGuide = () => {
    const wd = new Date().getDay() // 0=日,1=一,...,6=六
    const todayWorkday     = pointsData?.todayIsWorkday      ?? false
    const tomorrowWorkday  = pointsData?.tomorrowIsWorkday   ?? false
    const yesterdayWorkday = pointsData?.yesterdayWasWorkday ?? false
    const restDays         = pointsData?.windowRestDays      ?? 2
    const mult             = pointsData?.ordinaryWeekend ? 1 : restDays + 1

    // ── 上学日：周一~周四 / 调休当天 / 明天调休（今晚按上学日截止）
    const isSchoolDay = (wd >= 1 && wd <= 4) || todayWorkday || (tomorrowWorkday && !pointsData?.currentWindow)
    if (isSchoolDay) {
      // 调休周六特殊处理：今天是上班日，但明天（周日）是唯一假期
      // 显示明日假期窗口规则，让学生了解明天的积分策略
      if (todayWorkday && wd === 6) {
        return {
          title: `📋 明日假期规则（假期×${mult}）`,
          rows: [
            { icon: '🏅', desc: '明天下午 4:00 前完成', pts: `+${10 * mult}`, cls: 'g10' },
            { icon: '⭐', desc: '明天下午 6:00 前完成', pts: `+${8  * mult}`, cls: 'g8'  },
            { icon: '✨', desc: '明天晚上 9:00 前完成', pts: `+${6  * mult}`, cls: 'g6'  },
            { icon: '😴', desc: '没完成',              pts: '0',             cls: 'g0'  },
          ]
        }
      }
      let tag = '📋 今日得分规则'
      if (!todayWorkday && tomorrowWorkday) tag = '📋 明日调休·今晚截止规则'
      return {
        title: tag,
        rows: [
          { icon: '🏅', desc: '晚 9:00 前完成',   pts: '+5',  cls: 'g10' },
          { icon: '⭐', desc: '晚 9:30 前完成',   pts: '+3',  cls: 'g8'  },
          { icon: '✨', desc: '晚 10:00 前完成',   pts: '+1',  cls: 'g6'  },
          { icon: '😴', desc: '没完成',            pts: '0',   cls: 'g0'  },
        ]
      }
    }

    // ── 周日
    if (wd === 0) {
      if (yesterdayWorkday) {
        // 昨天（周六）是调休上班日 → 只有今天1天假
        return {
          title: `📋 今日截止规则（假期×${mult}）`,
          rows: [
            { icon: '🏅', desc: '下午 4:00 前完成', pts: `+${10 * mult}`, cls: 'g10' },
            { icon: '⭐', desc: '下午 6:00 前完成', pts: `+${8  * mult}`, cls: 'g8'  },
            { icon: '✨', desc: '晚上 9:00 前完成', pts: `+${6  * mult}`, cls: 'g6'  },
            { icon: '😴', desc: '没完成',           pts: '0',             cls: 'g0'  },
          ]
        }
      }
      // 正常双休周日（最后一天）—— 10分窗口昨天已过
      return {
        title: pointsData?.ordinaryWeekend ? '📋 周日截止规则' : `📋 周日截止规则（假期×${mult}）`,
        rows: [
          { icon: '⭐', desc: '中午 12:00 前完成', pts: `+${8 * mult}`, cls: 'g8'  },
          { icon: '✨', desc: '下午 6:00 前完成',  pts: `+${6 * mult}`, cls: 'g6'  },
          { icon: '😴', desc: '下午6点后未完成',   pts: '0',            cls: 'g0'  },
        ]
      }
    }

    // ── 周六（非调休，正常休息）
    if (wd === 6) {
      return {
        title: pointsData?.ordinaryWeekend ? '📋 周末得分规则' : `📋 周末得分规则（假期×${mult}）`,
        rows: [
          { icon: '🏅', desc: '今天下午 6:00 前完成',    pts: `+${10 * mult}`, cls: 'g10' },
          { icon: '⭐', desc: '明天(周日)中午前完成',    pts: `+${8  * mult}`, cls: 'g8'  },
          { icon: '✨', desc: '明天(周日)下午 6:00 前完成', pts: `+${6 * mult}`, cls: 'g6'  },
          { icon: '😴', desc: '没完成',                  pts: '0',             cls: 'g0'  },
        ]
      }
    }

    // ── 周五（正常双休前）
    return {
      title: pointsData?.ordinaryWeekend ? '📋 周末得分规则' : `📋 周末得分规则（假期×${mult}）`,
      rows: [
        { icon: '🏅', desc: '明天(周六)下午 6:00 前完成', pts: `+${10 * mult}`, cls: 'g10' },
        { icon: '⭐', desc: '周日中午 12:00 前完成',      pts: `+${8  * mult}`, cls: 'g8'  },
        { icon: '✨', desc: '周日下午 6:00 前完成',       pts: `+${6  * mult}`, cls: 'g6'  },
        { icon: '😴', desc: '没完成',                    pts: '0',             cls: 'g0'  },
      ]
    }
  }
  const scoreGuide = getTodayScoreGuide()

  // 英语单词必做任务：只要是「今天」且有词可学（或已完成）就必做，无论当天有没有布置作业
  const vocabToday = vocabStats?.todayStatus
  const historicalStatus = historicalVocabStatus(vocabHistory, selectedDate)
  const hasVocabTask = isTodaySelected
    ? !!vocabToday && (vocabToday.completed || (vocabToday.newCount + vocabToday.reviewCount) > 0)
    : historicalStatus !== null
  const vocabDone = isTodaySelected ? hasVocabTask && !!vocabToday?.completed : historicalStatus === true

  const baseTotal = displayHomework.length;
  const baseDone = displayHomework.filter((item: any) => item.is_completed).length;
  const totalHomework = baseTotal + (hasVocabTask ? 1 : 0);
  const completedHomework = baseDone + (vocabDone ? 1 : 0);
  const progressRatio = totalHomework === 0 ? 0 : Math.round((completedHomework / totalHomework) * 100);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&display=swap');
        body {
          background: #0a0e27 !important;
          font-family: 'Nunito','PingFang SC','Helvetica Neue',sans-serif !important;
        }
        body::before {
          content: '';
          position: fixed; inset: 0;
          background-image:
            radial-gradient(1px 1px at 8%  18%, white, transparent),
            radial-gradient(1px 1px at 28% 58%, white, transparent),
            radial-gradient(2px 2px at 50%  8%, rgba(255,255,255,.8), transparent),
            radial-gradient(1px 1px at 68% 38%, white, transparent),
            radial-gradient(1px 1px at 83% 68%, white, transparent),
            radial-gradient(2px 2px at 18% 78%, rgba(255,255,255,.6), transparent),
            radial-gradient(1px 1px at 58% 83%, white, transparent),
            radial-gradient(1px 1px at 88% 13%, white, transparent),
            radial-gradient(1px 1px at 43% 48%, rgba(255,255,255,.5), transparent),
            radial-gradient(2px 2px at 73% 23%, rgba(255,255,255,.7), transparent),
            radial-gradient(1px 1px at 35% 92%, white, transparent),
            radial-gradient(1px 1px at 62%  5%, white, transparent),
            radial-gradient(1px 1px at 95% 50%, rgba(255,255,255,.6), transparent);
          pointer-events: none; z-index: 0;
        }
        .lele-wrap { position: relative; z-index: 1; padding: 20px; max-width: 1100px; margin: 0 auto; }

        /* 指挥中心 */
        .hq {
          background: linear-gradient(135deg,#1a2156,#0d1540);
          border: 2px solid #3b5bdb; border-radius: 28px;
          padding: 24px 28px; margin-bottom: 18px;
          display: flex; align-items: center; gap: 24px; flex-wrap: wrap;
          box-shadow: 0 0 40px rgba(59,91,219,.3), inset 0 1px 0 rgba(255,255,255,.08);
          position: relative; overflow: hidden;
        }
        .hq::after {
          content: ''; position: absolute; top: -70px; right: -70px;
          width: 220px; height: 220px;
          background: radial-gradient(circle,rgba(59,91,219,.25),transparent 70%);
          pointer-events: none;
        }
        @keyframes lele-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
        .hq-rocket { font-size: 68px; flex-shrink: 0; animation: lele-float 3s ease-in-out infinite;
          filter: drop-shadow(0 0 18px rgba(100,160,255,.8)); }
        .hq-info { flex: 1; min-width: 160px; }
        .hq-label { font-size: 12px; font-weight: 800; color: #74b9ff; letter-spacing: 3px;
          text-transform: uppercase; margin-bottom: 6px; }
        .hq-date  { font-size: 30px; font-weight: 900; color: #fff; line-height: 1.15; margin-bottom: 4px; }
        .hq-sub   { font-size: 14px; color: #a8b8d8; font-weight: 700; }

        .hq-progress { flex-shrink: 0; width: 260px; }
        .prog-header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 8px; }
        .prog-label  { font-size: 13px; color: #a8b8d8; font-weight: 800; }
        .prog-sub    { font-size: 12px; color: #74b9ff; font-weight: 700; margin-top: 2px; }
        .prog-pct    { font-size: 38px; font-weight: 900; color: #00d2ff; line-height: 1;
          text-shadow: 0 0 20px rgba(0,210,255,.6); }
        .prog-bg  { background: rgba(255,255,255,.1); border-radius: 50px; height: 20px;
          overflow: hidden; border: 1px solid rgba(255,255,255,.1); margin-top: 8px; }
        .prog-fill { height: 100%; border-radius: 50px; transition: width 1s ease; position: relative; }
        .prog-fill::after { content: ''; position: absolute; top: 4px; left: 8px; right: 16px;
          height: 4px; background: rgba(255,255,255,.3); border-radius: 50px; }
        @keyframes lele-pulse { 0%,100%{opacity:1} 50%{opacity:.55} }
        .all-done-msg { margin-top: 8px; font-size: 13px; color: #6ee7b7; font-weight: 800;
          text-align: center; animation: lele-pulse 1.5s ease-in-out infinite; }

        .refresh-btn {
          flex-shrink: 0; background: linear-gradient(135deg,#3b5bdb,#1c3faa);
          border: none; border-radius: 20px; padding: 16px 22px; cursor: pointer;
          display: flex; flex-direction: column; align-items: center; gap: 6px;
          box-shadow: 0 4px 15px rgba(59,91,219,.5); transition: transform .15s, opacity .15s;
        }
        .refresh-btn:active { transform: scale(.93); }
        .refresh-btn.busy   { opacity: .5; cursor: not-allowed; }
        .refresh-btn .ricon { font-size: 28px; display: inline-block; }
        @keyframes lele-spin { to{transform:rotate(360deg)} }
        .refresh-btn .ricon.spin { animation: lele-spin .7s linear infinite; }
        .refresh-btn .rlabel { font-size: 13px; color: #fff; font-weight: 800; }

        /* 日期条 */
        .date-strip { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 4px;
          margin-bottom: 18px; scrollbar-width: none; }
        .date-strip::-webkit-scrollbar { display: none; }
        .date-chip { flex-shrink: 0; background: rgba(255,255,255,.06);
          border: 2px solid rgba(255,255,255,.1); border-radius: 18px;
          padding: 11px 18px; text-align: center; cursor: pointer;
          transition: all .2s; min-width: 80px; }
        .date-chip.sel { background: linear-gradient(135deg,#3b5bdb,#1864ab);
          border-color: #74b9ff; box-shadow: 0 0 20px rgba(59,91,219,.5); transform: scale(1.05); }
        .date-chip .wd { font-size: 11px; font-weight: 800; color: #74b9ff; margin-bottom: 4px; display: block; }
        .date-chip.sel .wd { color: #bfdbfe; }
        .date-chip .md { font-size: 20px; font-weight: 900; color: #8898aa; display: block; }
        .date-chip.sel .md { color: #fff; }

        /* 作业卡片 */
        .hw-card {
          background: linear-gradient(135deg,#141b42,#0d1540);
          border: 2px solid rgba(59,91,219,.35); border-radius: 24px;
          margin-bottom: 14px; overflow: hidden; display: flex; flex-direction: column;
          box-shadow: 0 8px 30px rgba(0,0,0,.4); transition: transform .2s, box-shadow .2s;
        }
        .hw-card:hover { transform: translateY(-2px); box-shadow: 0 12px 40px rgba(0,0,0,.5); }
        .hw-card.done  { border-color: rgba(47,158,68,.35); opacity: .82; }

        .hw-card-main { display: flex; }

        .subj-band { width: 108px; flex-shrink: 0; display: flex; flex-direction: column;
          align-items: center; justify-content: center; padding: 18px 8px; position: relative; overflow: hidden; }
        .subj-band::after { content: ''; position: absolute; inset: 0; background: rgba(255,255,255,.04); }
        .subj-name { font-size: 17px; font-weight: 900; color: #fff; letter-spacing: 2px;
          position: relative; z-index: 1; }

        .card-body  { flex: 1; padding: 20px 20px 20px 16px; }
        .card-title { font-size: 19px; font-weight: 900; color: #e8f0ff; line-height: 1.45;
          margin-bottom: 12px; white-space: pre-wrap; }
        .card-meta  { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .meta-chip  { font-size: 12px; font-weight: 800; color: #6c84aa;
          background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.08);
          border-radius: 50px; padding: 3px 10px; }

        .card-actions { padding: 14px 16px; background: rgba(0,0,0,.2);
          border-left: 1px solid rgba(255,255,255,.05); display: flex; flex-direction: column;
          justify-content: center; gap: 9px; min-width: 156px; flex-shrink: 0; }

        .act-btn { border: none; border-radius: 13px; padding: 11px 14px; font-size: 14px;
          font-weight: 900; cursor: pointer; display: flex; align-items: center;
          justify-content: center; gap: 7px; transition: transform .15s, filter .15s;
          width: 100%; text-decoration: none; font-family: inherit; }
        .act-btn:active { transform: scale(.93); filter: brightness(.88); }
        .btn-preview { background: linear-gradient(135deg,#1971c2,#0b4f8f); color: #fff;
          box-shadow: 0 4px 12px rgba(25,113,194,.4); }
        .btn-print   { background: linear-gradient(135deg,#e67700,#9a5000); color: #fff;
          box-shadow: 0 4px 12px rgba(230,119,0,.4); }
        .btn-checkin { background: linear-gradient(135deg,#ffd43b,#f08c00); color: #1a1a1a;
          box-shadow: 0 4px 14px rgba(255,212,59,.5); padding: 13px 14px; }
        .done-badge  { background: linear-gradient(135deg,#2f9e44,#155724); color: #fff;
          border-radius: 13px; padding: 13px 14px; font-size: 14px; font-weight: 900;
          text-align: center; box-shadow: 0 0 15px rgba(47,158,68,.4); width: 100%; }
        .btn-ai      { background: linear-gradient(135deg,#6366f1,#4338ca); color: #fff;
          box-shadow: 0 4px 12px rgba(99,102,241,.4); }
        .btn-ai:disabled { background: linear-gradient(135deg,#94a3b8,#64748b);
          box-shadow: none; cursor: not-allowed; }

        .hw-ai-section { border-top: 1px solid rgba(255,255,255,.06);
          padding: 12px 16px 14px; display: flex; flex-direction: column; gap: 10px; }
        .ai-expand   { background: rgba(99,102,241,.15); color: #a5b4fc;
          border: 1px solid rgba(99,102,241,.3); border-radius: 13px; }
        .hw-audio-section { border-top: 1px solid rgba(255,255,255,.06); padding: 12px 16px 14px; }
        .audio-label { font-size: 13px; color: #74b9ff; font-weight: 800; margin-bottom: 8px; }
        .audio-wrap { width: 100%; height: 56px; display: flex; align-items: center; overflow: hidden; }
        .audio-player { width: 71.4%; height: 40px; border-radius: 10px; display: block;
          transform: scale(1.4); transform-origin: left center; }

        .ai-content-box { padding: 16px; background: rgba(0,0,0,.25);
          border-radius: 14px; font-size: 14px; line-height: 1.8; color: #cbd5e1;
          white-space: pre-wrap; border: 1px solid rgba(255,255,255,.08); }

        /* ── 积分卡 ── */
        .points-card {
          background: linear-gradient(135deg,#0f1e6b,#1a2f8a);
          border: 2px solid #ffd43b;
          border-radius: 24px;
          padding: 18px 28px;
          margin-bottom: 18px;
          display: flex; align-items: center; gap: 20px; flex-wrap: wrap;
          box-shadow: 0 0 30px rgba(255,212,59,.2), inset 0 1px 0 rgba(255,255,255,.08);
          position: relative; overflow: hidden;
        }
        .points-card::after {
          content: '';
          position: absolute; top: -40px; right: -40px;
          width: 160px; height: 160px;
          background: radial-gradient(circle,rgba(255,212,59,.15),transparent 70%);
          pointer-events: none;
        }
        .points-star { font-size: 48px; flex-shrink: 0; filter: drop-shadow(0 0 12px rgba(255,212,59,.8)); }
        .points-main { flex: 1; min-width: 120px; }
        .points-label { font-size: 12px; font-weight: 800; color: #ffd43b; letter-spacing: 2px; margin-bottom: 4px; }
        .points-total { font-size: 48px; font-weight: 900; color: #fff; line-height: 1;
          text-shadow: 0 0 20px rgba(255,212,59,.5); }
        .points-unit  { font-size: 16px; color: #ffd43b; font-weight: 800; margin-left: 6px; }
        .points-divider { width: 2px; height: 60px; background: rgba(255,212,59,.25); flex-shrink: 0; }
        .points-yesterday { flex-shrink: 0; text-align: center; min-width: 120px; }
        .points-yd-label  { font-size: 12px; font-weight: 800; color: #a8b8d8; margin-bottom: 6px; }
        .points-yd-val    { font-size: 32px; font-weight: 900; line-height: 1; }
        .points-yd-val.pos { color: #69db7c; text-shadow: 0 0 12px rgba(105,219,124,.5); }
        .points-yd-val.neg { color: #ff6b6b; text-shadow: 0 0 12px rgba(255,107,107,.5); }
        .points-yd-val.zero { color: #6c84aa; }
        .points-yd-reason { font-size: 11px; color: #6c84aa; font-weight: 700; margin-top: 4px;
          max-width: 160px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        /* ── 积分规则面板 ── */
        .points-guide { flex-shrink: 0; min-width: 200px; }
        .guide-title  { font-size: 11px; font-weight: 800; color: #ffd43b;
          letter-spacing: 2px; margin-bottom: 10px; }
        .guide-rows   { display: flex; flex-direction: column; gap: 6px; }
        .guide-row    { display: flex; align-items: center; gap: 8px; }
        .guide-icon   { font-size: 16px; flex-shrink: 0; }
        .guide-desc   { font-size: 12px; font-weight: 700; color: #a8b8d8; flex: 1; line-height: 1.3; }
        .guide-pts    { font-size: 14px; font-weight: 900; flex-shrink: 0; min-width: 36px; text-align: right; }
        .guide-pts.g10 { color: #ffd43b; text-shadow: 0 0 8px rgba(255,212,59,.5); }
        .guide-pts.g8  { color: #74c0fc; }
        .guide-pts.g6  { color: #8ce99a; }
        .guide-pts.g0  { color: #4a5a7a; }

        /* 空状态 */
        .empty-state { background: linear-gradient(135deg,#141b42,#0d1540);
          border: 2px solid rgba(59,91,219,.25); border-radius: 24px;
          text-align: center; padding: 80px 40px; color: #4a5a7a; }
        .empty-state .ei { font-size: 72px; margin-bottom: 16px; }
        .empty-state p   { font-size: 20px; font-weight: 800; }

        /* 附加任务卡 */
        .vocab-card {
          display: flex; align-items: center; justify-content: space-between;
          background: linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e3a8a 100%);
          border: 1px solid rgba(167,139,250,.3);
          border-radius: 16px; padding: 16px 18px;
          margin: 0 0 16px; text-decoration: none; color: #fff;
          box-shadow: 0 4px 16px rgba(99,102,241,.2);
        }
        .vocab-card.vdone { opacity: .82; border-color: rgba(47,158,68,.4); }
        .vocab-left { display: flex; align-items: center; gap: 14px; min-width: 0; flex: 1; }
        .vocab-icon {
          font-size: 32px; flex-shrink: 0;
          width: 48px; height: 48px;
          display: flex; align-items: center; justify-content: center;
          background: rgba(167,139,250,.15);
          border-radius: 12px;
        }
        .vocab-title { font-size: 15px; font-weight: 900; color: #fff; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .vocab-badge {
          font-size: 11px; font-weight: 800; padding: 2px 8px; border-radius: 50px;
          background: rgba(252,165,165,.18); color: #fca5a5; border: 1px solid rgba(252,165,165,.3);
        }
        .vocab-badge.ok {
          background: rgba(110,231,183,.15); color: #6ee7b7; border-color: rgba(110,231,183,.3);
        }
        .vocab-sub { font-size: 12px; color: #c4b5fd; margin-top: 3px; font-weight: 600; }
        .vocab-right { text-align: right; flex-shrink: 0; }
        .vocab-mastered {
          font-size: 24px; font-weight: 900; color: #a78bfa; line-height: 1;
        }
        .vocab-mastered-label { font-size: 11px; color: #c4b5fd; margin-top: 4px; font-weight: 600; }
        .vocab-start-btn {
          flex-shrink: 0; margin-left: 14px;
          padding: 10px 18px; border-radius: 12px;
          font-size: 14px; font-weight: 800; white-space: nowrap;
          background: linear-gradient(135deg, #6366f1, #4f46e5); color: #fff;
          box-shadow: 0 4px 12px rgba(99,102,241,.4);
        }
        .vocab-start-btn.done {
          background: rgba(110,231,183,.15); color: #6ee7b7;
          border: 1px solid rgba(110,231,183,.3); box-shadow: none;
        }
        /* 紧凑的首页摘要和清晰的作业阅读区 */
        .lele-wrap { padding: 16px; }
        .points-card { padding: 12px 20px; margin-bottom: 12px; gap: 14px; overflow: visible; }
        .points-star { font-size: 34px; }
        .points-total { font-size: 36px; }
        .points-divider { height: 42px; }
        .points-yesterday { min-width: 90px; }
        .points-yd-label { margin-bottom: 3px; }
        .points-yd-val { font-size: 24px; }
        .points-details { position: relative; z-index: 2; }
        .points-details summary { cursor: pointer; color: #ffe27a; font-size: 15px; font-weight: 800; padding: 12px; border-radius: 12px; background: rgba(255,255,255,.08); }
        .points-details[open] .points-guide { position: absolute; right: 0; top: 100%; margin-top: 6px; padding: 16px; background: #121d4d; border: 1px solid #ffd43b; border-radius: 14px; box-shadow: 0 8px 24px #050a1c; }
        .hq { padding: 12px 20px; margin-bottom: 12px; gap: 16px; }
        .hq-rocket { font-size: 42px; }
        .hq-label { margin-bottom: 3px; }
        .hq-date { font-size: 24px; }
        .hq-sub { font-size: 13px; }
        .hq-progress { width: 220px; }
        .prog-pct { font-size: 30px; }
        .prog-bg { height: 12px; margin-top: 4px; }
        .refresh-btn { padding: 10px 14px; border-radius: 14px; gap: 2px; }
        .refresh-btn .ricon { font-size: 20px; }
        .date-strip { margin-bottom: 12px; }
        .date-chip { padding: 8px 14px; min-width: 70px; }
        .date-chip .md { font-size: 17px; }
        .vocab-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-bottom: 14px; }
        .vocab-grid .vocab-card { margin: 0; min-width: 0; }
        .hw-card { background: linear-gradient(135deg,#142454,#101c48); border-color: rgba(114,166,255,.6); border-radius: 18px; }
        .hw-card-main { display: flex; flex-direction: column; }
        .subj-band { width: auto; flex-direction: row; justify-content: flex-start; gap: 12px; padding: 16px 22px 6px; background: transparent; overflow: visible; }
        .subj-band::after { display: none; }
        .subject-icon-art { width: 48px; height: 48px; flex-shrink: 0; filter: drop-shadow(0 3px 6px rgba(0,0,0,.24)); }
        .subj-name { font-size: 21px; letter-spacing: 0; }
        .homework-status { font-size: 13px; font-weight: 800; color: #ffc0b8; background: rgba(251,146,146,.14); border: 1px solid rgba(251,146,146,.45); padding: 4px 10px; border-radius: 999px; }
        .homework-status.completed { color: #a8f0bd; background: rgba(70,200,110,.12); border-color: rgba(70,200,110,.4); }
        .card-body { padding: 6px 24px 14px; min-width: 0; }
        .card-title { font-size: 19px; line-height: 1.8; overflow-wrap: anywhere; font-weight: 700; }
        .card-actions { flex-direction: row; flex-wrap: wrap; justify-content: flex-end; align-items: flex-start; padding: 12px 22px 16px; background: transparent; border-left: 0; border-top: 1px solid rgba(180,205,255,.18); }
        .btn-print { background: linear-gradient(135deg,#11bba5,#087f79); box-shadow: 0 4px 12px rgba(17,187,165,.25); }
        .card-actions > .act-btn { width: 108px; min-width: 108px; min-height: 44px; }
        .card-actions .checkin-action { width: 108px; min-width: 108px; max-width: 100%; font-weight: bold; }
        .card-actions > .act-btn, .checkin-action button { font-size: 16px; height: 46px; border-radius: 13px; box-shadow: 0 4px 12px rgba(0,0,0,.25); }
        @media (min-width: 681px) {
          .hw-card-main { display: grid; grid-template-columns: minmax(0, 1fr) auto; }
          .subj-band { grid-column: 1 / -1; }
          .card-body { grid-column: 1; }
          .card-actions { grid-column: 2; align-self: end; border-top: 0; padding-top: 6px; }
        }
        @media (max-width: 680px) {
          .vocab-grid { grid-template-columns: 1fr; }
          .points-card { gap: 10px; }
          .points-main { min-width: 90px; }
          .points-divider { display: none; }
          .points-yesterday { min-width: 65px; max-width: 80px; }
          .points-yd-reason { max-width: 80px; }
          .points-label { letter-spacing: 0; }
          .points-details summary { font-size: 14px; }
          .hq-info { min-width: 130px; }
          .hq-progress { width: auto; flex: 1 1 180px; }
          .subj-band { padding: 14px 16px 6px; }
          .subject-icon-art { width: 42px; height: 42px; }
          .card-body { padding: 6px 18px 14px; }
          .card-actions { justify-content: flex-start; padding: 12px 16px 16px; }
          .card-actions > .act-btn { flex: 1; min-width: 78px; }
          .card-actions .checkin-action { flex: 1; width: auto; min-width: 78px; }
        }
      ` }} />

      <div className="lele-wrap">

        {/* ── 积分卡 ── */}
        <div className="points-card">
          <div className="points-star">⭐</div>
          <div className="points-main">
            <div className="points-label">🏆 乐乐的总积分</div>
            <div>
              <span className="points-total">{pointsData ? pointsData.total : '—'}</span>
              <span className="points-unit">分</span>
            </div>
          </div>
          <div className="points-divider" />
          <div className="points-yesterday">
            <div className="points-yd-label">昨日获得</div>
            {pointsData ? (
              <>
                <div className={`points-yd-val ${pointsData.yesterday.points > 0 ? 'pos' : pointsData.yesterday.points < 0 ? 'neg' : 'zero'}`}>
                  {pointsData.yesterday.hasRecord
                    ? (pointsData.yesterday.points > 0 ? `+${pointsData.yesterday.points}` : `${pointsData.yesterday.points}`)
                    : '—'}
                </div>
                {pointsData.yesterday.hasRecord && pointsData.yesterday.reason && (
                  <div className="points-yd-reason" title={pointsData.yesterday.reason}>
                    {pointsData.yesterday.reason}
                  </div>
                )}
              </>
            ) : (
              <div className="points-yd-val zero">—</div>
            )}
          </div>
          <div className="points-divider" />
          <details className="points-details">
            <summary>📋 积分规则</summary>
            <div className="points-guide">
            {pointsData ? (
              <>
                <div className="guide-title">{scoreGuide.title}</div>
                <div className="guide-rows">
                  {scoreGuide.rows.map((r, i) => (
                    <div key={i} className="guide-row">
                      <span className="guide-icon">{r.icon}</span>
                      <span className="guide-desc">{r.desc}</span>
                      <span className={`guide-pts ${r.cls}`}>{r.pts}分</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="guide-title" style={{color:'#6c84aa'}}>积分规则加载中…</div>
            )}
            </div>
          </details>
        </div>

        {/* 指挥中心 */}
        <div className="hq">
          <div className="hq-rocket">🚀</div>

          <div className="hq-info">
            <div className="hq-label">🛸 {isTodaySelected ? (currentWindow ? '假期/周末任务中心' : '今日任务中心') : '历史作业回顾'}</div>
            <div className="hq-date">{isTodaySelected && currentWindow ? `${currentWindow.windowStart} ~ ${currentWindow.windowEnd}` : displayDateStr}</div>
            <div className="hq-sub">{isTodaySelected && currentWindow ? '以下是整个假期/周末窗口的全部作业，加油完成！' : '加油，乐乐！今天的任务等你来完成！'}</div>
          </div>

          <div className="hq-progress">
            <div className="prog-header">
              <div>
                <div className="prog-label">完成进度</div>
                <div className="prog-sub">{!isTodaySelected && historicalStatus === null ? '状态暂不可用' : `${completedHomework} / ${totalHomework} 个任务`}</div>
              </div>
              <div className="prog-pct">{!isTodaySelected && historicalStatus === null ? '—' : `${progressRatio}%`}</div>
            </div>
            <div className="prog-bg">
              <div
                className="prog-fill"
                style={{
                  width: `${progressRatio}%`,
                  background: progressRatio === 100 && totalHomework > 0
                    ? 'linear-gradient(90deg,#40c057,#2f9e44)'
                    : 'linear-gradient(90deg,#00d2ff,#3b5bdb)',
                  boxShadow: progressRatio === 100 && totalHomework > 0
                    ? '0 0 12px rgba(64,192,87,.7)'
                    : '0 0 12px rgba(0,210,255,.7)',
                }}
              />
            </div>
            {(isTodaySelected || historicalStatus !== null) && progressRatio === 100 && totalHomework > 0 && (
              <div className="all-done-msg">🎉 今天的任务全部完成啦！太棒了！</div>
            )}
          </div>

          <button
            onClick={() => window.location.reload()}
            className="refresh-btn"
          >
            <span className="ricon">🔄</span>
            <span className="rlabel">刷新</span>
          </button>
        </div>

        {/* 日期选择器 */}
        <div className="date-strip">
          {last7Days.map((date, index) => {
            const isToday = index === 0
            const d = bjDateObj(date)
            const wd = isToday ? 'Today' : d.toLocaleDateString('zh-CN', { weekday: 'short' })
            const md = isToday ? '今天' : `${d.getMonth() + 1}/${d.getDate()}`
            return (
              <button
                key={date}
                onClick={() => setSelectedDate(date)}
                className={`date-chip${selectedDate === date ? ' sel' : ''}`}
              >
                <span className="wd">{wd}</span>
                <span className="md">{md}</span>
              </button>
            )
          })}
        </div>

        <div className="vocab-grid">
        <a href="/wordbook" className="vocab-card" style={{ background: 'linear-gradient(135deg,#163d55,#18505e,#173d63)', borderColor: 'rgba(110,231,183,.35)' }}>
          <div className="vocab-left">
            <div className="vocab-icon">📖</div>
            <div><div className="vocab-title" style={{ fontSize: 18 }}>必考单词本</div><div className="vocab-sub" style={{ fontSize: 15, color: '#c5f4e5' }}>四年级上册 · 按单元自由学习</div></div>
          </div>
          <div className="vocab-start-btn" style={{ background: '#235c64', fontSize: 16 }}>打开 ›</div>
        </a>

        {!isTodaySelected && (
          <div className={`vocab-card${vocabDone ? ' vdone' : ''}`}>
            <div className="vocab-left">
              <div className="vocab-icon">📚</div>
              <div>
                <div className="vocab-title">天天背单词
                  <span className={`vocab-badge${vocabDone ? ' ok' : ''}`}>
                    {historicalStatus === null ? '状态暂不可用' : vocabDone ? '✅ 已完成' : '未完成'}
                  </span>
                </div>
                <div className="vocab-sub">{historicalStatus === null ? '请刷新后重试' : vocabDone ? '当日单词任务已完成' : '当日单词任务未完成'}</div>
              </div>
            </div>
          </div>
        )}

        {/* 作业列表 */}
        {/* 每日英语单词 · 必做任务（每天自动生成在当天作业列表里，纳入完成进度）*/}
        {isTodaySelected && hasVocabTask && (
          <a href="/words" className={`vocab-card${vocabDone ? ' vdone' : ''}`}>
            <div className="vocab-left">
              <div className="vocab-icon">📚</div>
              <div>
                <div className="vocab-title">
                  天天背单词
                  <span className={`vocab-badge${vocabDone ? ' ok' : ''}`}>
                    {vocabDone ? '✅ 已完成' : '必做 · 待完成'}
                  </span>
                </div>
                <div className="vocab-sub">
                  {vocabDone
                    ? '今日单词任务已完成'
                    : `${vocabToday!.newCount} 个新词 + ${vocabToday!.reviewCount} 个复习`}
                </div>
              </div>
            </div>
            <div className="vocab-right">
              <div className="vocab-mastered">{vocabStats?.masteredCount ?? '—'}</div>
              <div className="vocab-mastered-label">已掌握</div>
            </div>
            <div className={`vocab-start-btn${vocabDone ? ' done' : ''}`}>
              {vocabDone ? '✅ 已完成' : '开始 ›'}
            </div>
          </a>
        )}

        </div>

        {displayHomework.length === 0 && !hasVocabTask && isTodaySelected && (
          <div className="empty-state">
            <div className="ei">📭</div>
            <p>这天暂时没有作业记录哦~</p>
          </div>
        )}

        {displayHomework.map((item: any) => {
          const uploadTime = new Date(item.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
          // 解析附件：优先 file_urls 数组；否则回落到单个 file_url
          let files: { url: string, type: string, filename?: string }[] = []
          if (item.file_urls) {
            try { files = JSON.parse(item.file_urls) } catch { files = [] }
          }
          if (files.length === 0 && item.file_url) {
            files = [{ url: item.file_url, type: item.file_type || 'image' }]
          }
          const audioFiles = files.filter(f => f.type === 'audio')
          const nonAudioFiles = files.filter(f => f.type !== 'audio')
          const typeCounts: Record<string, number> = {}
          files.forEach(f => { typeCounts[f.type] = (typeCounts[f.type] || 0) + 1 })
          return (
            <div key={item.id} className={`hw-card${item.is_completed ? ' done' : ''}`}>

              <div className="hw-card-main">
                <div className="subj-band">
                  <SubjectIcon subject={item.subject} />
                  <div className="subj-name">{item.subject}作业</div>
                  <span className={`homework-status${item.is_completed ? ' completed' : ''}`}>{item.is_completed ? '已完成' : '待完成'}</span>
                </div>

                <div className="card-body">
                  <div className="card-title">{item.content}</div>
                  <div className="card-meta">
                    <span className="meta-chip">🕒 上传：{uploadTime}</span>
                    {typeCounts.pdf   > 0 && <span className="meta-chip">📄 PDF附件{typeCounts.pdf   > 1 ? ` ×${typeCounts.pdf}`   : ''}</span>}
                    {typeCounts.image > 0 && <span className="meta-chip">🖼️ 图片附件{typeCounts.image > 1 ? ` ×${typeCounts.image}` : ''}</span>}
                    {typeCounts.word  > 0 && <span className="meta-chip">📝 Word附件{typeCounts.word  > 1 ? ` ×${typeCounts.word}`  : ''}</span>}
                    {typeCounts.audio > 0 && <span className="meta-chip">🎵 听力附件{typeCounts.audio > 1 ? ` ×${typeCounts.audio}` : ''}</span>}
                  </div>
                </div>

                <div className="card-actions">
                  {nonAudioFiles.length === 0 && <>
                    <button className="act-btn btn-preview" onClick={() => openTextHomework(item.content, false)}>👀 预览</button>
                    <button className="act-btn btn-print" onClick={() => openTextHomework(item.content, true)}>🖨️ 打印</button>
                  </>}
                  {nonAudioFiles.map((f, i) => (
                    <React.Fragment key={f.url}>
                      <a href={f.url} target="_blank" rel="noopener noreferrer" className="act-btn btn-preview">
                        👀 预览{nonAudioFiles.length > 1 ? ` ${i + 1}` : ''}
                      </a>
                      <button className="act-btn btn-print" onClick={(e) => handlePrint(e, f.url)}>
                        🖨️ 打印{nonAudioFiles.length > 1 ? ` ${i + 1}` : ''}
                      </button>
                    </React.Fragment>
                  ))}
                  {item.is_completed ? (
                    <div className="done-badge">✅ 已完成打卡！</div>
                  ) : (
                    <div className="checkin-action">
                      <CheckInButton id={item.id} isCompleted={item.is_completed} submitType={item.submit_type} />
                    </div>
                  )}
                </div>
              </div>

              {audioFiles.length > 0 && (
                <div className="hw-audio-section">
                  {audioFiles.map((f, i) => (
                    <div key={f.url} style={{ marginBottom: i < audioFiles.length - 1 ? 12 : 0 }}>
                      <div className="audio-label">🎵 英语听力{audioFiles.length > 1 ? ` ${i + 1}` : ''}</div>
                      <div className="audio-wrap">
                        <audio controls src={f.url} className="audio-player" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {item.is_completed && (() => {
                const feedback = localFeedback[item.id] || item.ai_feedback
                if (feedback) {
                  const expanded = expandedFeedback.has(item.id)
                  return (
                    <div className="hw-ai-section">
                      <button
                        className="act-btn ai-expand"
                        onClick={() => setExpandedFeedback(prev => {
                          const s = new Set(prev)
                          expanded ? s.delete(item.id) : s.add(item.id)
                          return s
                        })}
                      >
                        {expanded ? '▲ 收起AI分析' : '📊 查看AI分析结果'}
                      </button>
                      {expanded && <div className="ai-content-box">{cleanMarkdown(feedback)}</div>}
                    </div>
                  )
                }
                return (
                  <div className="hw-ai-section">
                    <button className="act-btn btn-ai" onClick={() => handleAnalyze(item.id)} disabled={analyzing.has(item.id)}>
                      {analyzing.has(item.id) ? '🤖 AI分析中...' : '🤖 AI检查作业'}
                    </button>
                  </div>
                )
              })()}

            </div>
          )
        })}

      </div>
    </>
  )
}
