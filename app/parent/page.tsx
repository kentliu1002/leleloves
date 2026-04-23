'use client'
import { uploadHomework } from '../../lib/actions'
import { useState } from 'react'

export default function ParentPage() {
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: any) => {
    e.preventDefault()
    setLoading(true)
    
    try {
      const formData = new FormData(e.target)
      await uploadHomework(formData)
      alert('发布成功！AI已自动分类并带着附件同步给孩子。')
      e.target.reset()
    } catch (error: any) {
      alert('哎呀，上传失败了：' + error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 max-w-md mx-auto">
      <h1 className="text-3xl font-black text-slate-800 mb-8 mt-4">📝 布置作业</h1>
      <form onSubmit={handleSubmit} className="space-y-6">
        <textarea 
          name="content" 
          className="w-full p-5 border-2 border-gray-200 rounded-2xl h-40 shadow-sm text-lg focus:border-blue-500 focus:outline-none" 
          placeholder="输入今天的作业内容，AI会自动识别学科..." 
          required 
        />
        
        {/* 新增的文件上传模块 */}
        <div className="bg-white p-4 rounded-2xl border-2 border-dashed border-gray-300">
          <label className="block text-gray-700 font-bold mb-2">📎 添加附件 (照片/Word/PDF)</label>
          <input 
            type="file" 
            name="file" 
            accept="image/*,.pdf,.doc,.docx"
            className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
        </div>

        <button 
          disabled={loading} 
          className={`w-full text-white py-4 rounded-2xl font-bold text-xl shadow-lg transition-all ${loading ? 'bg-gray-400' : 'bg-blue-600 active:scale-95'}`}
        >
          {loading ? '正在处理并上传...' : '确认发布'}
        </button>
      </form>
    </div>
  )
}
