import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY;

// 🛡️ 核心修复引擎：双重防乱码解析器
function fixGarbledText(text: string) {
  if (!text) return '';
  
  // 1. 如果有 % 号，说明是小程序 encodeURIComponent 发来的，直接解密
  if (text.includes('%')) {
    try { return decodeURIComponent(text); } catch (e) {}
  }
  
  // 2. 终极还原：解决 Next.js 底层将 UTF-8 误认为 Latin1 的史诗级 Bug
  try {
    // 将乱码强制转换回原始字节，再用 utf8 重新正确拼装！
    const utf8Str = Buffer.from(text, 'latin1').toString('utf8');
    // 如果转换后不是空字符，就用转换后的结果
    return utf8Str || text;
  } catch (err) {
    return text;
  }
}

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

    // 💡 分流 A：网页端 JSON
    if (contentType.includes('application/json')) {
      const body = await request.json();
      content = body.content || '';
      originalFileName = body.filename || '';
      fileUrl = body.file_url || null;
      fileType = body.file_type || null;
    } 
    // 💡 分流 B：小程序 / 快捷指令 FormData
    else {
      const formData = await request.formData();
      
      const rawContent = formData.get('content') as string || '';
      const rawFilename = formData.get('filename') as string || '';
      
      // 使用还原引擎修复文本内容
      content = fixGarbledText(rawContent);
      originalFileName = fixGarbledText(rawFilename);
      
      file = formData.get('file') as File | null;
      
      // ⚠️ 如果是从苹果快捷指令直接传的文件，根本没有 filename 字段，只能从 file.name 取
      // 而此时的 file.name 绝对是拉丁乱码，必须进还原引擎洗一遍！
      if (!originalFileName && file) {
        originalFileName = fixGarbledText(file.name);
      }
    }

    if (!content.trim() && !fileUrl && (!file || file.size === 0)) {
      return NextResponse.json({ error: '数据为空' }, { status: 400 });
    }

    // 处理 Vercel 内部文件上传（如果前端没传链接的话）
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

    // 补全缺失的 content（用净化后的文件名）
    if (!content.trim() && originalFileName) {
      content = originalFileName.replace(/\.[^/.]+$/, "");
    }

    // 🚀 此时扔给 AI 的绝对是字正腔圆的中文了
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
