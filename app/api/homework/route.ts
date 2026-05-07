import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import pdf from 'pdf-parse';

// 1. 核心防线：强制声明为 nodejs 环境，确保 pdf-parse 兼容性，预防 405 错误
export const runtime = 'nodejs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!, 
  process.env.SUPABASE_ANON_KEY!
);

const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY;

/**
 * 🤖 AI 识别引擎 (百炼 Coding Plan 套餐模式)
 * 已修正模型为 qwen3.5-plus
 */
async function analyzeHomeworkAI(params: { text?: string, filename?: string, imageUrl?: string }) {
  if (!DASHSCOPE_API_KEY) return '其它';
  const isVision = !!params.imageUrl;
  
  let messageContent: any;
  if (isVision) {
    messageContent = [
      { type: "text", text: "判断这张作业图片的学科（语文、数学、英语、科学、历史、地理、政治、其它）。只输出一个学科名。" },
      { type: "image_url", image_url: { url: params.imageUrl } }
    ];
  } else {
    messageContent = `判断作业学科。文件名: ${params.filename || '无'}, 内容: ${params.text || '无'}。只输出一个学科名称。`;
  }

  try {
    const response = await fetch('https://coding.dashscope.aliyuncs.com/v1/chat/completions', {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${DASHSCOPE_API_KEY}`, 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({
        model: 'qwen3.5-plus', // 修正为当前套餐支持的最强模型
        messages: [{ role: 'user', content: messageContent }]
      })
    });
    
    const data = await response.json();
    const resultText = data.choices?.[0]?.message?.content || '';
    
    // 匹配合法学科
    const validSubjects = ["语文", "数学", "英语", "科学", "历史", "地理", "政治"];
    for (const subject of validSubjects) {
      if (resultText.includes(subject)) return subject;
    }
    return '其它';
  } catch (error) {
    console.error("AI 识别失败:", error);
    return '其它';
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { filename, file_url, file_type } = body;
    let content = body.content || '';
    let extractedText = '';

    // A. 处理 PDF 文本提取 (通过 URL 下载)
    if (file_type === 'pdf' && file_url) {
      try {
        const fileRes = await fetch(file_url);
        const buffer = Buffer.from(await fileRes.arrayBuffer());
        const pdfData = await pdf(buffer);
        extractedText = pdfData.text.substring(0, 1000);
      } catch (e) {
        console.error("PDF解析异常:", e);
      }
    }

    // B. 调用 AI 分析
    const aiSubject = await analyzeHomeworkAI({
      text: extractedText || content,
      filename: filename,
      imageUrl: file_type === 'image' ? file_url : undefined
    });

    // C. 智能自动命名逻辑 (学科 + 序号)
    const isGeneric = !content.trim() || /^(wx_|mmexport|img_|image_|\d{10,})/i.test(content);
    if (isGeneric) {
      const cnTime = new Date(new Date().getTime() + 8 * 60 * 60 * 1000);
      const todayStr = cnTime.toISOString().split('T')[0];
      
      const { count } = await supabase
        .from('homework')
        .select('*', { count: 'exact', head: true })
        .eq('subject', aiSubject)
        .gte('created_at', `${todayStr}T00:00:00+08:00`);
        
      content = `${aiSubject}${(count || 0) + 1}`;
    }

    // D. 写入数据库
    const { error: insertError } = await supabase.from('homework').insert([{
      content: content,
      subject: aiSubject,
      file_url: file_url,
      file_type: file_type,
      is_completed: false
    }]);

    if (insertError) throw insertError;

    return NextResponse.json({ 
      success: true, 
      subject: aiSubject, 
      finalName: content 
    });

  } catch (err: any) {
    console.error("API 报错:", err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
