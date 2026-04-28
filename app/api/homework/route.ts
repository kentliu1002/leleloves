import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY; // 从 Vercel 环境变量读取

// 🤖 核心逻辑：调用百炼大模型分析学科
async function analyzeSubjectWithAI(text: string, filename: string = '') {
  if (!DASHSCOPE_API_KEY) {
    console.warn("未配置 DASHSCOPE_API_KEY，跳过 AI 识别");
    return '其它';
  }

  const prompt = `请作为一名教育助手，分析以下作业内容属于哪个学科门类。
  常见的学科包括：语文、数学、英语、科学、历史、地理、政治、其它。
  文件名线索：${filename}
  文本内容线索：${text}
  请仅仅输出一个学科名称，不要包含任何标点符号或解释性文字。`;

  try {
    const response = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DASHSCOPE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'qwen-turbo',
        input: {
          messages: [
            { role: 'system', content: '你是一个精准的学科分类助手。' },
            { role: 'user', content: prompt }
          ]
        },
        parameters: { result_format: 'text' }
      })
    });

    const data = await response.json();
    
    if (data.output && data.output.text) {
      const subject = data.output.text.trim();
      // 过滤清洗，防止 AI 胡言乱语
      const validSubjects = ["语文", "数学", "英语", "科学", "历史", "地理", "政治"];
      for (const valid of validSubjects) {
        if (subject.includes(valid)) return valid;
      }
    }
    return '其它';
  } catch (error) {
    console.error("AI 识别异常:", error);
    return '其它';
  }
}

export async function POST(request: Request) {
  try {
    // 1. 解析小程序发来的包裹
    const formData = await request.formData();
    let content = formData.get('content') as string || '';
    const file = formData.get('file') as File | null;

    if (!content.trim() && (!file || file.size === 0)) {
      return NextResponse.json({ error: '数据为空' }, { status: 400 });
    }

    let fileUrl = null;
    let fileType = null;
    let originalFileName = '';

    // 2. 如果有文件，上传到 Supabase Storage
    if (file && file.size > 0) {
      originalFileName = file.name;
      const fileExt = originalFileName.split('.').pop() || 'jpg';
      const storageName = `api-${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage.from('attachments').upload(storageName, file);
      if (uploadError) throw new Error("附件上传失败: " + uploadError.message);
      
      const { data: publicUrlData } = supabase.storage.from('attachments').getPublicUrl(storageName);
      fileUrl = publicUrlData.publicUrl;
      
      if (file.type.includes('pdf') || storageName.endsWith('.pdf')) fileType = 'pdf';
      else if (file.type.includes('word') || storageName.endsWith('.doc') || storageName.endsWith('.docx')) fileType = 'word';
      else fileType = 'image';

      // 如果纯传文件没配文字，用文件名兜底
      if (!content.trim()) content = originalFileName.replace(/\.[^/.]+$/, ""); 
    }

    // 🚀 3. 呼叫 AI 进行学科分类分析 (不管有没有传 subject，都由服务端 AI 接管判断)
    const aiSubject = await analyzeSubjectWithAI(content, originalFileName);

    // 4. 数据入库
    const { error: dbError } = await supabase.from('homework').insert([{ 
      content: content,
      subject: aiSubject, // 填入 AI 识别的结果
      file_url: fileUrl,
      file_type: fileType,
      is_completed: false
    }]);

    if (dbError) throw new Error(dbError.message);

    return NextResponse.json({ success: true, subject: aiSubject, message: '作业同步且 AI 识别成功！' });

  } catch (error: any) {
    console.error("API 解析错误:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
