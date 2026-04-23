export const revalidate = 0; // 保证孩子每次打开都能看到最新作业
import { getHomework } from '../lib/actions'

export default async function ChildDashboard() {
  const homeworkList = await getHomework();

  return (
    <div className="min-h-screen p-6 lg:p-12">
      <div className="bg-white rounded-3xl p-6 mb-8 border-l-[12px] border-blue-500 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
          <span className="text-blue-600 font-bold tracking-widest text-sm">作业已同步</span>
        </div>
        <h1 className="text-3xl font-black text-slate-800">今天的任务列表</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {homeworkList.map((item: any) => (
          <div key={item.id} className="bg-white rounded-3xl shadow-xl overflow-hidden border-b-8 border-slate-200">
            <div className="bg-blue-500 py-4 px-8 text-white text-2xl font-black italic">
              {item.subject}
            </div>
            <div className="p-8">
              <p className="text-2xl text-slate-700 font-medium leading-relaxed mb-8">{item.content}</p>
              <button className="w-full bg-[#FFD600] text-blue-900 py-5 rounded-2xl text-xl font-black shadow-[0_6px_0_0_#E6B800]">
                📸 拍下作业打卡
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}