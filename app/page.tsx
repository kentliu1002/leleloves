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

  // 格式化今天的日期，展示得超级大
  const todayStr = new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });

  const fetchHW = async () => {
    setIsRefreshing(true)
    const data = await getHomework()
    
    // 💡 孩子端只显示“今天”的作业，防漏看
    const today = new Date().toLocaleDateString()
    const todayData = data.filter((item: any) => new Date(item.created_at).toLocaleDateString() === today)
    
    setHomeworkList(todayData)
    setTimeout(() => setIsRefreshing(false), 500) // 让刷新动画飞一会
  }

  useEffect(() => {
    fetchHW()
    // 💡 每 5 分钟（300000毫秒）自动静默刷新一次
    const timer = setInterval(fetchHW, 300000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="min-h-screen bg-[#F0F7FF] p-6 lg:p-12 font-sans">
      
      {/* 🚀 全新升级的顶部标题栏 */}
      <div className="bg-white rounded-3xl p-8 mb-8 border-l-[16px] border-blue-500 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-4 h-4 bg-green-500 rounded-full animate-pulse" />
            <span className="text-blue-600 font-bold tracking-widest text-lg">作业实时同步中</span>
          </div>
          {/* 超大日期显示 */}
          <h1 className="text-5xl md:text-6xl font-black text-slate-800 tracking-tight">{todayStr}</h1>
        </div>
        
        {/* 手动刷新超大按钮 */}
        <button 
          onClick={fetchHW}
          className={`flex items-center gap-3 bg-blue-100 text-blue-700 hover:bg-blue-200 px-8 py-6 rounded-2xl font-black text-2xl transition-all active:scale-95 shadow-sm ${isRefreshing ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <span className={isRefreshing ? 'animate-spin' : ''}>🔄</span>
          {isRefreshing ? '更新中...' : '刷新作业'}
        </button>
      </div>

      {/* 作业卡片网格 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {homeworkList.length === 0 && (
          <div className="col-span-full text-center py-20 text-gray-400 text-2xl font-bold">
            🎉 太棒了！今天暂时还没有作业哦！
          </div>
        )}

        {homeworkList.map((item: any) => {
          const headerColor = SUBJECT_COLORS[item.subject] || 'bg-slate-500';

          return (
            <div key={item.id} className="bg-white rounded-3xl shadow-xl overflow-hidden border-b-8 border-slate-200">
              <div className={`${headerColor} py-4 px-8 text-white text-3xl font-black italic`}>
                {item.subject}
              </div>
              
              <div className="p-8">
                <p className="text-2xl text-slate-700 font-medium leading-relaxed mb-6 whitespace-pre-wrap">
                  {item.content}
                </p>

                {/* 💡 缩略图模式：图片附件 */}
                {item.file_type === 'image' && item.file_url && (
                  <a href={item.file_url} target="_blank" rel="noopener noreferrer" className="block mb-6">
                    <div className="flex items-center gap-6 bg-blue-50 p-4 rounded-2xl border-2 border-dashed border-blue-200 hover:bg-blue-100 transition-colors">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.file_url} alt="缩略图" className="w-24 h-24 object-cover rounded-xl shadow-sm" />
                      <div>
                        <p className="text-xl font-black text-blue-900 mb-1">🖼️ 包含图片附件</p>
                        <p className="text-base font-bold text-blue-600">👉 点击查看大图或打印</p>
                      </div>
                    </div>
                  </a>
                )}

                {/* 💡 缩略图模式：文档附件 */}
                {(item.file_type === 'pdf' || item.file_type === 'word') && item.file_url && (
                  <a href={item.file_url} target="_blank" rel="noopener noreferrer" className="block mb-6">
                    <div className="flex items-center gap-6 bg-yellow-50 p-4 rounded-2xl border-2 border-dashed border-yellow-300 hover:bg-yellow-100 transition-colors">
                      <div className="w-24 h-24 bg-white rounded-xl shadow-sm flex items-center justify-center text-5xl">
                        📄
                      </div>
                      <div>
                        <p className="text-xl font-black text-yellow-900 mb-1">包含文档附件</p>
                        <p className="text-base font-bold text-yellow-700">👉 点击预览或连接打印机</p>
                      </div>
                    </div>
                  </a>
                )}

                <CheckInButton id={item.id} isCompleted={item.is_completed} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
