'use client'
import { useState, useEffect } from 'react'
import { getHomework } from '../lib/actions'
import CheckInButton from './CheckInButton'

const SUBJECT_COLORS: Record<string, string> = {
  '语文': 'bg-red-500',
  '数学': 'bg-blue-500',
  '英语': 'bg-yellow-400',
  '科学': 'bg-green-500',
  '其它': 'bg-slate-500',
};

export default function ChildDashboard() {
  const [homeworkList, setHomeworkList] = useState<any[]>([])
  const [isRefreshing, setIsRefreshing] = useState(false)

  const todayStr = new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });

  const fetchHW = async () => {
    setIsRefreshing(true)
    const data = await getHomework()
    
    const today = new Date().toLocaleDateString()
    const todayData = data.filter((item: any) => new Date(item.created_at).toLocaleDateString() === today)
    
    setHomeworkList(todayData)
    setTimeout(() => setIsRefreshing(false), 500)
  }

  useEffect(() => {
    fetchHW()
    const timer = setInterval(fetchHW, 300000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="min-h-screen bg-[#F0F7FF] p-6 lg:p-12 font-sans">
      
      <div className="bg-white rounded-3xl p-8 mb-8 border-l-[16px] border-blue-500 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-4 h-4 bg-green-500 rounded-full animate-pulse" />
            <span className="text-blue-600 font-bold tracking-widest text-lg">作业实时同步中</span>
          </div>
          <h1 className="text-5xl md:text-6xl font-black text-slate-800 tracking-tight">{todayStr}</h1>
        </div>
        
        <button 
          onClick={fetchHW}
          className={`flex items-center gap-3 bg-blue-100 text-blue-700 hover:bg-blue-200 px-8 py-6 rounded-2xl font-black text-2xl transition-all active:scale-95 shadow-sm ${isRefreshing ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <span className={isRefreshing ? 'animate-spin' : ''}>🔄</span>
          {isRefreshing ? '更新中...' : '刷新作业'}
        </button>
      </div>

      {/* 💡 items-stretch 保证同一行的卡片高度强制一致 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch">
        {homeworkList.length === 0 && (
          <div className="col-span-full text-center py-20 text-gray-400 text-2xl font-bold">
            🎉 太棒了！今天暂时还没有作业哦！
          </div>
        )}

        {homeworkList.map((item: any) => {
          const headerColor = SUBJECT_COLORS[item.subject] || 'bg-slate-500';

          return (
            <div key={item.id} className="bg-white rounded-3xl shadow-xl border-b-8 border-slate-200 flex flex-col overflow-hidden">
              <div className={`${headerColor} py-4 px-8 text-white text-3xl font-black italic shrink-0`}>
                {item.subject}
              </div>
              
              {/* 💡 flex-1 让中间内容区自动撑开，把打卡按钮挤到最下面 */}
              <div className="p-8 flex flex-col flex-1">
                
                {/* 💡 附件操作区：固定在内容左上方 */}
                {item.file_url && (
                  <div className="flex flex-wrap gap-4 mb-6">
                    <a 
                      href={item.file_url} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="flex items-center gap-2 bg-blue-50 text-blue-600 px-4 py-2 rounded-xl font-bold text-lg hover:bg-blue-100 transition-colors border border-blue-100 shadow-sm"
                    >
                      👀 预览附件
                    </a>
                    <a 
                      href={item.file_url} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="flex items-center gap-2 bg-yellow-50 text-yellow-700 px-4 py-2 rounded-xl font-bold text-lg hover:bg-yellow-100 transition-colors border border-yellow-200 shadow-sm"
                    >
                      🖨️ 打印附件
                    </a>
                  </div>
                )}

                {/* 💡 如果是图片，保留一个干净利落的小缩略图 */}
                {item.file_type === 'image' && item.file_url && (
                   <div className="mb-6">
                     <img src={item.file_url} alt="作业图片" className="w-32 h-32 object-cover rounded-xl border border-gray-200 shadow-sm" />
                   </div>
                )}

                {/* 作业文字描述 */}
                <p className="text-2xl text-slate-700 font-medium leading-relaxed mb-8 whitespace-pre-wrap">
                  {item.content}
                </p>

                {/* 💡 这里的 mt-auto 是对齐的核心魔法，强制把按钮顶到最底部 */}
                <div className="mt-auto">
                  <CheckInButton id={item.id} isCompleted={item.is_completed} />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
