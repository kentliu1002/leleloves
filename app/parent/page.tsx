'use client'
import { uploadHomework, getHomework } from '../../lib/actions'
import { useState, useEffect } from 'react'

export default function ParentPage() {
  const [loading, setLoading] = useState(false)
  const [homeworkList, setHomeworkList] = useState<any[]>([])

  // 获取数据库里的所有作业记录
  const fetchHomework = async () => {
    const data = await getHomework()
    setHomeworkList(data)
  }

  // 页面刚打开时，自动获取一次数据
  useEffect(() => {
    fetchHomework()
  }, [])

  // 发布新作业的逻辑
  const handleSubmit = async (e: any) => {
    e.preventDefault()
    setLoading(true)
    
    try {
      const formData = new FormData(e.target)
      await uploadHomework(formData)
      alert('发布成功！AI已自动分类并带着附件同步给孩子。')
      e.target.reset()
      
      // 发布成功后，自动刷新下方的列表
      fetchHomework()
    } catch (error: any) {
      alert('哎呀，上传失败了：' + error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 lg:p-8 max-w-3xl mx-auto">
      
      {/* 🚀 上半部分：布置新作业 */}
      <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 mb-8 mt-4">
        <h1 className="text-3xl font-black text-slate-800 mb-6">📝 布置新作业</h1>
        <form onSubmit={handleSubmit} className="space-y-6">
          <textarea 
            name="content" 
            className="w-full p-5 border-2 border-gray-200 rounded-2xl h-32 shadow-sm text-lg focus:border-blue-500 focus:outline-none" 
            placeholder="输入今天的作业内容，AI会自动识别学科..." 
            required 
          />
          
          <div className="bg-slate-50 p-4 rounded-2xl border-2 border-dashed border-gray-300">
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

      {/* 📊 下半部分：查看打卡进度 */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-black text-slate-800">👀 孩子打卡记录</h2>
          {/* 手动刷新按钮 */}
          <button 
            onClick={fetchHomework} 
            className="text-sm bg-blue-100 hover:bg-blue-200 text-blue-700 py-2 px-4 rounded-full font-bold active:scale-95 transition-transform"
          >
            🔄 刷新状态
          </button>
        </div>

        <div className="space-y-4">
          {homeworkList.map((item: any) => (
            <div key={item.id} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col sm:flex-row gap-4">
              
              {/* 左侧：作业内容 */}
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs font-bold px-3 py-1 rounded-full text-white ${
                    item.subject === '语文' ? 'bg-red-500' :
                    item.subject === '数学' ? 'bg-blue-500' :
                    item.subject === '英语' ? 'bg-yellow-400' :
                    item.subject === '科学' ? 'bg-green-500' : 'bg-slate-500'
                  }`}>
                    {item.subject}
                  </span>
                  <span className="text-gray-400 text-sm">
                    {/* 显示布置时间 */}
                    {new Date(item.created_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="text-gray-700 whitespace-pre-wrap">{item.content}</p>
              </div>

              {/* 右侧：打卡状态展示区 */}
              <div className="sm:w-48 sm:border-l-2 sm:border-gray-50 sm:pl-4 flex flex-col justify-center items-center">
                {item.is_completed ? (
                  <div className="text-center">
                    <span className="inline-block bg-green-100 text-green-700 font-bold px-3 py-1 rounded-full text-sm mb-2">
                      ✅ 已打卡
                    </span>
                    {/* 如果有照片，展示缩略图，点击可放大查看原图 */}
                    {item.proof_image && (
                      <a href={item.proof_image} target="_blank" rel="noopener noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={item.proof_image} alt="作业凭证" className="w-24 h-24 object-cover rounded-xl border-2 border-green-200 hover:opacity-80 transition-opacity mx-auto shadow-sm" />
                      </a>
                    )}
                  </div>
                ) : (
                  <span className="inline-block bg-orange-100 text-orange-600 font-bold px-3 py-1 rounded-full text-sm shadow-sm">
                    ⏳ 待完成
                  </span>
                )}
              </div>
              
            </div>
          ))}
          
          {homeworkList.length === 0 && (
            <div className="text-center py-10 text-gray-400 font-medium">
              暂无作业记录，快去上面布置吧！
            </div>
          )}
        </div>
      </div>
      
    </div>
  )
}
