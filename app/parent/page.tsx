'use client';
import { createClient } from '@supabase/supabase-js';
import { useState, useEffect } from 'react';
import { deleteHomework } from '../../lib/actions';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const SUBJECT_COLORS: Record<string,string> = {
  '语文':'bg-red-500','数学':'bg-blue-500','英语':'bg-yellow-400','科学':'bg-green-500',
  '历史':'bg-purple-500','地理':'bg-teal-500','政治':'bg-indigo-500','其它':'bg-slate-500',
};

type Tab = 'assign' | 'history' | 'points' | 'holidays';

interface Holiday { id: string; name: string; start_date: string; end_date: string }
interface PointsLog { points: number; date: string; reason: string; source: string; day_type: string; created_at: string }

export default function ParentPage() {
  const [activeTab, setActiveTab] = useState<Tab>('assign');

  // ── 作业相关 ──────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [homeworkList, setHomeworkList] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const last7Days = Array.from({length:7},(_,i)=>{ const d=new Date(); d.setDate(d.getDate()-i); return d.toLocaleDateString(); });
  const [selectedDate, setSelectedDate] = useState(last7Days[0]);

  const fetchHomework = async () => {
    const { data } = await supabase.from('homework').select('*').order('created_at',{ascending:false});
    setHomeworkList(data||[]); setSelectedIds([]);
  };
  useEffect(()=>{ fetchHomework(); },[]);

  const handleSubmit = async (e:any) => {
    e.preventDefault(); setLoading(true);
    try {
      const formData = new FormData(e.target);
      const contentInput = formData.get('content') as string;
      const file = formData.get('file') as File|null;
      let finalContent=contentInput, fileUrl=null, fileType=null, originalFileName='';
      if (file && file.size>0) {
        originalFileName=file.name;
        const fileExt=file.name.split('.').pop()||'pdf';
        const storageName=`web-${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const { error:uploadError } = await supabase.storage.from('attachments').upload(storageName,file);
        if (uploadError) throw uploadError;
        const { data:publicUrlData } = supabase.storage.from('attachments').getPublicUrl(storageName);
        fileUrl=publicUrlData.publicUrl;
        if (file.type.includes('pdf')||fileExt==='pdf') fileType='pdf';
        else if (file.type.includes('image')||['jpg','jpeg','png'].includes(fileExt)) fileType='image';
        else fileType='word';
        if (!finalContent.trim()) {
          const lastDot=originalFileName.lastIndexOf('.');
          finalContent=lastDot!==-1?originalFileName.substring(0,lastDot):originalFileName;
        }
      }
      if (!finalContent.trim()&&!fileUrl) { alert("请填写内容或选择附件"); setLoading(false); return; }
      const res = await fetch('/api/homework',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({content:finalContent,filename:originalFileName,file_url:fileUrl,file_type:fileType})});
      const result=await res.json();
      if (!res.ok) throw new Error(result.error);
      alert(`发布成功！AI识别科目为：${result.subject||'其它'}`);
      e.target.reset(); fetchHomework();
    } catch(error:any){ alert('操作失败: '+error.message); } finally { setLoading(false); }
  };

  const handleDeleteSingle = async (id:string) => {
    if (!confirm('确定要删除这条作业吗？')) return;
    try { await deleteHomework([id]); fetchHomework(); }
    catch(e:any){ alert('删除失败：'+e.message); }
  };

  const handleDeleteBatch = async () => {
    if (selectedIds.length===0) return;
    if (!confirm(`确定删除 ${selectedIds.length} 条作业吗？`)) return;
    setLoading(true);
    try { await deleteHomework(selectedIds); fetchHomework(); }
    catch(e:any){ alert('批量删除失败：'+e.message); } finally{ setLoading(false); }
  };

  const filteredHomework = homeworkList.filter(item=>new Date(item.created_at).toLocaleDateString()===selectedDate);

  // ── 积分相关 ──────────────────────────────────────────────────────────
  const [totalPoints, setTotalPoints] = useState<number|null>(null);
  const [recentLogs, setRecentLogs] = useState<PointsLog[]>([]);
  const [manualPoints, setManualPoints] = useState('');
  const [manualReason, setManualReason] = useState('');
  const [manualLoading, setManualLoading] = useState(false);

  const fetchPoints = async () => {
    try {
      const res = await fetch('/api/points');
      if (res.ok) { const d=await res.json(); setTotalPoints(d.total); setRecentLogs(d.recentLogs||[]); }
    } catch {}
  };
  useEffect(()=>{ if(activeTab==='points') fetchPoints(); },[activeTab]);

  const handleManualPoints = async () => {
    const pts = parseInt(manualPoints);
    if (!pts||isNaN(pts)) { alert('请输入有效的积分数值（非零整数）'); return; }
    if (!manualReason.trim()) { alert('请填写加减分原因'); return; }
    setManualLoading(true);
    try {
      const res=await fetch('/api/points/manual',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({points:pts,reason:manualReason.trim()})});
      const d=await res.json();
      if (!res.ok) throw new Error(d.error);
      alert(`操作成功！${pts>0?'增加':'扣除'} ${Math.abs(pts)} 分`);
      setManualPoints(''); setManualReason(''); fetchPoints();
    } catch(e:any){ alert('失败：'+e.message); } finally{ setManualLoading(false); }
  };

  // ── 假期相关 ──────────────────────────────────────────────────────────
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [hlName, setHlName] = useState('');
  const [hlStart, setHlStart] = useState('');
  const [hlEnd, setHlEnd] = useState('');
  const [hlLoading, setHlLoading] = useState(false);

  const fetchHolidays = async () => {
    try {
      const res=await fetch('/api/holidays');
      if (res.ok) setHolidays(await res.json());
    } catch {}
  };
  useEffect(()=>{ if(activeTab==='holidays') fetchHolidays(); },[activeTab]);

  const handleAddHoliday = async () => {
    if (!hlName.trim()||!hlStart||!hlEnd) { alert('请填写假期名称、开始和结束日期'); return; }
    setHlLoading(true);
    try {
      const res=await fetch('/api/holidays',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({name:hlName.trim(),start_date:hlStart,end_date:hlEnd})});
      const d=await res.json();
      if (!res.ok) throw new Error(d.error);
      alert('添加成功！'); setHlName(''); setHlStart(''); setHlEnd(''); fetchHolidays();
    } catch(e:any){ alert('失败：'+e.message); } finally{ setHlLoading(false); }
  };

  const handleDeleteHoliday = async (id:string, name:string) => {
    if (!confirm(`确定删除「${name}」吗？`)) return;
    try {
      const res=await fetch(`/api/holidays/${id}`,{method:'DELETE'});
      if (!res.ok) throw new Error('删除失败');
      fetchHolidays();
    } catch(e:any){ alert(e.message); }
  };

  // ── Tab 配置 ──────────────────────────────────────────────────────────
  const TABS: {key:Tab; label:string; icon:string}[] = [
    {key:'assign',  label:'布置作业',  icon:'📝'},
    {key:'history', label:'历史管理',  icon:'👀'},
    {key:'points',  label:'加减积分',  icon:'⭐'},
    {key:'holidays',label:'假期设置',  icon:'🏖️'},
  ];

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      {/* Tab 导航栏 */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 flex gap-1 pt-3">
          {TABS.map(t=>(
            <button key={t.key} onClick={()=>setActiveTab(t.key)}
              className={`flex-1 flex flex-col items-center py-2.5 rounded-t-xl text-sm font-bold transition-all
                ${activeTab===t.key
                  ?'bg-blue-600 text-white shadow-md'
                  :'text-gray-500 hover:bg-gray-100'}`}>
              <span className="text-lg mb-0.5">{t.icon}</span>
              <span className="text-xs">{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-4 lg:p-8 mt-4">

        {/* ── Tab 1：布置作业 ── */}
        {activeTab==='assign' && (
          <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100">
            <h1 className="text-3xl font-black text-slate-800 mb-6">📝 布置大文件作业</h1>
            <form onSubmit={handleSubmit} className="space-y-6">
              <textarea name="content" className="w-full p-5 border-2 border-gray-200 rounded-2xl h-32 shadow-sm text-lg focus:border-blue-500 focus:outline-none"
                placeholder="输入作业内容...（若直接上传附件，此处可留空）"/>
              <div className="bg-slate-50 p-4 rounded-2xl border-2 border-dashed border-gray-300">
                <label className="block text-gray-700 font-bold mb-2">📎 添加附件 (无大小限制)</label>
                <input type="file" name="file" className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"/>
              </div>
              <button disabled={loading}
                className={`w-full text-white py-4 rounded-2xl font-bold text-xl shadow-lg transition-all ${loading?'bg-gray-400':'bg-blue-600 active:scale-95'}`}>
                {loading?'正在极速上传并分析学科...':'确认发布'}
              </button>
            </form>
          </div>
        )}

        {/* ── Tab 2：历史管理 ── */}
        {activeTab==='history' && (
          <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100">
            <div className="flex flex-col md:flex-row items-center justify-between mb-6 gap-4">
              <h2 className="text-2xl font-black text-slate-800">👀 历史记录与管理</h2>
              <div className="flex items-center gap-3">
                {selectedIds.length>0 && (
                  <button onClick={handleDeleteBatch}
                    className="text-sm bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 py-2 px-4 rounded-full font-bold shadow-sm transition-all">
                    🗑️ 删除选中 ({selectedIds.length})
                  </button>
                )}
                <button onClick={fetchHomework} className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 px-4 rounded-full font-bold transition-all">🔄 刷新</button>
              </div>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-4 mb-4">
              {last7Days.map((date,i)=>(
                <button key={date} onClick={()=>setSelectedDate(date)}
                  className={`whitespace-nowrap px-5 py-2 rounded-full font-bold transition-all ${selectedDate===date?'bg-blue-600 text-white shadow-md':'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                  {i===0?'今天':date.substring(date.indexOf('/')+1)}
                </button>
              ))}
            </div>
            <div className="space-y-4">
              {filteredHomework.map(item=>(
                <div key={item.id}
                  className={`p-5 rounded-2xl border transition-all flex flex-col sm:flex-row gap-4 ${selectedIds.includes(item.id)?'bg-blue-50 border-blue-200':'bg-gray-50 border-gray-100'}`}>
                  {!item.is_completed && (
                    <div className="pt-1"><input type="checkbox" checked={selectedIds.includes(item.id)} onChange={()=>setSelectedIds(p=>p.includes(item.id)?p.filter(i=>i!==item.id):[...p,item.id])} className="w-5 h-5 rounded cursor-pointer"/></div>
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-xs font-bold px-3 py-1 rounded-full text-white ${SUBJECT_COLORS[item.subject]||'bg-slate-500'}`}>{item.subject}</span>
                      <span className="text-xs text-gray-400 font-medium">{new Date(item.created_at).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}</span>
                    </div>
                    <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">{item.content}</p>
                  </div>
                  <div className="sm:w-48 sm:border-l-2 sm:border-gray-200 sm:pl-4 flex flex-col justify-center items-center gap-3">
                    {item.is_completed?(
                      <span className="bg-green-100 text-green-700 font-bold px-3 py-1 rounded-full text-sm">✅ 已打卡</span>
                    ):(
                      <div className="flex flex-col items-center gap-2">
                        <span className="bg-orange-100 text-orange-600 font-bold px-3 py-1 rounded-full text-sm">⏳ 待完成</span>
                        <button onClick={()=>handleDeleteSingle(item.id)} className="text-xs font-bold text-gray-400 hover:text-red-500">删除此项</button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {filteredHomework.length===0&&<div className="text-center py-10 text-gray-400 font-medium">这个日期暂时没有作业记录哦。</div>}
            </div>
          </div>
        )}

        {/* ── Tab 3：加减积分 ── */}
        {activeTab==='points' && (
          <div className="space-y-6">
            {/* 当前总积分展示 */}
            <div className="bg-gradient-to-br from-blue-900 to-indigo-800 rounded-3xl p-6 text-center shadow-lg border border-blue-700">
              <div className="text-blue-200 font-bold text-sm mb-2 tracking-widest">⭐ 乐乐当前总积分</div>
              <div className="text-6xl font-black text-white mb-1">{totalPoints??'—'}</div>
              <div className="text-blue-300 font-bold">分</div>
              <button onClick={fetchPoints} className="mt-4 text-xs text-blue-300 hover:text-white font-bold">🔄 刷新</button>
            </div>

            {/* 手动加减分 */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
              <h2 className="text-xl font-black text-slate-800 mb-5">✏️ 手动加减分</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-600 mb-1">积分数值</label>
                  <div className="flex gap-2">
                    <input type="number" value={manualPoints} onChange={e=>setManualPoints(e.target.value)}
                      placeholder="正数=加分，负数=扣分（如 +5 或 -3）"
                      className="flex-1 border-2 border-gray-200 rounded-xl px-4 py-3 text-lg font-bold focus:border-blue-500 focus:outline-none"/>
                    <div className="flex flex-col gap-1">
                      {[5,10,-3,-5].map(v=>(
                        <button key={v} onClick={()=>setManualPoints(String(v))}
                          className={`px-3 py-1 rounded-lg text-sm font-bold ${v>0?'bg-green-100 text-green-700 hover:bg-green-200':'bg-red-100 text-red-600 hover:bg-red-200'}`}>
                          {v>0?`+${v}`:v}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-600 mb-1">原因说明</label>
                  <input type="text" value={manualReason} onChange={e=>setManualReason(e.target.value)}
                    placeholder="例：主动预习 / 发脾气扣分 / 帮助家务"
                    className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:border-blue-500 focus:outline-none font-medium"/>
                </div>
                <div className="flex gap-3">
                  <button onClick={()=>{ if(!manualPoints||parseInt(manualPoints)>=0) return; setManualPoints(p=>p); handleManualPoints(); }}
                    disabled={manualLoading||!manualPoints||parseInt(manualPoints)>=0}
                    className="flex-1 bg-red-500 disabled:bg-gray-300 text-white py-3 rounded-xl font-bold text-lg transition-all active:scale-95"
                    onClick={handleManualPoints}>
                    {manualLoading?'处理中...':'确认操作'}
                  </button>
                </div>
                <p className="text-xs text-gray-400 font-medium">💡 填正数（如 5）= 加5分，填负数（如 -3）= 扣3分</p>
              </div>
            </div>

            {/* 最近积分流水 */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
              <h2 className="text-xl font-black text-slate-800 mb-5">📋 最近积分记录</h2>
              {recentLogs.length===0?(
                <div className="text-center py-8 text-gray-400">暂无记录</div>
              ):(
                <div className="space-y-3">
                  {recentLogs.map((log,i)=>(
                    <div key={i} className="flex items-center gap-4 p-3 bg-gray-50 rounded-xl">
                      <div className={`text-2xl font-black w-16 text-center flex-shrink-0 ${log.points>0?'text-green-600':log.points<0?'text-red-500':'text-gray-400'}`}>
                        {log.points>0?`+${log.points}`:log.points}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-gray-700 truncate">{log.reason}</div>
                        <div className="text-xs text-gray-400 font-medium mt-0.5">
                          {log.date} · {log.source==='parent_manual'?'家长手动':'自动结算'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Tab 4：假期设置 ── */}
        {activeTab==='holidays' && (
          <div className="space-y-6">
            {/* 添加假期 */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
              <h2 className="text-xl font-black text-slate-800 mb-5">🏖️ 添加节假日</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-600 mb-1">假期名称</label>
                  <input type="text" value={hlName} onChange={e=>setHlName(e.target.value)}
                    placeholder="例：国庆假期、五一假期"
                    className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:border-blue-500 focus:outline-none font-medium"/>
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-sm font-bold text-gray-600 mb-1">假期开始日（第一天）</label>
                    <input type="date" value={hlStart} onChange={e=>setHlStart(e.target.value)}
                      className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:border-blue-500 focus:outline-none font-medium"/>
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-bold text-gray-600 mb-1">假期结束日（最后一天）</label>
                    <input type="date" value={hlEnd} onChange={e=>setHlEnd(e.target.value)}
                      className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:border-blue-500 focus:outline-none font-medium"/>
                  </div>
                </div>
                <div className="bg-blue-50 rounded-xl p-3 text-sm text-blue-700 font-medium">
                  💡 <strong>只填假期本身的时间</strong>（如国庆 10/1-10/7），系统会自动把放假前一天（9/30）也纳入非正常上课日窗口。最长7天。
                </div>
                <button onClick={handleAddHoliday} disabled={hlLoading}
                  className={`w-full py-3 rounded-xl font-bold text-lg text-white transition-all ${hlLoading?'bg-gray-400':'bg-blue-600 active:scale-95'}`}>
                  {hlLoading?'添加中...':'确认添加假期'}
                </button>
              </div>
            </div>

            {/* 已有假期列表 */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-xl font-black text-slate-800">📅 已设置的假期</h2>
                <button onClick={fetchHolidays} className="text-sm text-gray-400 hover:text-gray-600 font-bold">🔄 刷新</button>
              </div>
              {holidays.length===0?(
                <div className="text-center py-8 text-gray-400">暂无假期设置</div>
              ):(
                <div className="space-y-3">
                  {holidays.map(h=>{
                    const days=(new Date(h.end_date).getTime()-new Date(h.start_date).getTime())/86400000+1;
                    const windowStart=new Date(new Date(h.start_date).getTime()-86400000).toISOString().slice(0,10);
                    return (
                      <div key={h.id} className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl border border-gray-100">
                        <div className="flex-1">
                          <div className="font-black text-gray-800 text-base mb-1">🏖️ {h.name}</div>
                          <div className="text-sm text-gray-500 font-medium">
                            假期：{h.start_date} ~ {h.end_date}（{days}天）
                          </div>
                          <div className="text-xs text-blue-500 font-bold mt-0.5">
                            积分窗口：{windowStart} ~ {h.end_date}（含放假前一天）
                          </div>
                        </div>
                        <button onClick={()=>handleDeleteHoliday(h.id,h.name)}
                          className="text-red-400 hover:text-red-600 font-bold text-sm flex-shrink-0">删除</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
