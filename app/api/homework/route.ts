import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY;

// 🤖 调用百炼大模型分析学科
async function analyzeSubjectWithAI(text: string, filename: string = '') {
  if (!DASHSCOPE_API_KEY) return '其它';
  const prompt = `请分析以下作业属于哪个学科（语文、数学、英语、科学、历史、地理、政治、其它）。\n文件名：${filename}\n内容：${text}\n请只输出一个学科名称，不要包含标点和解释。`;
  try {
    const response = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${DASHSCOPE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'qwen-turbo',
        input: { messages: [{ role: 'user', content: prompt }] },
        parameters: { result_format: 'text' }
      })
    });
    const data = await response.json();
    if (data.output?.text) {
      const subject = data.output.text.trim();
      const validSubjects = ["语文", "数学", "英语", "科学", "历史", "地理", "政治"];
      for (const valid of validSubjects) {
        if (subject.includes(valid)) return valid;
      }
    }
    return '其它';
  } catch (error) { return '其它'; }
}

export async function POST(request: Request) {
  try {
    let content = '';
    let originalFileName = '';
    let fileUrl = null;
    let fileType = null;
    let file: File | null = null;

    const contentType = request.headers.get('content-type') || '';

    // 💡 智能分流：如果是网页端发来的安全 JSON（前端已搞定文件上传）
    if (contentType.includes('application/json')) {
      const body = await request.json();
      content = body.content || '';
      originalFileName = body.filename || '';
      fileUrl = body.file_url || null;
      fileType = body.file_type || null;
    } 
    // 💡 小程序/快捷指令发来的 FormData
    else {
      const formData = await request.formData();
      const rawContent = formData.get('content') as string || '';
      const rawFilename = formData.get('filename') as string || '';
      try {
        content = rawContent ? decodeURIComponent(rawContent) : '';
        originalFileName = rawFilename ? decodeURIComponent(rawFilename) : '';
      } catch (e) {
        content = rawContent;
        originalFileName = rawFilename;
      }
      file = formData.get('file') as File | null;
      if (!originalFileName && file) originalFileName = file.name;
    }

    if (!content.trim() && !fileUrl && (!file || file.size === 0)) {
      return NextResponse.json({ error: '数据为空' }, { status: 400 });
    }

    // 只有当文件流存在，且前端没有提前传好 fileUrl 时，才在 Vercel 端上传
    if (file && file.size > 0 && !fileUrl) {
      const fileExt = originalFileName.split('.').pop() || 'pdf';
      const storageName = `api-${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
      await supabase.storage.from('attachments').upload(storageName, file);
      const { data: publicUrlData } = supabase.storage.from('attachments').getPublicUrl(storageName);
      fileUrl = publicUrlData.publicUrl;
      if (file.type.includes('pdf') || storageName.endsWith('.pdf')) fileType = 'pdf';
      else if (file.type.includes('image') || ['jpg', 'jpeg', 'png'].includes(fileExt)) fileType = 'image';
      else fileType = 'word';
    }

    if (!content.trim()) content = originalFileName.replace(/\.[^/.]+$/, "");

    // 🚀 让 AI 分析绝对纯净的中文
    const aiSubject = await analyzeSubjectWithAI(content, originalFileName);

    await supabase.from('homework').insert([{ 
      content: content,
      subject: aiSubject,
      file_url: fileUrl,
      file_type: fileType,
      is_completed: false
    }]);

    return NextResponse.json({ success: true, subject: aiSubject, message: '作业已极速同步！' });

  } catch (error: any) {
    console.error("API 错误:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
