import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import pdf from 'pdf-parse';
import { ensureTodayRecurringHomework } from '../../../lib/recurring-homework.js';

// 1. 核心防线：强制声明为 nodejs 环境，确保 pdf-parse 兼容性，预防 405 错误
export const runtime = 'nodejs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!, 
  process.env.SUPABASE_ANON_KEY!
);

const ARK_API_KEY = process.env.ARK_API_KEY;

// service_role 客户端：读取开启了 RLS 的 recurring_homework，并生成当日固定作业
const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * 🤖 AI 识别引擎 (百炼 Coding Plan 套餐模式)
 * 模型：doubao-seed-2.0-pro（火山方舟 coding）
 */
const VALID_SUBJECTS = ["语文", "数学", "英语", "科学", "历史", "地理", "政治"];

function matchSubjectFromText(text: string): string {
  for (const s of VALID_SUBJECTS) {
    if (text.includes(s)) return s;
  }
  return '其它';
}

async function analyzeHomeworkAI(params: { text?: string, filename?: string, imageUrl?: string }) {
  if (!ARK_API_KEY) return matchSubjectFromText(`${params.filename || ''} ${params.text || ''}`);

  // 豆包国内拉海外 Supabase 图常超时，先下载转 base64 内联
  let dataUrl: string | null = null;
  if (params.imageUrl) {
    try {
      const r = await fetch(params.imageUrl);
      if (r.ok) {
        const buf = Buffer.from(await r.arrayBuffer());
        const mime = r.headers.get('content-type') || 'image/jpeg';
        dataUrl = `data:${mime};base64,${buf.toString('base64')}`;
      }
    } catch { dataUrl = null; }
  }
  const isVision = !!dataUrl;

  let messageContent: any;
  if (isVision) {
    messageContent = [
      {
        type: "text",
        text: `请判断下面这张作业图片属于哪个学科（只能从以下选项中选一个输出：语文、数学、英语、科学、历史、地理、政治、其它）。文件名参考：${params.filename || ''}。只输出学科名，不要其他文字。`
      },
      { type: "image_url", image_url: { url: dataUrl } }
    ];
  } else {
    messageContent = `/no_think 判断作业学科（只输出：语文/数学/英语/科学/历史/地理/政治/其它 之一）。文件名: ${params.filename || '无'}, 内容: ${params.text || '无'}。`;
  }

  try {
    const response = await fetch('https://ark.cn-beijing.volces.com/api/coding/v3/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ARK_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'doubao-seed-2.0-pro',
        messages: [{ role: 'user', content: messageContent }]
      })
    });

    const data = await response.json();
    const resultText = data.choices?.[0]?.message?.content || '';
    console.log(`[AI科目识别] 模式:${isVision?'视觉':'文本'} 结果:"${resultText.trim()}"`);

    const aiResult = matchSubjectFromText(resultText);

    // 视觉识别返回其它时，用文件名/内容做文本兜底
    if (aiResult === '其它') {
      const textFallback = matchSubjectFromText(`${params.filename || ''} ${params.text || ''}`);
      if (textFallback !== '其它') {
        console.log(`[AI科目识别] 视觉识别为其它，文本兜底结果: ${textFallback}`);
        return textFallback;
      }
    }
    return aiResult;
  } catch (error) {
    console.error("AI 识别失败:", error);
    // 异常时也用文本兜底
    return matchSubjectFromText(`${params.filename || ''} ${params.text || ''}`);
  }
}

// ==========================================
// 🚀 POST: 处理作业上传与 AI 识别
// ==========================================
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { filename, file_url, file_urls } = body;
    let content = body.content || '';
    let extractedText = '';

    // 根据实际 URL 后缀纠正 file_type（防止客户端传错）
    let file_type = body.file_type as string;
    if (file_url) {
      const urlExt = file_url.split('?')[0].split('.').pop()?.toLowerCase() || '';
      if (['mp3', 'm4a', 'wav', 'ogg', 'aac'].includes(urlExt)) file_type = 'audio';
      else if (urlExt === 'pdf') file_type = 'pdf';
      else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(urlExt)) file_type = 'image';
    }

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
      file_urls: Array.isArray(file_urls) && file_urls.length > 0 ? JSON.stringify(file_urls) : null,
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

// ==========================================
// 🚀 GET: 获取历史记录 (拉取最新 50 条)
// ==========================================
export async function GET(request: Request) {
  try {
    try { await ensureTodayRecurringHomework(svc); } catch (e) { console.error('生成固定作业失败:', e); }
    const { data, error } = await supabase
      .from('homework')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
      
    if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// ==========================================
// 🚀 DELETE: 删除指定的作业
// ==========================================
export async function DELETE(request: Request) {
  try {
    // 从 URL 中提取要删除的 id (例如: /api/homework?id=123)
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) throw new Error('缺少要删除的作业 ID');

    const { error } = await supabase
      .from('homework')
      .delete()
      .eq('id', id);
      
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
