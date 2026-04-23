export const revalidate = 0;
import { getHomework } from '../lib/actions'
import CheckInButton from './CheckInButton'
// 定义不同学科的颜色
const SUBJECT_COLORS: Record<string, string> = {
  '语文': 'bg-red-500',
  '数学': 'bg-blue-500',
  '英语': 'bg-yellow-400',
  '科学': 'bg-green-500',
  '其它': 'bg-slate-500',
};

export default async function ChildDashboard() {
  const homeworkList = await getHomework();

  return (
    <div className="min-h-screen bg-[#F0F7FF] p-6 lg:p-12 font-sans">
      
      {/* 顶部标题栏 */}
      <div className="bg-white rounded-3xl p-6 mb-8 border-l-[12px] border-blue-500 shadow-sm flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
            <span className="text-blue-600 font-bold tracking-widest text-sm">作业实时同步中</span>
          </div>
          <h1 className="text-3xl font-black text-slate-800">今天的任务列表</h1>
        </div>
        <div className="text-5xl">📅</div>
      </div>

      {/* 作业卡片网格 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {homeworkList.map((item: any) => {
          // 根据学科自动匹配颜色，如果没有就用灰色
          const headerColor = SUBJECT_COLORS[item.subject] || 'bg-slate-500';

          return (
            <div key={item.id} className="bg-white rounded-3xl shadow-xl overflow-hidden border-b-8 border-slate-200">
              {/* 卡片头部（学科） */}
              <div className={`${headerColor} py-4 px-8 text-white text-2xl font-black italic`}>
                {item.subject}
              </div>
              
              <div className="p-8">
                {/* 作业文字内容 */}
                <p className="text-2xl text-slate-700 font-medium leading-relaxed mb-8 whitespace-pre-wrap">
                  {item.content}
                </p>

                {/* 🌈 如果是图片，直接显示出来 */}
                {item.file_type === 'image' && item.file_url && (
                  <div className="mb-8 rounded-2xl overflow-hidden border-2 border-gray-100 shadow-sm">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.file_url} alt="作业附件" className="w-full object-cover" />
                  </div>
                )}

                {/* 🖨️ 如果是文档(PDF/Word)，显示打印提示框 */}
                {(item.file_type === 'pdf' || item.file_type === 'word') && item.file_url && (
                  <a href={item.file_url} target="_blank" rel="noopener noreferrer" className="block mb-8">
                    <div className="bg-yellow-50 border-2 border-dashed border-yellow-400 rounded-2xl p-4 flex items-center gap-4 hover:bg-yellow-100 transition-colors">
                      <span className="text-4xl">🖨️</span>
                      <span className="text-yellow-800 font-bold text-lg">发现文档附件！<br/>点击此处预览或连接打印机</span>
                    </div>
                  </a>
                )}

                {/* 使用我们新的真实打卡组件 */}
                <CheckInButton id={item.id} isCompleted={item.is_completed} />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
