'use client';
import { createClient } from '@supabase/supabase-js';
import { useState, useEffect } from 'react';
import { deleteHomework } from '../../lib/actions';

// 前端初始化 Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function ParentPage() {
  const [loading, setLoading] = useState(false);
  const [homeworkList, setHomeworkList] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  const last7Days = Array.from({length: 7}, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - i);
    return d.toLocaleDateString();
  });
  const [selectedDate, setSelectedDate] = useState(last7Days[0]);

  const fetchHomework = async () => {
    const { data } = await supabase.from('homework').select('*').order('created_at', { ascending: false });
    setHomeworkList(data || []);
    setSelectedIds([]);
  };

  useEffect(() => { fetchHomework(); }, []);

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const formData = new FormData(e.target);
      const contentInput = formData.get('content') as string;
      const file = formData.get('file') as File | null;
      
      let finalContent = contentInput;
      let fileUrl = null;
      let fileType = null;
      let originalFileName = '';

      if (file && file.size > 0) {
        originalFileName = file.name;
        const fileExt = file.name.split('.').pop() || 'pdf';
        const storageName = `web-${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage.from('attachments').upload(storageName, file);
        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage.from('attachments').getPublicUrl(storageName);
        fileUrl = publicUrlData.publicUrl;
        
        if (file.type.includes('pdf') || fileExt === 'pdf') fileType = 'pdf';
        else if (file.type.includes('image') || ['jpg', 'jpeg', 'png'].includes(fileExt)) fileType = 'image';
        else fileType = 'word';

        // 💡 核心修复：聪明地去除后缀，保留完整文件名（无论中间有几个点）
        if (!finalContent.trim()) {
          const lastDotIndex = originalFileName.lastIndexOf('.');
          finalContent = lastDotIndex !== -1 
            ? originalFileName.substring(0, lastDotIndex) 
            : originalFileName;
        }
      }

      if (!finalContent.trim() && !fileUrl) {
        alert("请填写内容或选择附件");
        setLoading(false);
        return;
      }

      const response = await fetch('/api/homework', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: finalContent,
          filename: originalFileName,
          file_url: fileUrl,
          file_type: fileType
        })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error);

      alert(`发布成功！AI识别科目为：${result.subject || '其它'}`);
      e.target.reset();
      fetchHomework();
    } catch (error: any) {
      alert('操作失败: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSingle = async (id: string) => {
    if (!confirm('确定要删除这条作业吗？')) return;
    try {
      await deleteHomework([id]);
      fetchHomework();
    } catch (e: any) { alert('删除失败：' + e.message); }
  };

  const handleDeleteBatch = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`确定删除 ${selectedIds.length} 条作业吗？`)) return;
    setLoading(true);
    try {
      await deleteHomework(selectedIds);
      fetchHomework();
    } catch (e: any) { alert('批量删除失败：' + e.message); } 
    finally { setLoading(false); }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const filteredHomework = homeworkList.filter((item: any) => 
    new Date(item.created_at).toLocaleDateString() === selectedDate
  );

  return (
    <div className="min-h-screen bg-gray-50 p-4 lg:p-8 max-w-3xl mx-auto">
      <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 mb-8 mt-4">
        <h1 className="text-3xl font-black text-slate-800 mb-6">📝 布置大文件作业</h1>
        <form onSubmit={handleSubmit} className="space-y-6">
          <textarea name="content" className="w-full p-5 border-2 border-gray-200 rounded-2xl h-32 shadow-sm text-lg focus:border-blue-500 focus:outline-none" placeholder="输入作业内容...（若直接上传附件，此处可留空）" />
          <div className="bg-slate-50 p-4 rounded-2xl border-2 border-dashed border-gray-300">
            <label className="block text-gray-700 font-bold mb-2">📎 添加附件 (无大小限制)</label>
            <input type="file" name="file" className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
          </div>
          <button disabled={loading} className={`w-full text-white py-4 rounded-2xl font-bold text-xl shadow-lg transition-all ${loading ? 'bg-gray-400' : 'bg-blue-600 active:scale-95'}`}>
            {loading ? '正在极速上传并分析学科...' : '确认发布'}
          </button>
        </form>
      </div>

      <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100">
        <div className="flex flex-col md:flex-row items-center justify-between mb-6 gap-4">
          <h2 className="text-2xl font-black text-slate-800">👀 历史记录与管理</h2>
          <div className="flex items-center gap-3">
            {selectedIds.length > 0 && (
              <button onClick={handleDeleteBatch} className="text-sm bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 py-2 px-4 rounded-full font-bold shadow-sm transition-all">🗑️ 删除选中 ({selectedIds.length})</button>
            )}
            <button onClick={fetchHomework} className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 px-4 rounded-full font-bold transition-all">🔄 刷新</button>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-4 mb-4 scrollbar-hide">
          {last7Days.map((date, index) => {
            const isToday = index === 0;
            const displayDate = isToday ? '今天' : date.substring(date.indexOf('/') + 1);
            return (
              <button key={date} onClick={() => setSelectedDate(date)} className={`whitespace-nowrap px-5 py-2 rounded-full font-bold transition-all ${selectedDate === date ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                {displayDate}
              </button>
            );
          })}
        </div>

        <div className="space-y-4">
          {filteredHomework.map((item: any) => (
            <div key={item.id} className={`p-5 rounded-2xl border transition-all flex flex-col sm:flex-row gap-4 ${selectedIds.includes(item.id) ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-100'}`}>
              {!item.is_completed && (
                <div className="pt-1"><input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => toggleSelect(item.id)} className="w-5 h-5 rounded cursor-pointer" /></div>
              )}
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs font-bold px-3 py-1 rounded-full text-white ${item.subject === '语文' ? 'bg-red-500' : item.subject === '数学' ? 'bg-blue-500' : item.subject === '英语' ? 'bg-yellow-400' : item.subject === '科学' ? 'bg-green-500' : 'bg-slate-500'}`}>{item.subject}</span>
                  <span className="text-xs text-gray-400 font-medium">{new Date(item.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">{item.content}</p>
              </div>
              <div className="sm:w-48 sm:border-l-2 sm:border-gray-200 sm:pl-4 flex flex-col justify-center items-center gap-3">
                {item.is_completed ? (
                  <div className="text-center">
                    <span className="inline-block bg-green-100 text-green-700 font-bold px-3 py-1 rounded-full text-sm mb-2">✅ 已打卡</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <span className="inline-block bg-orange-100 text-orange-600 font-bold px-3 py-1 rounded-full text-sm shadow-sm">⏳ 待完成</span>
                    <button onClick={() => handleDeleteSingle(item.id)} className="text-xs font-bold text-gray-400 hover:text-red-500">删除此项</button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {filteredHomework.length === 0 && <div className="text-center py-10 text-gray-400 font-medium">这个日期暂时没有作业记录哦。</div>}
        </div>
      </div>
    </div>
  );
}
