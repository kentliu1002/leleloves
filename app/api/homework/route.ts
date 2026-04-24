import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    let content = formData.get('content') as string || '';
    const file = formData.get('file') as File | null;
    
    // 💡 核心改变：直接从飞书的请求中提取 subject，默认值为 '其它'
    let subject = formData.get('subject') as string || '其它';

    if (!content.trim() && (!file || file.size === 0)) {
      return NextResponse.json({ error: '没有收到任何作业内容或附件' }, { status: 400 });
    }

    if (!content.trim() && file && file.size > 0) {
      content = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
    }

    // 处理文件上传
    let fileUrl = null;
    let fileType = null;

    if (file && file.size > 0) {
      const fileExt = file.name.split('.').pop() || 'png';
      const fileName = `api-${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage.from('attachments').upload(fileName, file);
      if (uploadError) throw new Error("附件上传失败: " + uploadError.message);
      
      const { data: publicUrlData } = supabase.storage.from('attachments').getPublicUrl(fileName);
      fileUrl = publicUrlData.publicUrl;
      
      if (file.type.includes('pdf') || fileName.endsWith('.pdf')) fileType = 'pdf';
      else if (file.type.includes('word') || fileName.endsWith('.doc') || fileName.endsWith('.docx')) fileType = 'word';
      else fileType = 'image';
    }

    // 💡 极速入库：没有任何等待，拿到数据直接写入
    const { error: dbError } = await supabase.from('homework').insert([{ 
      content: content,
      subject: subject,
      file_url: fileUrl,
      file_type: fileType
    }]);

    if (dbError) throw new Error(dbError.message);

    return NextResponse.json({ success: true, message: '作业已极速同步！' });

  } catch (error: any) {
    console.error("API 错误:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
