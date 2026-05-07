import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import pdf from 'pdf-parse';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY;

async function analyzeHomeworkAI(params: { text?: string, filename?: string, imageUrl?: string }) {
  if (!DASHSCOPE_API_KEY) return '其它';
  const isVision = !!params.imageUrl;
  const payload = {
    model: isVision ? 'qwen-vl-plus' : 'qwen-turbo',
    input: {
      messages: [{
        role: 'user',
        content: isVision 
          ? [{ image: params.imageUrl }, { text: "判断学科（语文、数学、英语、科学、其它）。只输出学科名。" }]
          : [{ text: `判断学科。文件名: ${params.filename}, 内容: ${params.text}。只输出学科名。` }]
      }]
    }
  };
  try {
    const res = await fetch(isVision ? 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation' : 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${DASHSCOPE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    const result = isVision ? data.output?.choices[0]?.message.content[0].text : data.output?.text;
    const subjects = ["语文", "数学", "英语", "科学", "历史", "地理"];
    for (const s of subjects) { if (result?.includes(s)) return s; }
    return '其它';
  } catch (e) { return '其它'; }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { content, filename, file_url, file_type } = body;
    let extractedText = '';

    // 💡 核心逻辑：如果传过来的是 PDF 链接，后端去下载它并提取文字给 AI
    if (file_type === 'pdf' && file_url) {
      try {
        const fileRes = await fetch(file_url);
        const buffer = Buffer.from(await fileRes.arrayBuffer());
        const pdfData = await pdf(buffer);
        extractedText = pdfData.text.substring(0, 1000);
      } catch (e) { console.error("PDF解析失败", e); }
    }

    // AI 分析学科
    const aiSubject = await analyzeHomeworkAI({
      text: extractedText || content,
      filename: filename,
      imageUrl: file_type === 'image' ? file_url : undefined
    });

    // 存入数据库
    const { error } = await supabase.from('homework').insert([{
      content,
      subject: aiSubject,
      file_url,
      file_type,
      is_completed: false
    }]);

    if (error) throw error;
    return NextResponse.json({ success: true, subject: aiSubject });

  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
