import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import pdf from 'pdf-parse';
import { recognizeSubject } from '../../../lib/homework-subject.mjs';
import { ensureTodayRecurringHomework } from '../../../lib/recurring-homework.js';
import { findRecentDuplicate, storageNames, submissionId } from '../../../lib/homework-dedup.mjs';

// 1. 核心防线：强制声明为 nodejs 环境，确保 pdf-parse 兼容性，预防 405 错误
export const runtime = 'nodejs';

const ARK_API_KEY = process.env.ARK_API_KEY;

// service_role 客户端：读取开启了 RLS 的 recurring_homework，并生成当日固定作业
const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ==========================================
// 🚀 POST: 处理作业上传与 AI 识别
// ==========================================
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { filename, file_url, file_urls } = body;
    let content = body.content || '';
    let extractedText = '';
    const cnDate = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const id = submissionId({ filename, content, date: cnDate });

    // 微信端等待识别时可能再次提交：两分钟内相同原文件名（或纯文字内容）只创建一次。
    const recentSince = new Date(Date.now() - 2 * 60_000).toISOString();
    const { data: recentRows, error: recentError } = await svc
      .from('homework')
      .select('id, content, subject, file_urls')
      .gte('created_at', recentSince)
      .order('created_at', { ascending: false });
    if (recentError) throw recentError;
    const duplicate = findRecentDuplicate(recentRows || [], { filename, content });
    if (duplicate) {
      const uploadedNames = storageNames(file_urls);
      if (uploadedNames.length > 0) await svc.storage.from('attachments').remove(uploadedNames);
      return NextResponse.json({
        success: true,
        duplicate: true,
        subject: duplicate.subject,
        finalName: duplicate.content
      });
    }

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
    const aiSubject = await recognizeSubject({
      apiKey: ARK_API_KEY,
      text: extractedText || content,
      filename: filename,
      imageUrl: file_type === 'image' ? file_url : undefined
    });

    // C. 智能自动命名逻辑 (学科 + 序号)
    const isGeneric = !content.trim() || /^(wx_|mmexport|img_|image_|\d{10,})/i.test(content);
    if (isGeneric) {
      const cnTime = new Date(new Date().getTime() + 8 * 60 * 60 * 1000);
      const todayStr = cnTime.toISOString().split('T')[0];
      
      const { count } = await svc
        .from('homework')
        .select('*', { count: 'exact', head: true })
        .eq('subject', aiSubject)
        .gte('created_at', `${todayStr}T00:00:00+08:00`);
        
      content = `${aiSubject}${(count || 0) + 1}`;
    }

    // D. 写入数据库
    const { error: insertError } = await svc.from('homework').insert([{
      id,
      content: content,
      subject: aiSubject,
      file_url: file_url,
      file_type: file_type,
      file_urls: Array.isArray(file_urls) && file_urls.length > 0 ? JSON.stringify(file_urls) : null,
      is_completed: false
    }]);

    if (insertError?.code === '23505') {
      const uploadedNames = storageNames(file_urls);
      if (uploadedNames.length > 0) await svc.storage.from('attachments').remove(uploadedNames);
      const { data: existing } = await svc.from('homework').select('content, subject').eq('id', id).single();
      return NextResponse.json({
        success: true,
        duplicate: true,
        subject: existing?.subject || aiSubject,
        finalName: existing?.content || content
      });
    }
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
    const { data, error } = await svc
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

    const { error } = await svc
      .from('homework')
      .delete()
      .eq('id', id);
      
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
