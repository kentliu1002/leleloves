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

  // 🚀 核心魔法：全自动打印函数
  const handlePrint = (e: React.MouseEvent, url: string) => {
    e.preventDefault();
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('请允许浏览器弹出窗口哦');
      return;
    }

    const isPdf = url.toLowerCase().includes('.pdf');

    // 生成一个隐蔽的、专门用于适配打印尺寸的干净网页
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>打印作业</title>
          <style>
            @media print {
              @page { margin: 0; }
              body { margin: 0; padding: 0; }
              .no-print { display: none; }
              img, iframe { max-width: 100%; max-height: 100vh; object-fit: contain; }
            }
            body { margin: 0; display: flex; flex-direction: column; align-items: center; height: 100vh; background: #fff; font-family: sans-serif;}
            .header { width: 100%; padding: 15px; text-align: center; color: #666; font-size: 14px; background: #f8f9fa; border-bottom: 1px solid #eee; }
            .content { flex: 1; width: 100%; display: flex; justify-content: center; align-items: center; }
          </style>
        </head>
        <body>
          <div class="header no-print">
            ${isPdf 
              ? '⚠️ iPad 提示：如果未自动弹出打印界面，请点击下方文档，点击右上角 <b>“共享 ↗”</b> 选择 <b>“打印”</b>。' 
              : '正在准备打印机，请稍候...'}
          </div>
          <div class="content">
            ${isPdf 
              ? `<iframe src="${url}" width="100%" height="100%" style="border:none;" onload="setTimeout(() => { window.print(); }, 1500);"></iframe>`
              : `<img src="${url}" onload="setTimeout(() => { window.print(); }, 500);" />`
            }
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const totalHomework = homeworkList.length;
  const completedHomework = homeworkList.filter(item => item.is_completed).length;
  const progressRatio = totalHomework === 0 ? 0 : Math.round((completedHomework / totalHomework) * 100);

  return (
    <div className="min-h-screen bg-[#F4F7F9] p-4 lg:p-8 font-sans">
      
      {/* 🚀 顶层仪表盘 */}
      <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm border-t-[10px] border-blue-500 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex-shrink-0 w-full md:w-auto text-center md:text-left">
          <p className="text-blue-500 font-bold tracking-widest text-sm mb-1">今日作业概览</p>
          <h1 className="text-3xl lg:text-4xl font-black text-slate-800">{todayStr}</h1>
        </div>

        <div className="flex-1 w-full max-w-2xl bg-slate-50 p-4 rounded-xl border border-slate-100">
          <div className="flex justify-between items-end mb-2">
            <span className="font-bold text-slate-600">完成进度</span>
            <div className="text-right">
              <span className="text-3xl font-black text-blue-600">{progressRatio}%</span>
              <span className="text-slate-400 text-sm ml-2 font-medium">({completedHomework}/{totalHomework})</span>
            </div>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-4 overflow-hidden shadow-inner">
            <div 
              className={`h-4 rounded-full transition-all duration-1000 ease-out ${progressRatio === 100 ? 'bg-green-500' : 'bg-blue-500'}`} 
              style={{ width: `${progressRatio}%` }}
            ></div>
          </div>
          {progressRatio === 100 && totalHomework > 0 && (
            <p className="text-green-600 text-xs font-bold mt-2 text-center animate-pulse">🎉 今天的作业全部完成啦！</p>
          )}
        </div>
        
        <button 
          onClick={fetchHW}
          className={`flex-shrink-0 bg-blue-50 text-blue-600 hover:bg-blue-100 px-6 py-4 rounded-xl font-bold text-lg transition-all active:scale-95 border border-blue-100 ${isRefreshing ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <span className={`inline-block mr-2 ${isRefreshing ? 'animate-spin' : ''}`}>🔄</span>
          刷新
        </button>
      </div>

      {/* 📚 作业列表区 */}
      <div className="space-y-4">
        {homeworkList.length === 0 && (
          <div className="bg-white rounded-2xl text-center py-16 text-slate-400 text-xl font-bold shadow-sm border border-slate-100">
            📭 今天暂时还没有收到作业哦~
          </div>
        )}

        {homeworkList.map((item: any) => {
          const badgeColor = SUBJECT_COLORS[item.subject] || 'bg-slate-500';
          const uploadTime = new Date(item.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

          return (
            <div key={item.id} className="bg-white rounded-xl shadow-sm border border-slate-100 flex flex-col lg:flex-row overflow-hidden hover:shadow-md transition-shadow relative">
              
              <div className={`${badgeColor} w-full lg:w-32 p-3 lg:p-0 flex lg:flex-col items-center justify-center shrink-0`}>
                <span className="text-white text-xl lg:text-2xl font-black tracking-widest">{item.subject}</span>
              </div>
              
              <div className="p-5 flex-1 flex flex-col justify-center min-w-0 pr-20 lg:pr-5">
                <p className="text-lg text-slate-700 font-medium whitespace-pre-wrap leading-snug mb-3">
                  {item.content}
                </p>
                <div className="flex items-center gap-1 text-slate-400 text-sm font-medium mt-auto">
                  <span>🕒 上传: {uploadTime}</span>
                </div>
              </div>
              
              <div className="p-4 bg-slate-50 border-t lg:border-t-0 lg:border-l border-slate-100 flex flex-row items-center justify-end gap-3 shrink-0 flex-wrap lg:flex-nowrap">
                
                {item.file_url && (
                  <div className="flex gap-2">
                    <a 
                      href={item.file_url} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="flex items-center justify-center bg-white text-blue-600 border border-blue-200 px-3 py-2.5 rounded-lg font-bold text-sm hover:bg-blue-50 transition-colors shadow-sm"
                    >
                      👀 预览
                    </a>
                    {/* 💡 打印按钮换成了 button，并绑定了 handlePrint 函数 */}
                    <button 
                      onClick={(e) => handlePrint(e, item.file_url)}
                      className="flex items-center justify-center bg-white text-yellow-600 border border-yellow-300 px-3 py-2.5 rounded-lg font-bold text-sm hover:bg-yellow-50 transition-colors shadow-sm cursor-pointer"
                    >
                      🖨️ 打印
                    </button>
                  </div>
                )}

                <div className="w-full sm:w-auto min-w-[130px] text-sm font-bold">
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
