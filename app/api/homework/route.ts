import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!, 
  process.env.SUPABASE_ANON_KEY!
);

// 🚨 强制使用 nodejs 运行时，防止 Vercel 误判为 Edge 环境导致 405
export const runtime = 'nodejs';

export async function POST(request: Request) {
  console.log("--- 收到 POST 请求 ---");
  try {
    const body = await request.json();
    console.log("收到数据:", body);

    // 先做一次最简单的数据库插入测试，不带 AI 逻辑
    const { error } = await supabase.from('homework').insert([{
      content: body.content || '测试上传',
      subject: '待识别',
      file_url: body.file_url || null,
      file_type: body.file_type || null,
      is_completed: false
    }]);

    if (error) {
      console.error("数据库写入失败:", error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, subject: '待识别' });

  } catch (err: any) {
    console.error("路由处理崩溃:", err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
