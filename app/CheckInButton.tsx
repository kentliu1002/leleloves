'use client'
import { useRef, useState } from 'react'

// 客户端压缩：限长边 2048px、JPEG quality 0.88，原图>1MB 才压缩
// 较高分辨率有利于 AI 识别手写字
async function compressImage(file: File): Promise<File> {
  if (file.size <= 1024 * 1024) return file   // <=1MB 直接放行
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = reject
    r.readAsDataURL(file)
  })
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = reject
    i.src = dataUrl
  })
  const MAX = 2048
  let { width, height } = img
  if (width > MAX || height > MAX) {
    const ratio = Math.min(MAX / width, MAX / height)
    width = Math.round(width * ratio)
    height = Math.round(height * ratio)
  }
  const canvas = document.createElement('canvas')
  canvas.width = width; canvas.height = height
  canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('canvas.toBlob 失败')), 'image/jpeg', 0.88)
  )
  // 失败保险：如果压完反而更大（罕见），回退原图
  if (blob.size >= file.size) return file
  return new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' })
}

export default function CheckInButton({ id, isCompleted }: { id: string, isCompleted: boolean }) {
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(isCompleted)
  const [photos, setPhotos] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  const handleCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotos(prev => [...prev, file])
    setPreviews(prev => [...prev, URL.createObjectURL(file)])
    e.target.value = ''  // 重置 input，允许再次触发
  }

  const handleSubmit = async () => {
    if (photos.length === 0) return
    setLoading(true)
    const formData = new FormData()
    formData.append('id', id)
    photos.forEach(f => formData.append('file', f))
    try {
      // 1. 浏览器直接传图到 Supabase Storage（绕开 Vercel 4.5MB 请求体限制）
      const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
      const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      const proofUrls: string[] = []
      for (const original of photos) {
        // 客户端先压缩，加快上传和 AI 拉取速度
        const photo = await compressImage(original)
        const ext = (photo.name.split('.').pop() || 'jpg').toLowerCase()
        const fileName = `proof-${Date.now()}-${Math.random().toString(36).substring(2)}.${ext}`
        const up = await fetch(`${SUPABASE_URL}/storage/v1/object/attachments/${fileName}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${SUPABASE_ANON}`,
            apikey: SUPABASE_ANON,
            'Content-Type': photo.type || 'image/jpeg',
            'x-upsert': 'true'
          },
          body: photo
        })
        if (!up.ok) throw new Error(`图片上传失败 (${up.status})`)
        proofUrls.push(`${SUPABASE_URL}/storage/v1/object/public/attachments/${fileName}`)
      }

      // 2. 调 API 只传 URL 数组（payload < 1KB，安全）
      const res = await fetch('/api/homework/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, proof_urls: proofUrls })
      })
      const json = await res.json().catch(() => ({ success: false, error: `HTTP ${res.status}` }))
      if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`)

      setDone(true)
      alert('打卡成功！太棒啦！🎉')
    } catch (error: any) {
      alert('打卡失败：' + error.message)
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="w-full flex justify-center items-center bg-green-500 text-white py-2.5 px-4 rounded-lg text-sm font-bold shadow-sm h-full">
        ✅ 已完成
      </div>
    )
  }

  return (
    <div className="w-full">
      {/* 已拍缩略图 */}
      {previews.length > 0 && (
        <div className="flex gap-2 flex-wrap mb-2">
          {previews.map((src, i) => (
            <img key={i} src={src} alt={`第${i + 1}张`} className="w-16 h-16 object-cover rounded-lg border border-gray-200" />
          ))}
        </div>
      )}

      {/* 隐藏的 input，capture 每次只拍一张 */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleCapture}
      />

      <div className="flex gap-2">
        {/* 拍照按钮 */}
        <button
          onClick={() => inputRef.current?.click()}
          disabled={loading}
          className="flex-1 py-2.5 px-3 rounded-lg text-sm font-bold bg-[#FFD600] text-blue-900 shadow-[0_4px_0_0_#E6B800] active:scale-95 transition-transform"
        >
          {photos.length === 0 ? '📸 拍下作业打卡' : '📸 再拍一张'}
        </button>

        {/* 完成打卡按钮（至少拍一张后出现） */}
        {photos.length > 0 && (
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 py-2.5 px-3 rounded-lg text-sm font-bold bg-green-500 text-white shadow-[0_4px_0_0_#16a34a] active:scale-95 transition-transform disabled:opacity-60"
          >
            {loading ? '上传中...' : `✅ 完成打卡(${photos.length}张)`}
          </button>
        )}
      </div>
    </div>
  )
}
