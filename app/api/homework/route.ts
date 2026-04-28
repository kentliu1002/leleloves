import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import pdf from 'pdf-parse'; // 需执行 npm install pdf-parse

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY;

// 🛡️ 乱码还原逻辑
function fixGarbledText(text: string) {
  if (!text) return '';
  if (text.includes('%')) { try { return decodeURIComponent(text); } catch (e) {} }
  try { return Buffer.from(text, 'latin1').toString('utf8') || text; } catch (err) { return text; }
}

// 🤖 核心识别引擎：支持视觉识别和文本分析
async function analyzeHomeworkAI(params: { text?: string, filename?: string, imageUrl?: string }) {
  if (!DASHSCOPE_API_KEY) return '未配置密钥';

  const isVisionMode = !!params.imageUrl;
  const endpoint = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';
  const textModel = 'qwen-turbo';
  const visionModel = 'qwen-vl-plus'; // 视觉大模型

  // 1. 构造请求体
  let payload: any = {
    model: isVisionMode ? visionModel : textModel,
    input: {
      messages: [
        {
          role: 'user',
          content: isVisionMode 
            ? [
                { image: params.imageUrl },
                { text: "请分析这张作业图片里的内容，判断它属于哪个学科（语文、数学、英语、科学、其它）。请只输出学科名称。" }
              ]
            : [
                { text: `分析作业学科（语文、数学、英语、科学、其它）。文件名：${params.filename}，提取到的文字内容：${params.text}。请只输出一个学科名称。` }
              ]
        }
      ]
    }
  };

  try {
    const response = await fetch(isVisionMode ? endpoint : 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${DASHSCOPE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    const resultText = isVisionMode ? data.output?.choices[0]?.message.content[0].text : data.output?.text;

    if (resultText) {
      const validSubjects = ["语文", "数学", "英语", "科学", "历史", "地理", "政治"];
      for (const valid of validSubjects) {
        if (resultText.includes(valid)) return valid;
      }
    }
    return '其它';
  } catch (error) {
    return '识别失败';
  }
}

export async function POST(request: Request) {
  try {
    let content = '';
    let originalFileName = '';
    let fileUrl = null;
    let fileType = null;
    let file: File | null = null;
    let extractedText = '';

    const contentType = request.headers.get('content-type') || '';

    // A. 解析数据
    if (contentType.includes('application/json')) {
      const body = await request.json();
      content = body.content || '';
      originalFileName = body.filename || '';
      fileUrl = body.file_url || null;
      fileType = body.file_type || null;
    } else {
      const formData = await request.formData();
      content = fixGarbledText(formData.get('content') as string || '');
      originalFileName = fixGarbledText(formData.get('filename') as string || '');
      file = formData.get('file') as File | null;
      if (!originalFileName && file) originalFileName = fixGarbledText(file.name);
    }

    // B. 处理文件上传与内容提取
    if (file && file.size > 0 && !fileUrl) {
      const fileExt = originalFileName.split('.').pop()?.toLowerCase() || 'pdf';
      const storageName = `api-${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
      
      const fileBuffer = Buffer.from(await file.arrayBuffer());
      
      // 📝 如果是 PDF，尝试提取前 2000 个字符
      if (fileExt === 'pdf') {
        try {
          const pdfData = await pdf(fileBuffer);
          extractedText = pdfData.text.substring(0, 2000);
          fileType = 'pdf';
        } catch (e) { console.error("PDF解析失败"); }
      } else if (['jpg', 'jpeg', 'png'].includes(fileExt)) {
        fileType = 'image';
      }

      await supabase.storage.from('attachments').upload(storageName, fileBuffer);
      fileUrl = supabase.storage.from('attachments').getPublicUrl(storageName).data.publicUrl;
    }

    if (!content.trim() && originalFileName) content = originalFileName.replace(/\.[^/.]+$/, "");

    // 🚀 C. 智能 AI 识别
    let aiSubject = '其它';
    if (fileType === 'image' && fileUrl) {
      // 🖼️ 视觉识别模式
      aiSubject = await analyzeHomeworkAI({ imageUrl: fileUrl });
    } else {
      // 📄 文本分析模式（包含 PDF 提取到的文字）
      aiSubject = await analyzeHomeworkAI({ text: extractedText || content, filename: originalFileName });
    }

    // D. 入库
    await supabase.from('homework').insert([{ 
      content, subject: aiSubject, file_url: fileUrl, file_type: fileType, is_completed: false 
    }]);

    return NextResponse.json({ success: true, subject: aiSubject });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
