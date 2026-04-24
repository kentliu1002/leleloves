import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// 初始化数据库
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

// 专门用来接收外界 POST 请求的接口
export async function POST(request: Request) {
  try {
    // 1. 接收从微信/快捷指令传过来的 JSON 数据
    const { content } = await request.json();
    
    if (!content) {
      return NextResponse.json({ error: '没有收到作业内容' }, { status: 400 });
    }

    let subject = '其它';
    
    // 2. 调用阿里云 AI 自动分类
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
      console.error("AI 分类失败，默认归为其它", error);
    }

    // 3. 存入数据库
    const { error: dbError } = await supabase.from('homework').insert([{ 
      content: content,
      subject: subject,
      // API 接收到的直接纯文本，暂不处理附件
      file_url: null,
      file_type: null
    }]);

    if (dbError) throw new Error(dbError.message);

    // 4. 成功后返回暗号
    return NextResponse.json({ success: true, message: '作业已成功注入数据库！' });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
