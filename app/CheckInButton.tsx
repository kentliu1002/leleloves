'use client'
import { useState } from 'react'
import { completeHomework } from '../lib/actions'

export default function CheckInButton({ id, isCompleted }: { id: string, isCompleted: boolean }) {
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(isCompleted)

  const handleUpload = async (e: any) => {
    const file = e.target.files?.[0]
    if (!file) return

    setLoading(true)
    const formData = new FormData()
    formData.append('id', id)
    formData.append('file', file)

    try {
      await completeHomework(formData)
      setDone(true) // 变成已完成状态
      alert('打卡成功！太棒啦！🎉')
    } catch (error: any) {
      alert('打卡失败：' + error.message)
    } finally {
      setLoading(false)
    }
  }

  // 如果已经打卡，显示绿色已完成状态
  if (done) {
    return (
      <div className="w-full flex justify-center items-center bg-green-500 text-white py-2.5 px-4 rounded-lg text-sm font-bold shadow-sm h-full">
        ✅ 已完成
      </div>
    )
  }

  return (
    <div className="relative w-full h-full">
      {/* 隐藏的相机调起组件，盖在按钮正上方 */}
      <input
        type="file"
        accept="image/*"
        capture="environment" /* 这个属性会告诉 iPad 直接调起后置摄像头 */
        onChange={handleUpload}
        disabled={loading}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
      />

      {/* 视觉上的按钮（已全面瘦身） */}
      <button className={`w-full h-full flex justify-center items-center transition-transform py-2.5 px-4 rounded-lg text-sm font-bold relative z-0 ${
        loading ? 'bg-gray-400 text-white shadow-none' : 'bg-[#FFD600] text-blue-900 shadow-[0_4px_0_0_#E6B800] active:scale-95'
      }`}>
        {loading ? '上传中...' : '📸 拍下作业打卡'}
      </button>
    </div>
  )
}
