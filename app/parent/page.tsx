'use client'
import { uploadHomework } from '../../lib/actions'
import { useState } from 'react'

export default function ParentPage() {
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: any) => {
    e.preventDefault()
    setLoading(true)
    const formData = new FormData(e.target)
    await uploadHomework(formData)
    alert('发布成功！AI已自动分类并同步给孩子。')
    e.target.reset()
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 max-w-md mx-auto">
      <h1 className="text-3xl font-black text-slate-800 mb-8 mt-4">📝 布置作业</h1>
      <form onSubmit={handleSubmit} className="space-y-6">
        <textarea 
          name="content" 
          className="w-full p-5 border-2 border-gray-200 rounded-2xl h-48 shadow-sm text-lg focus:border-blue-500 focus:outline-none" 
          placeholder="输入今天的作业内容，AI会自动识别学科..." 
          required 
        />
        <button 
          disabled={loading} 
          className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold text-xl shadow-lg"
        >
          {loading ? '正在分析并上传...' : '确认发布'}
        </button>
      </form>
    </div>
  )
}