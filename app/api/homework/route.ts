import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY;

// 🛡️ 核心修复引擎：双重防乱码解析器
function fixGarbledText(text: string) {
  if (!text) return '';
  if (text.includes('%')) {
    try { return decodeURIComponent(text); } catch (e) {}
  }
  try {
    const utf8Str = Buffer.from(text, 'latin1').toString('utf8');
    return utf8Str || text;
  } catch (err) {
    return text;
  }
}

// 🤖 调用百炼大模型分析学科 (完美平衡的结构化提示词)
async function analyzeSubjectWithAI(text: string, filename: string = '') {
  if (!DASHSCOPE_API_KEY) return '其它';
  
  // 💡 使用结构化的提示词，无论传文字还是传文件，都能让大模型清晰看懂
  const prompt = `你是一个极简的学科分类器。请从【语文、数学、英语、科学、历史、地理、政治、其它】中选出一个最匹配的学科。
  
【线索1】文件名：${filename || '无'}
【线索2】作业内容：${text || '无'}

判断规则：
1. 综合分析“线索1”和“线索2”，只要包含学科关键字，立刻归类。
2. 即使只有标题没有内容，也要盲猜学科。
3. 你只能输出上述列表中的一个学科名，绝对不要输出任何标点符号、解释文字或前缀。`;
  
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
    
    // 智能提取：即便大模型废话连篇，只要包含这几个字就能抓出来
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
      
      content = fixGarbledText(rawContent);
      originalFileName = fixGarbledText(rawFilename);
      file = formData.get('file') as File | null;
      
      if (!originalFileName && file) {
        originalFileName = fixGarbledText(file.name);
      }
    }

    if (!content.trim() && !fileUrl && (!file || file.size === 0)) {
      return NextResponse.json({ error: '数据为空' }, { status: 400 });
    }

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

    // 🚀 投喂给 AI 引擎
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
