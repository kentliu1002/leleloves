'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import './wordbook.css'
import { audioUrls, downloadWordbookAudio, WORDBOOK_AUDIO_CACHE } from '../../lib/wordbook-cache.mjs'

type Word = { id: number; word: string; ipa: string; meaning_zh: string; example_en: string; example_zh: string; word_audio_url: string; example_audio_url: string }
type Unit = { unit: number; words: Word[] }

export default function WordbookPage() {
  const [units, setUnits] = useState<Unit[]>([])
  const [unitIndex, setUnitIndex] = useState(0)
  const [selected, setSelected] = useState<Word | null>(null)
  const [pronunciations, setPronunciations] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [audioError, setAudioError] = useState('')
  const [retry, setRetry] = useState(0)
  const [download, setDownload] = useState({ done: 0, total: 0, active: false, error: '' })
  const downloadActive = useRef(false)
  const detailRef = useRef<HTMLElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError('')
    fetch('/api/vocab/library', { signal: controller.signal })
      .then(async res => { const data = await res.json(); if (!res.ok) throw new Error(data.error || '单词书加载失败'); return data })
      .then(data => { setUnits(data.units || []); setLoading(false) })
      .catch(e => { if (e.name !== 'AbortError') { setError('单词书暂时打不开，请再试一次。'); setLoading(false) } })
    return () => controller.abort()
  }, [retry])

  useEffect(() => {
    if (!units.length || !('serviceWorker' in navigator) || !('caches' in window)) return
    let cancelled = false
    ;(async () => {
      const names = await caches.keys()
      if (!names.includes(WORDBOOK_AUDIO_CACHE)) return
      const urls = audioUrls(units)
      const cache = await caches.open(WORDBOOK_AUDIO_CACHE)
      const saved = new Set((await cache.keys()).map(request => request.url))
      const done = urls.filter(url => saved.has(url)).length
      if (done) await navigator.serviceWorker.register('/wordbook-audio-sw.js', { scope: '/wordbook' })
      if (!cancelled) setDownload({ done, total: urls.length, active: false, error: '' })
    })().catch(() => {})
    return () => { cancelled = true }
  }, [units])

  const downloadAudio = async () => {
    if (downloadActive.current) return
    downloadActive.current = true
    try {
      if (!('serviceWorker' in navigator) || !('caches' in window)) throw new Error('当前浏览器暂不支持下载，请使用新版 Safari 或 Chrome。')
      const urls = audioUrls(units)
      setDownload({ done: download.done, total: urls.length, active: true, error: '' })
      await navigator.serviceWorker.register('/wordbook-audio-sw.js', { scope: '/wordbook' })
      await navigator.serviceWorker.ready
      const cache = await caches.open(WORDBOOK_AUDIO_CACHE)
      await downloadWordbookAudio(urls, cache, (url: string) => fetch(url, { mode: 'cors' }), (done: number, total: number) => {
        setDownload({ done, total, active: true, error: '' })
      })
      setDownload({ done: urls.length, total: urls.length, active: false, error: '' })
    } catch (e: any) {
      setDownload(prev => ({ ...prev, active: false, error: e.message || '下载中断，请检查网络后重试。' }))
    } finally { downloadActive.current = false }
  }

  const chooseWord = (word: Word, scrollToCard = true) => {
    audioRef.current?.pause()
    setSelected(word); setAudioError('')
    if (!word.ipa && pronunciations[word.id] === undefined) {
      setPronunciations(prev => ({ ...prev, [word.id]: '正在查找音标…' }))
      fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.word)}`)
        .then(res => res.ok ? res.json() : [])
        .then(data => {
          const ipa = Array.isArray(data) ? data.flatMap((entry: any) => [entry.phonetic, ...(entry.phonetics || []).map((p: any) => p.text)]).find((value: unknown) => typeof value === 'string' && value.trim()) : ''
          setPronunciations(prev => ({ ...prev, [word.id]: ipa || '暂无音标' }))
        })
        .catch(() => setPronunciations(prev => ({ ...prev, [word.id]: '暂无音标' })))
    }
    if (scrollToCard) setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'auto', block: 'start' }), 0)
  }

  const playAudio = (url: string) => {
    if (!audioRef.current || !url) return
    setAudioError('')
    audioRef.current.src = url
    audioRef.current.play().catch(() => setAudioError('发音暂时无法播放，请稍后再试。'))
  }

  const current = units[unitIndex]
  const selectedIndex = selected ? (current?.words.findIndex(word => word.id === selected.id) ?? -1) : -1
  return (
    <main className="wordbook">
      <div className="wordbook-shell">
        <header className="wordbook-header">
          <Link href="/" className="wordbook-back">← 返回首页</Link>
          <span className="wordbook-header-title">📚 我的单词书</span>
        </header>
        <section className="wordbook-hero">
          <div className="wordbook-eyebrow">MY WORD BOOK · 我的英语小天地</div>
          <h1>单词书 <span>✦</span></h1>
          <p>跟着课本，一起认识新朋友。<br />挑一个单元，再点单词听一听、读一读！</p>
          <div className="wordbook-book">📖 <strong>四年级上册</strong><span>{loading ? '正在打开…' : `${units.length} 个单元 · ${units.reduce((n, unit) => n + unit.words.length, 0)} 个单词`}</span></div>
          <div className="wordbook-orbit" aria-hidden="true">Aa<span>✦</span></div>
        </section>

        {loading && <p className="wordbook-notice" role="status">正在打开单词书…</p>}
        {error && <div className="wordbook-notice" role="alert"><p>{error}</p><button className="wordbook-action" onClick={() => setRetry(n => n + 1)}>重新打开</button></div>}
        {!loading && !error && <>
          <section className="wordbook-download" aria-label="下载本册音频">
            <div className="wordbook-download-copy">
              <strong>🎧 下载本册音频</strong>
              <p>保存在这台设备，之后播放更快。打开单词书仍需联网。</p>
              {download.total > 0 && <div className="wordbook-download-progress" role="status">{download.active ? '正在下载' : download.done === download.total ? '已下载完成' : '已下载'} {download.done} / {download.total} 个音频</div>}
              {download.error && <div className="wordbook-error" role="alert">下载未完成：{download.error}</div>}
            </div>
            <button className="wordbook-download-button" type="button" disabled={download.active || (download.total > 0 && download.done === download.total)} onClick={downloadAudio}>
              {download.active ? '下载中…' : download.total > 0 && download.done === download.total ? '✓ 已下载' : download.done > 0 ? '继续下载' : '下载到本机'}
            </button>
          </section>
          <section className="wordbook-section" aria-label="选择单元">
            <div className="wordbook-heading"><div><span>STEP 01</span><h2>选择单元</h2></div><p>先选一个想学的单元</p></div>
            <div className="wordbook-units">
              {units.map((unit, index) => <button key={unit.unit} type="button" aria-pressed={unitIndex === index} className={`wordbook-unit${unitIndex === index ? ' active' : ''}`} onClick={() => { setUnitIndex(index); setSelected(null); setAudioError('') }}>
                <span>UNIT</span><strong>{String(unit.unit).padStart(2, '0')}</strong><small>{unit.words.length} 个词</small>
              </button>)}
            </div>
          </section>

          {selected && <section ref={detailRef} className="wordbook-detail" aria-label="单词学习卡片" aria-live="polite">
            <div className="wordbook-detail-top"><span>📖 单词学习卡</span><button className="wordbook-close" onClick={() => setSelected(null)} aria-label="关闭学习卡片">✕</button></div>
            <div className="wordbook-navigation" aria-label="单元内单词切换">
              <button type="button" disabled={selectedIndex <= 0} onClick={() => chooseWord(current.words[selectedIndex - 1], false)}>← 上一个</button>
              <span>{selectedIndex + 1} / {current.words.length}</span>
              <button type="button" disabled={selectedIndex < 0 || selectedIndex >= current.words.length - 1} onClick={() => chooseWord(current.words[selectedIndex + 1], false)}>下一个 →</button>
            </div>
            <p className="wordbook-audio-note">🔊 AI 生成的英语发音</p>
            <div className="wordbook-detail-word">{selected.word}</div>
            <div className="wordbook-ipa">{selected.ipa || pronunciations[selected.id] || '暂无音标'}</div>
            <div className="wordbook-meaning">{selected.meaning_zh}</div>
            <button className="wordbook-sound" disabled={!selected.word_audio_url} onClick={() => playAudio(selected.word_audio_url)}>🔊 听单词发音</button>
            {!selected.word_audio_url && <p className="wordbook-error">单词发音暂未准备好。</p>}
            {audioError && <p className="wordbook-error" role="status">{audioError}</p>}
            <div className="wordbook-example">
              <div className="wordbook-example-label">✦ 例句时间</div>
              {selected.example_en && selected.example_zh ? <>
                <p className="wordbook-example-en">{selected.example_en}</p><p className="wordbook-example-zh">{selected.example_zh}</p>
                <button className="wordbook-listen" disabled={!selected.example_audio_url} onClick={() => playAudio(selected.example_audio_url)}>🔊 朗读例句</button>
                {!selected.example_audio_url && <p className="wordbook-example-status">例句朗读暂未准备好。</p>}
              </> : <p className="wordbook-example-status">例句暂未准备好。</p>}
            </div>
          </section>}

          <section className="wordbook-section" aria-label="单词列表">
            <div className="wordbook-heading"><div><span>STEP 02</span><h2>Unit {current?.unit} 单词</h2></div><p>点任意单词开始学习</p></div>
            <div className="wordbook-words">
              {current?.words.map((word, index) => <button type="button" key={word.id} className={`wordbook-word${selected?.id === word.id ? ' active' : ''}`} aria-pressed={selected?.id === word.id} onClick={() => chooseWord(word)}>
                <span className="wordbook-word-number">{String(index + 1).padStart(2, '0')}</span><span className="wordbook-word-text"><strong>{word.word}</strong><span>{word.meaning_zh}</span></span><span className="wordbook-arrow" aria-hidden="true">›</span>
              </button>)}
            </div>
            {current && !current.words.length && <p className="wordbook-notice">这个单元暂时没有单词。</p>}
          </section>
        </>}
        <p className="wordbook-footer">每天读一读，慢慢积累也很棒 ✨</p>
      </div>
      <audio ref={audioRef} onError={() => setAudioError('发音暂时无法播放，请稍后再试。')} />
    </main>
  )
}
