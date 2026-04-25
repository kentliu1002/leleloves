import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

export async function POST(request: Request) {
  try {
    // 1. 拆解包裹：解析 multipart/form-data
    const formData = await request.formData();
    
    // 2. 提取便签信息（文字和科目）
    let content = formData.get('content') as string || '';
    // 💡 提取飞书传过来的科目，如果没有传，就默认设为 '其它'
    const subject = formData.get('subject') as string || '其它'; 
    
    // 3. 提取文件本身
    const file = formData.get('file') as File | null;

    if (!content.trim() && (!file || file.size === 0)) {
      return NextResponse.json({ error: '数据为空' }, { status: 400 });
    }

    let fileUrl = null;
    let fileType = null;

    // 4. 如果有文件，上传到 Supabase Storage
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

      if (!content.trim()) content = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
    }

    // 5. 将大模型分类的结果 (subject) 一起存入数据库
    const { error: dbError } = await supabase.from('homework').insert([{ 
      content: content,
      subject: subject,
      file_url: fileUrl,
      file_type: fileType
    }]);

    if (dbError) throw new Error(dbError.message);

    return NextResponse.json({ success: true, message: '作业同步成功！' });

  } catch (error: any) {
    console.error("API 解析错误:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
