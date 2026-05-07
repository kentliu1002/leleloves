import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import pdf from 'pdf-parse';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY;

// 🛡️ 乱码还原逻辑
function fixGarbledText(text: string) {
  if (!text) return '';
  if (text.includes('%')) { try { return decodeURIComponent(text); } catch (e) {} }
  try { return Buffer.from(text, 'latin1').toString('utf8') || text; } catch (err) { return text; }
}

// 🤖 AI 识别引擎
async function analyzeHomeworkAI(params: { text?: string, filename?: string, imageUrl?: string }) {
  if (!DASHSCOPE_API_KEY) return '其它';
  const isVisionMode = !!params.imageUrl;
  const endpoint = isVisionMode 
    ? 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation'
    : 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation';
  
  const payload = {
    model: isVisionMode ? 'qwen-vl-plus' : 'qwen-turbo',
    input: {
      messages: [{
        role: 'user',
        content: isVisionMode 
          ? [{ image: params.imageUrl }, { text: "判断这张作业图片的学科（语文、数学、英语、科学、其它）。只输出学科名。" }]
          : [{ text: `判断学科：文件名 ${params.filename}, 内容 ${params.text}。只输出学科名。` }]
      }]
    }
  };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${DASHSCOPE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    const resultText = isVisionMode ? data.output?.choices[0]?.message.content[0].text : data.output?.text;
    const validSubjects = ["语文", "数学", "英语", "科学", "历史", "地理", "政治"];
    for (const valid of validSubjects) { if (resultText?.includes(valid)) return valid; }
    return '其它';
  } catch (e) { return '其它'; }
}

export async function POST(request: Request) {
  try {
    let content = '';
    let originalFileName = '';
    let fileUrl = null;
    let fileType = null;
    let extractedText = '';

    const contentType = request.headers.get('content-type') || '';

    // 1. 数据解析阶段
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
      const file = formData.get('file') as File | null;
      
      if (file && file.size > 0) {
        if (!originalFileName) originalFileName = fixGarbledText(file.name);
        const fileExt = originalFileName.split('.').pop()?.toLowerCase() || 'pdf';
        
        if (fileExt === 'pdf') fileType = 'pdf';
        else if (['jpg', 'jpeg', 'png'].includes(fileExt)) fileType = 'image';

        const fileBuffer = Buffer.from(await file.arrayBuffer());
        
        // 💡 核心修复：强制使用随机英文数字生成文件名，绝对不包含中文，防止 Supabase 上传崩溃
        const storageName = `api-${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
        
        if (fileExt === 'pdf') {
          try {
            const pdfData = await pdf(fileBuffer);
            extractedText = pdfData.text.substring(0, 1000);
          } catch (pdfErr) {}
        }

        // 给文件贴上身份证标签
        let mimeType = 'application/octet-stream';
        if (fileExt === 'pdf') mimeType = 'application/pdf';
        else if (['jpg', 'jpeg'].includes(fileExt)) mimeType = 'image/jpeg';
        else if (fileExt === 'png') mimeType = 'image/png';

        const { error: uploadError } = await supabase.storage.from('attachments').upload(storageName, fileBuffer, {
          contentType: mimeType,
          upsert: true
        });
        
        if (!uploadError) {
          fileUrl = supabase.storage.from('attachments').getPublicUrl(storageName).data.publicUrl;
        } else {
          console.error("Supabase 上传失败:", uploadError);
        }
      }
    }

    // 2. AI 识别阶段
    if (!content.trim() && originalFileName) content = originalFileName.replace(/\.[^/.]+$/, "");
    const aiSubject = await analyzeHomeworkAI({ 
      text: extractedText || content, 
      filename: originalFileName, 
      imageUrl: fileType === 'image' ? fileUrl : undefined 
    });

    // 3. 数据库写入阶段
    const { error: insertError } = await supabase.from('homework').insert([{ 
      content, 
      subject: aiSubject, 
      file_url: fileUrl, 
      file_type: fileType, 
      is_completed: false 
    }]);

    if (insertError) throw new Error("数据库写入失败");

    return NextResponse.json({ success: true, subject: aiSubject });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
