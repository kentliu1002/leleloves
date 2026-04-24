import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

export async function POST(request: Request) {
  try {
    // 1. 🚨 关键改变：使用 formData() 接收包含文件的“包裹”
    const formData = await request.formData();
    let content = formData.get('content') as string || '';
    const file = formData.get('file') as File | null;

    // 如果连字都没有，文件也没有，就拒绝
    if (!content.trim() && (!file || file.size === 0)) {
      return NextResponse.json({ error: '没有收到任何作业内容或附件' }, { status: 400 });
    }

    // 如果没写字但发了文件，自动提取文件名
    if (!content.trim() && file && file.size > 0) {
      content = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
    }

    let subject = '其它';

    // 2. 阿里云 AI 自动分类 (和以前一样)
    try {
      const aiResponse = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.ALIYUN_API_KEY}`
        },
        body: JSON.stringify({
          model: 'qwen-plus',
          messages: [{ role: 'user', content: `分析以下作业内容：“${content}”，仅严格返回一个词：语文、数学、英语、科学或其它。不要返回任何其他标点或解释。` }],
          temperature: 0.1
        })
      });
      const data = await aiResponse.json();
      if (data.choices && data.choices.length > 0) {
        subject = data.choices[0].message.content.trim();
      }
    } catch (error) {
      console.error("AI 分类失败:", error);
    }

    // 3. 🚨 关键改变：处理文件上传
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

    // 4. 将所有信息写入数据库
    const { error: dbError } = await supabase.from('homework').insert([{ 
      content: content,
      subject: subject,
      file_url: fileUrl,
      file_type: fileType
    }]);

    if (dbError) throw new Error(dbError.message);

    return NextResponse.json({ success: true, message: '作业和附件已成功接收！' });

  } catch (error: any) {
    console.error("API 错误:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
