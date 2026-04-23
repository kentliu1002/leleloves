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
      <div className="w-full bg-green-500 text-white py-5 rounded-2xl text-xl font-black text-center shadow-lg">
        ✅ 作业已完成
      </div>
    )
  }

  return (
    <div className="relative w-full">
      {/* 隐藏的相机调起组件，盖在按钮正上方 */}
      <input
        type="file"
        accept="image/*"
        capture="environment" /* 这个属性会告诉 iPad 直接调起后置摄像头 */
        onChange={handleUpload}
        disabled={loading}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
      />
      
      {/* 视觉上的按钮 */}
      <button className={`w-full transition-transform py-5 rounded-2xl text-xl font-black relative z-0 ${
        loading ? 'bg-gray-400 text-white shadow-none' : 'bg-[#FFD600] text-blue-900 shadow-[0_6px_0_0_#E6B800] active:scale-95'
      }`}>
        {loading ? '正在上传照片...' : '📸 拍下作业打卡'}
      </button>
    </div>
  )
}
