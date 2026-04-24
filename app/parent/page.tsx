'use client'
import { uploadHomework, getHomework } from '../../lib/actions'
import { useState, useEffect } from 'react'

export default function ParentPage() {
  const [loading, setLoading] = useState(false)
  const [homeworkList, setHomeworkList] = useState<any[]>([])
  
  const last7Days = Array.from({length: 7}, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - i)
    return d.toLocaleDateString()
  })
  
  const [selectedDate, setSelectedDate] = useState(last7Days[0])

  const fetchHomework = async () => {
    const data = await getHomework()
    setHomeworkList(data)
  }

  useEffect(() => {
    fetchHomework()
  }, [])

  const handleSubmit = async (e: any) => {
    e.preventDefault()
    setLoading(true)
    
    try {
      const formData = new FormData(e.target)
      let content = formData.get('content') as string
      const file = formData.get('file') as File | null

      // 💡 核心优化：如果文本框是空的
      if (!content.trim()) {
        if (file && file.size > 0) {
          // 如果传了文件，自动提取文件名（去掉 .pdf 或 .jpg 等后缀）作为内容
          const fileName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
          formData.set('content', fileName);
        } else {
          // 如果既没写字，也没传文件，就拦截提示
          alert('请至少输入作业内容，或者上传一份附件哦！');
          setLoading(false);
          return;
        }
      }

      await uploadHomework(formData)
      alert('发布成功！')
      e.target.reset()
      fetchHomework()
      setSelectedDate(last7Days[0])
    } catch (error: any) {
      alert('上传失败：' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const filteredHomework = homeworkList.filter(item => 
    new Date(item.created_at).toLocaleDateString() === selectedDate
  )

  return (
    <div className="min-h-screen bg-gray-50 p-4 lg:p-8 max-w-3xl mx-auto">
      
      <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 mb-8 mt-4">
        <h1 className="text-3xl font-black text-slate-800 mb-6">📝 布置新作业</h1>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 💡 注意这里：我去掉了 required 属性，现在不强制打字了 */}
          <textarea 
            name="content" 
            className="w-full p-5 border-2 border-gray-200 rounded-2xl h-32 shadow-sm text-lg focus:border-blue-500 focus:outline-none" 
            placeholder="输入作业内容...（若直接上传附件，此处可留空，AI会自动提取文件名）" 
          />
          <div className="bg-slate-50 p-4 rounded-2xl border-2 border-dashed border-gray-300">
            <label className="block text-gray-700 font-bold mb-2">📎 添加附件 (照片/文档)</label>
            <input type="file" name="file" accept="image/*,.pdf,.doc,.docx" className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
          </div>
          <button disabled={loading} className={`w-full text-white py-4 rounded-2xl font-bold text-xl shadow-lg transition-all ${loading ? 'bg-gray-400' : 'bg-blue-600 active:scale-95'}`}>
            {loading ? '正在处理并上传...' : '确认发布'}
          </button>
        </form>
      </div>

      {/* 下方历史记录区保持不变 */}
      <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-black text-slate-800">👀 历史打卡记录</h2>
          <button onClick={fetchHomework} className="text-sm bg-gray-100 hover:bg-gray-2
