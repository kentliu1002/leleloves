'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

interface Word {
  id: number
  word: string
  ipa: string
  meaning_zh: string
  topic: string
}

type Phase = 'loading' | 'noTopics' | 'reviewQuiz' | 'newStudy' | 'newQuiz' | 'done'

function audioUrl(word: string) {
  return `https://dict.youdao.com/dictvoice?type=0&audio=${encodeURIComponent(word)}`
}

export default function WordsPage() {
  const [phase, setPhase] = useState<Phase>('loading')
  const [newWords, setNewWords] = useState<Word[]>([])
  const [reviewWords, setReviewWords] = useState<Word[]>([])
  const [warning, setWarning] = useState<string>('')

  // 当前进度
  const [idx, setIdx] = useState(0)            // 当前在 currentList 的位置
  const [studyIdx, setStudyIdx] = useState(0)  // newStudy 阶段的卡片位置
  const [input, setInput] = useState('')
  const [wrong, setWrong] = useState(false)
  const [attemptNo, setAttemptNo] = useState(1)
  const audioRef = useRef<HTMLAudioElement>(null)
  // 例句缓存: { [wordId]: { en, zh } | 'loading' | 'error' }
  const [examples, setExamples] = useState<Record<number, { en: string, zh: string } | 'loading' | 'error'>>({})

  // 额外组（完成硬性任务后自愿继续，每组 +5 分，每天上限）
  const [isExtra, setIsExtra] = useState(false)
  const [extraGroupsToday, setExtraGroupsToday] = useState(0)
  const [maxPerDay, setMaxPerDay] = useState(3)
  const [startingExtra, setStartingExtra] = useState(false)

  // 拉今日 session
  useEffect(() => {
    fetch('/api/vocab/today').then(r => r.json()).then(d => {
      if (d.warning) { setWarning(d.warning); setPhase('noTopics'); return }
      setNewWords(d.newWords || [])
      setReviewWords(d.reviewWords || [])
      if (typeof d.extraGroupsToday === 'number') setExtraGroupsToday(d.extraGroupsToday)
      if (d.completedToday) { setPhase('done'); return }
      if ((d.reviewWords || []).length > 0) setPhase('reviewQuiz')
      else if ((d.newWords || []).length > 0) setPhase('newStudy')
      else { setPhase('done') }
    }).catch(() => setPhase('done'))
  }, [])

  const currentList = phase === 'reviewQuiz' ? reviewWords : phase === 'newQuiz' ? newWords : []
  const currentWord = currentList[idx]

  // newStudy 阶段：预拉当前 + 下一个词的例句
  useEffect(() => {
    if (phase !== 'newStudy') return
    const idsToFetch = [studyIdx, studyIdx + 1]
      .map(i => newWords[i]?.id)
      .filter(Boolean) as number[]
    idsToFetch.forEach(id => {
      if (examples[id]) return
      setExamples(prev => ({ ...prev, [id]: 'loading' }))
      fetch(`/api/vocab/example?id=${id}`)
        .then(r => r.json())
        .then(d => {
          if (d.en && d.zh) {
            setExamples(prev => ({ ...prev, [id]: { en: d.en, zh: d.zh } }))
          } else {
            setExamples(prev => ({ ...prev, [id]: 'error' }))
          }
        })
        .catch(() => setExamples(prev => ({ ...prev, [id]: 'error' })))
    })
  }, [phase, studyIdx, newWords])

  const playAudio = (word: string) => {
    if (audioRef.current) {
      audioRef.current.src = audioUrl(word)
      audioRef.current.play().catch(() => {})
    }
  }

  // 句子用浏览器内置 TTS（有道只支持单词，整句会 500）
  const playSentence = (sentence: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(sentence)
    u.lang = 'en-US'
    u.rate = 0.85
    u.pitch = 1.0
    window.speechSynthesis.speak(u)
  }

  const submitAttempt = async (correct: boolean) => {
    if (!currentWord) return
    try {
      await fetch('/api/vocab/attempt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wordId: currentWord.id,
          kind: phase === 'reviewQuiz' ? 'review' : 'new',
          correct,
          attempt_no: attemptNo
        })
      })
    } catch {}
  }

  const onSubmit = async () => {
    if (!currentWord) return
    const target = currentWord.word.toLowerCase().trim()
    const got = input.toLowerCase().trim()
    const correct = got === target
    await submitAttempt(correct)
    if (correct) {
      // 进入下一个
      setInput('')
      setWrong(false)
      setAttemptNo(1)
      if (idx + 1 < currentList.length) {
        setIdx(idx + 1)
      } else {
        // 当前阶段结束
        if (phase === 'reviewQuiz') {
          if (newWords.length > 0) { setPhase('newStudy'); setStudyIdx(0); setIdx(0) }
          else { await finishGroup() }
        } else if (phase === 'newQuiz') {
          await finishGroup()
        }
      }
    } else {
      setWrong(true)
    }
  }

  const onRetry = () => {
    setInput('')
    setWrong(false)
    setAttemptNo(attemptNo + 1)
  }

  const onShowHint = () => {
    // 回到提示卡片：复用 newStudy 单卡视图临时展示当前 quiz 词
    setWrong(false)
    setHintingWord(currentWord)
  }

  const [hintingWord, setHintingWord] = useState<Word | null>(null)
  const closeHint = () => setHintingWord(null)

  // 一组结束：硬性组标记完成(+5)，额外组发额外 +5
  const finishGroup = async () => {
    if (isExtra) {
      try {
        const r = await fetch('/api/vocab/extra', { method: 'POST' }).then(r => r.json())
        if (typeof r.extraGroupsToday === 'number') setExtraGroupsToday(r.extraGroupsToday)
        if (typeof r.maxPerDay === 'number') setMaxPerDay(r.maxPerDay)
      } catch {}
    } else {
      try { await fetch('/api/vocab/complete', { method: 'POST' }) } catch {}
    }
    setIsExtra(false)
    setPhase('done')
  }

  // 开始额外一组
  const startExtra = async () => {
    setStartingExtra(true)
    try {
      const d = await fetch('/api/vocab/extra').then(r => r.json())
      if (d.error) {
        if (typeof d.extraGroupsToday === 'number') setExtraGroupsToday(d.extraGroupsToday)
        if (typeof d.maxPerDay === 'number') setMaxPerDay(d.maxPerDay)
        setStartingExtra(false)
        return
      }
      setReviewWords(d.reviewWords || [])
      setNewWords(d.newWords || [])
      if (typeof d.maxPerDay === 'number') setMaxPerDay(d.maxPerDay)
      setExamples({})
      setIdx(0); setStudyIdx(0); setInput(''); setWrong(false); setAttemptNo(1)
      setIsExtra(true)
      if ((d.reviewWords || []).length > 0) setPhase('reviewQuiz')
      else if ((d.newWords || []).length > 0) setPhase('newStudy')
      else setPhase('done')
    } catch {}
    setStartingExtra(false)
  }

  const onStudyNext = () => {
    if (studyIdx + 1 < newWords.length) {
      setStudyIdx(studyIdx + 1)
    } else {
      setPhase('newQuiz')
      setIdx(0)
      setInput('')
      setAttemptNo(1)
    }
  }

  return (
    <main className="words-page">
      <audio ref={audioRef} />
      <div className="top-bar">
        <Link href="/" className="back-btn">← 返回</Link>
        <div className="title">📚 英语单词附加任务</div>
      </div>

      {phase === 'loading' && <div className="center">加载中…</div>}

      {phase === 'noTopics' && (
        <div className="center notice-card">
          <div className="big-emoji">📭</div>
          <div className="notice-title">尚未设置考查范围</div>
          <div className="notice-text">{warning}</div>
        </div>
      )}

      {phase === 'done' && (
        <div className="center notice-card">
          <div className="big-emoji">🎉</div>
          <div className="notice-title">今日单词任务已完成</div>
          <div className="notice-text">硬性任务已获得 +5 积分。</div>
          {extraGroupsToday > 0 && (
            <div className="notice-text">🎁 额外完成 {extraGroupsToday} 组，额外 +{extraGroupsToday * 5} 积分！</div>
          )}
          {extraGroupsToday < maxPerDay ? (
            <>
              <div className="notice-text">
                还想继续吗？再完成一组（5复习+5新词）可得 +5 积分（{extraGroupsToday}/{maxPerDay}）
              </div>
              <button className="primary-btn" onClick={startExtra} disabled={startingExtra}>
                {startingExtra ? '准备中…' : '🚀 再来一组 +5'}
              </button>
            </>
          ) : (
            <div className="notice-text">今日额外组已达上限（{maxPerDay}/{maxPerDay}），明天再来吧！💪</div>
          )}
          <Link href="/" className="back-home-btn">回到首页</Link>
        </div>
      )}

      {(phase === 'reviewQuiz' || phase === 'newQuiz') && currentWord && !hintingWord && (
        <div className="quiz-card">
          <div className="quiz-phase-label">
            {(isExtra ? '🎁 额外组 · ' : '') + (phase === 'reviewQuiz' ? '🔁 复习阶段' : '✨ 新词测试')}
            <span className="progress-label">{idx + 1} / {currentList.length}</span>
          </div>
          <div className="quiz-meaning">{currentWord.meaning_zh}</div>
          <div className="quiz-letters">
            {currentWord.word.split('').map((ch, i) => (
              <span key={i} className="letter-slot">
                {input[i] ? input[i] : '_'}
              </span>
            ))}
          </div>
          <input
            className="quiz-input"
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            maxLength={currentWord.word.length}
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            placeholder={`输入 ${currentWord.word.length} 个字母`}
            disabled={wrong}
            onKeyDown={(e) => { if (e.key === 'Enter' && !wrong) onSubmit() }}
          />
          {!wrong && (
            <button className="primary-btn" onClick={onSubmit} disabled={input.length === 0}>
              ✅ 提交答案
            </button>
          )}
          {wrong && (
            <div className="wrong-actions">
              <div className="wrong-msg">❌ 答错了</div>
              <div className="wrong-btn-row">
                <button className="retry-btn" onClick={onRetry}>✏️ 重新填写</button>
                <button className="hint-btn" onClick={onShowHint}>💡 查看提示</button>
              </div>
            </div>
          )}
        </div>
      )}

      {hintingWord && (
        <div className="study-card">
          <div className="hint-badge">💡 提示</div>
          <div className="big-word">{hintingWord.word}</div>
          <div className="big-ipa">{hintingWord.ipa}</div>
          <button className="audio-btn" onClick={() => playAudio(hintingWord.word)}>🔊 播放发音</button>
          <div className="big-meaning">{hintingWord.meaning_zh}</div>
          <button className="primary-btn" onClick={closeHint}>📝 我记住了，重新作答</button>
        </div>
      )}

      {phase === 'newStudy' && newWords[studyIdx] && (() => {
        const w = newWords[studyIdx]
        const ex = examples[w.id]
        return (
          <div className="study-card">
            <div className="study-phase-label">
              {isExtra ? '🎁 额外组 · ✨ 学习新单词' : '✨ 学习新单词'}
              <span className="progress-label">{studyIdx + 1} / {newWords.length}</span>
            </div>
            <div className="big-word">{w.word}</div>
            <div className="big-ipa">{w.ipa}</div>
            <button className="audio-btn" onClick={() => playAudio(w.word)}>🔊 播放发音</button>
            <div className="big-meaning">{w.meaning_zh}</div>

            <div className="example-section">
              <div className="example-label">📖 例句</div>
              {!ex || ex === 'loading' ? (
                <div className="example-loading">正在生成例句…</div>
              ) : ex === 'error' ? (
                <div className="example-error">例句生成失败</div>
              ) : (
                <>
                  <div className="example-en">{ex.en}</div>
                  <button className="audio-btn small" onClick={() => playSentence(ex.en)}>🔊 朗读例句</button>
                  <div className="example-zh">{ex.zh}</div>
                </>
              )}
            </div>

            <button className="primary-btn" onClick={onStudyNext}>
              {studyIdx + 1 < newWords.length ? '下一个 →' : '开始测试 →'}
            </button>
          </div>
        )
      })()}

      <style jsx global>{`
        body { background: #0a0e27; }
      `}</style>
      <style jsx>{`
        .words-page {
          min-height: 100vh; background: #0a0e27; color: #fff;
          padding: 16px; box-sizing: border-box;
          display: flex; flex-direction: column; gap: 16px;
        }
        .top-bar {
          display: flex; align-items: center; gap: 12px;
          padding-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,.06);
        }
        .back-btn {
          color: #74b9ff; text-decoration: none; font-size: 14px;
          padding: 6px 10px; border-radius: 8px;
          background: rgba(116,185,255,.12);
          border: 1px solid rgba(116,185,255,.25);
        }
        .title { font-size: 16px; font-weight: 900; }
        .center { text-align: center; padding: 60px 20px; color: #a8b8d8; }

        .notice-card {
          background: linear-gradient(135deg,#1a2156,#0d1540);
          border: 1px solid rgba(255,255,255,.08);
          border-radius: 16px; padding: 30px 20px;
          display: flex; flex-direction: column; align-items: center; gap: 12px;
        }
        .big-emoji { font-size: 50px; }
        .notice-title { font-size: 18px; font-weight: 900; color: #fff; }
        .notice-text { font-size: 14px; color: #a8b8d8; line-height: 1.6; }
        .back-home-btn {
          margin-top: 8px;
          background: linear-gradient(135deg,#3b5bdb,#1c3faa);
          color: #fff; text-decoration: none;
          padding: 10px 24px; border-radius: 10px; font-weight: bold;
        }

        .quiz-card, .study-card {
          background: linear-gradient(135deg,#1a2156,#0d1540);
          border: 1px solid rgba(255,255,255,.08);
          border-radius: 16px; padding: 28px 18px;
          display: flex; flex-direction: column; align-items: center; gap: 18px;
        }
        .quiz-phase-label, .study-phase-label {
          width: 100%; display: flex; justify-content: space-between; align-items: center;
          font-size: 13px; color: #74b9ff; font-weight: 700;
        }
        .progress-label {
          background: rgba(255,255,255,.06);
          padding: 3px 10px; border-radius: 50px;
          color: #a8b8d8; font-size: 12px;
        }
        .quiz-meaning {
          font-size: 26px; font-weight: 900; color: #fff;
          text-align: center; line-height: 1.4;
        }
        .quiz-letters {
          display: flex; gap: 8px; flex-wrap: wrap; justify-content: center;
        }
        .letter-slot {
          width: 32px; height: 40px;
          border-bottom: 2px solid #74b9ff;
          display: flex; align-items: center; justify-content: center;
          font-size: 22px; font-weight: 800; color: #00d2ff;
        }
        .quiz-input {
          width: 100%; padding: 14px;
          background: rgba(255,255,255,.06);
          border: 1px solid rgba(116,185,255,.3);
          border-radius: 12px;
          font-size: 22px; color: #fff;
          text-align: center; letter-spacing: 4px;
          font-weight: 600;
          outline: none;
        }
        .quiz-input::placeholder { color: #6b7ba8; font-size: 14px; letter-spacing: 0; }
        .quiz-input:disabled { opacity: 0.6; }

        .primary-btn {
          width: 100%;
          background: linear-gradient(135deg,#3b5bdb,#1c3faa);
          color: #fff; border: none;
          padding: 14px 0; border-radius: 12px;
          font-size: 16px; font-weight: bold;
          box-shadow: 0 4px 14px rgba(59,91,219,.4);
        }
        .primary-btn:disabled { opacity: 0.5; }

        .wrong-actions { width: 100%; display: flex; flex-direction: column; gap: 10px; }
        .wrong-msg {
          text-align: center; font-size: 18px; font-weight: 900;
          color: #fca5a5;
        }
        .wrong-btn-row { display: flex; gap: 10px; }
        .retry-btn, .hint-btn {
          flex: 1; padding: 12px 0; border-radius: 10px;
          font-size: 14px; font-weight: bold; border: none;
        }
        .retry-btn {
          background: rgba(110,231,183,.15); color: #6ee7b7;
          border: 1px solid rgba(110,231,183,.25);
        }
        .hint-btn {
          background: rgba(252,211,77,.15); color: #fcd34d;
          border: 1px solid rgba(252,211,77,.25);
        }

        .big-word {
          font-size: 44px; font-weight: 900; color: #fff;
          letter-spacing: 1px;
        }
        .big-ipa { font-size: 18px; color: #74b9ff; font-style: italic; }
        .big-meaning { font-size: 22px; color: #fff; font-weight: 700; text-align: center; }
        .audio-btn {
          background: rgba(116,185,255,.15);
          color: #74b9ff;
          border: 1px solid rgba(116,185,255,.3);
          padding: 10px 24px; border-radius: 50px;
          font-size: 14px; font-weight: bold;
        }
        .hint-badge {
          font-size: 12px; color: #fcd34d; font-weight: 900;
          background: rgba(252,211,77,.15);
          padding: 4px 12px; border-radius: 50px;
          border: 1px solid rgba(252,211,77,.25);
        }

        /* 例句区 */
        .example-section {
          width: 100%;
          background: rgba(0,0,0,.25);
          border: 1px solid rgba(116,185,255,.15);
          border-radius: 12px;
          padding: 14px;
          display: flex; flex-direction: column; align-items: center; gap: 10px;
          margin-top: 4px;
        }
        .example-label {
          font-size: 12px; color: #74b9ff; font-weight: 800;
          letter-spacing: 1px; align-self: flex-start;
        }
        .example-loading { color: #6b7ba8; font-size: 14px; padding: 8px 0; }
        .example-error { color: #fca5a5; font-size: 13px; padding: 8px 0; }
        .example-en {
          font-size: 18px; color: #fff; font-weight: 600;
          text-align: center; line-height: 1.5;
        }
        .example-zh {
          font-size: 14px; color: #a8b8d8;
          text-align: center; line-height: 1.5;
        }
        .audio-btn.small {
          padding: 6px 16px; font-size: 13px;
        }
      `}</style>
    </main>
  )
}
