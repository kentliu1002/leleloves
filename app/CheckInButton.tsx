'use client'
import { useRef, useState } from 'react'
import { completeHomework } from '../lib/actions'

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
      await completeHomework(formData)
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
