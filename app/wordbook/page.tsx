'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import './wordbook.css'
import { audioUrls, downloadWordbookAudio, downloadWordbookShell, downloadWordbookIpa, WORDBOOK_AUDIO_CACHE, WORDBOOK_OFFLINE_CACHE, WORDBOOK_IPA_PATH } from '../../lib/wordbook-cache.mjs'

type Word = { id: number; word: string; ipa: string; meaning_zh: string; example_en: string; example_zh: string; word_audio_url: string; example_audio_url: string }
type Unit = { unit: number; words: Word[] }

async function waitForOfflineWorker() {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { navigator.serviceWorker.removeEventListener('controllerchange', check); reject(new Error('离线功能启动失败，请刷新后重试。')) }, 15000)
    function check() {
      const worker = navigator.serviceWorker.controller
      if (!worker) return
      const channel = new MessageChannel()
      channel.port1.onmessage = event => {
        channel.port1.close()
        if (event.data !== 'wordbook-offline-v1') return
        clearTimeout(timer); navigator.serviceWorker.removeEventListener('controllerchange', check); resolve()
      }
      worker.postMessage({ type: 'WORDBOOK_OFFLINE_VERSION' }, [channel.port2])
    }
    navigator.serviceWorker.addEventListener('controllerchange', check)
    check()
  })
}

export default function WordbookPage() {
  const [units, setUnits] = useState<Unit[]>([])
  const [unitIndex, setUnitIndex] = useState(0)
  const [selected, setSelected] = useState<Word | null>(null)
  const [pronunciations, setPronunciations] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [audioError, setAudioError] = useState('')
  const [retry, setRetry] = useState(0)
  const [download, setDownload] = useState({ done: 0, total: 0, active: false, ready: false, missingIpa: 0, phase: '', error: '' })
  const [offline, setOffline] = useState(false)
  const downloadActive = useRef(false)
  const detailRef = useRef<HTMLElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError('')
    fetch('/api/vocab/library', { signal: controller.signal })
      .then(async res => { const data = await res.json(); if (!res.ok) throw new Error(data.error || '单词书加载失败'); return data })
      .then(data => { setUnits(data.units || []); setLoading(false) })
      .catch(e => { if (e.name !== 'AbortError') { setError('必考单词本暂时打不开，请联网后重试。'); setLoading(false) } })
    return () => controller.abort()
  }, [retry])

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine)
    update()
    window.addEventListener('online', update); window.addEventListener('offline', update)
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update) }
  }, [])

  useEffect(() => {
    if (!units.length || !('serviceWorker' in navigator) || !('caches' in window)) return
    let cancelled = false
    ;(async () => {
      const names = await caches.keys()
      const urls = audioUrls(units)
      let done = 0, ready = false, missingIpa = 0
      if (names.includes(WORDBOOK_AUDIO_CACHE)) {
        const cache = await caches.open(WORDBOOK_AUDIO_CACHE)
        const saved = new Set((await cache.keys()).map(request => request.url))
        done = urls.filter(url => saved.has(url)).length
      }
      if (names.includes(WORDBOOK_OFFLINE_CACHE)) {
        const cache = await caches.open(WORDBOOK_OFFLINE_CACHE)
        const page = await cache.match(new URL('/wordbook', location.origin).href)
        const library = await cache.match(new URL('/api/vocab/library', location.origin).href)
        const ipa = await cache.match(new URL(WORDBOOK_IPA_PATH, location.origin).href)
        if (ipa) {
          const savedIpa = await ipa.json()
          missingIpa = units.flatMap(unit => unit.words).filter(word => !word.ipa && !savedIpa[word.id]).length
          if (!cancelled) setPronunciations(savedIpa)
        }
        const cachedUnits = library ? (await library.json()).units : null
        ready = !!page && !!ipa && JSON.stringify(cachedUnits) === JSON.stringify(units) && done === urls.length
      }
      if (done || ready) await navigator.serviceWorker.register('/wordbook-audio-sw.js', { scope: '/wordbook' })
      if (!cancelled && !downloadActive.current) setDownload({ done, total: urls.length, active: false, ready, missingIpa, phase: '', error: '' })
    })().catch(() => {})
    return () => { cancelled = true }
  }, [units])

  const downloadOffline = async () => {
    if (downloadActive.current) return
    downloadActive.current = true
    try {
      if (!('serviceWorker' in navigator) || !('caches' in window)) throw new Error('当前浏览器暂不支持下载，请使用新版 Safari 或 Chrome。')
      setDownload(prev => ({ ...prev, active: true, ready: false, phase: '正在准备页面和词表…', error: '' }))
      const registration = await navigator.serviceWorker.register('/wordbook-audio-sw.js', { scope: '/wordbook' })
      await registration.update()
      await navigator.serviceWorker.ready
      await waitForOfflineWorker()
      const shell = await caches.open(WORDBOOK_OFFLINE_CACHE)
      const previousLibrary = await shell.match(new URL('/api/vocab/library', location.origin).href)
      const previousUnits: Unit[] = previousLibrary ? (await previousLibrary.json()).units || [] : []
      const assets = Array.from(document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>('script[src],link[rel="stylesheet"][href]')).map(element => element instanceof HTMLScriptElement ? element.src : element.href)
      const snapshot: Unit[] = await downloadWordbookShell(shell, (url: string) => fetch(url, { cache: 'no-store' }), location.origin, assets)
      const urls = audioUrls(snapshot)
      setUnits(snapshot)
      const cache = await caches.open(WORDBOOK_AUDIO_CACHE)
      await downloadWordbookAudio(urls, cache, (url: string) => fetch(url, { mode: 'cors' }), (done: number, total: number) => {
        setDownload(prev => ({ ...prev, done, total, active: true, ready: false, phase: '正在下载发音…', error: '' }))
      })
      setDownload(prev => ({ ...prev, phase: '正在准备音标…' }))
      const existingIpa = await shell.match(new URL(WORDBOOK_IPA_PATH, location.origin).href)
      const oldIpa: Record<number, string> = existingIpa ? await existingIpa.json() : {}
      const previousWords = new Map(previousUnits.flatMap(unit => unit.words).map(word => [word.id, word.word]))
      const savedIpa = Object.fromEntries(snapshot.flatMap(unit => unit.words).filter(word => previousWords.get(word.id) === word.word && oldIpa[word.id]).map(word => [word.id, oldIpa[word.id]]))
      const ipas = await downloadWordbookIpa(snapshot, async (word: string) => {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 8000)
        try { return await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, { signal: controller.signal }) }
        finally { clearTimeout(timer) }
      }, savedIpa) as Record<number, string>
      await shell.put(new URL(WORDBOOK_IPA_PATH, location.origin).href, new Response(JSON.stringify(ipas), { headers: { 'Content-Type': 'application/json' } }))
      setPronunciations(ipas)
      setDownload({ done: urls.length, total: urls.length, active: false, ready: true, missingIpa: snapshot.flatMap(unit => unit.words).filter(word => !word.ipa && !ipas[word.id]).length, phase: '', error: '' })
    } catch (e: any) {
      setDownload(prev => ({ ...prev, active: false, phase: '', error: e.message || '下载中断，请检查网络后重试。' }))
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
          <span className="wordbook-header-title">📚 必考单词本</span>
        </header>
        <section className="wordbook-book" aria-label="教材信息">
          📖 <strong>四年级上册</strong><span>{loading ? '正在打开…' : `${units.length} 个单元 · ${units.reduce((n, unit) => n + unit.words.length, 0)} 个单词`}</span>
          {offline && <span className="wordbook-offline-status">已离线</span>}
        </section>

        {loading && <p className="wordbook-notice" role="status">正在打开必考单词本…</p>}
        {error && <div className="wordbook-notice" role="alert"><p>{error}</p><button className="wordbook-action" onClick={() => setRetry(n => n + 1)}>重新打开</button></div>}
        {!loading && !error && <>
          <section className="wordbook-download" aria-label="离线学习">
            <div className="wordbook-download-copy">
              <strong>📥 离线学习</strong>
              <p>在这台设备下载一次，断网也能看单词、听发音。</p>
              {download.active && <div className="wordbook-download-progress" role="status">{download.phase} {download.total > 0 && download.phase.includes('发音') ? `${download.done} / ${download.total}` : ''}</div>}
              {!download.active && download.ready && <div className="wordbook-download-progress" role="status">✓ 已保存到本机{download.missingIpa > 0 ? `（${download.missingIpa} 个词未能保存音标）` : ''}</div>}
              {download.error && <div className="wordbook-error" role="alert">下载未完成：{download.error}</div>}
            </div>
            <button className="wordbook-download-button" type="button" disabled={download.active || offline} onClick={downloadOffline}>
              {download.active ? '下载中…' : download.ready ? '更新离线内容' : download.done > 0 ? '准备离线内容' : '下载到本机'}
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
