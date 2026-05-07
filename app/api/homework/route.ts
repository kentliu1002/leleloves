import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import pdf from 'pdf-parse';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY;

// 🤖 AI 识别引擎
async function analyzeHomeworkAI(params: { text?: string, filename?: string, imageUrl?: string }) {
  if (!DASHSCOPE_API_KEY) return '其它';
  const isVision = !!params.imageUrl;
  const payload = {
    model: isVision ? 'qwen-vl-plus' : 'qwen-turbo',
    input: {
      messages: [{
        role: 'user',
        content: isVision 
          ? [{ image: params.imageUrl }, { text: "判断学科（语文、数学、英语、科学、历史、地理、政治、其它）。只输出一个学科名。" }]
          : [{ text: `判断学科。文件名: ${params.filename}, 内容: ${params.text}。只输出一个学科名。` }]
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
    const subjects = ["语文", "数学", "英语", "科学", "历史", "地理", "政治"];
    for (const s of subjects) { if (result?.includes(s)) return s; }
    return '其它';
  } catch (e) { return '其它'; }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { filename, file_url, file_type } = body;
    let content = body.content || '';
    let extractedText = '';

    // 1. 如果是 PDF，尝试提取文字给 AI 参考
    if (file_type === 'pdf' && file_url) {
      try {
        const fileRes = await fetch(file_url);
        const buffer = Buffer.from(await fileRes.arrayBuffer());
        const pdfData = await pdf(buffer);
        extractedText = pdfData.text.substring(0, 1000);
      } catch (e) { console.error("PDF解析失败", e); }
    }

    // 2. AI 分析学科
    const aiSubject = await analyzeHomeworkAI({
      text: extractedText || content,
      filename: filename,
      imageUrl: file_type === 'image' ? file_url : undefined
    });

    // 💡 3. 智能命名逻辑（核心新增）
    // 检查名字是不是空的，或者是不是微信自带的无意义乱码(如 wx_, mmexport_, img_)
    const isUselessName = !content.trim() || /^(wx_|mmexport|img_|image_|\d{10,})/i.test(content);
    
    if (isUselessName) {
       // 获取北京时间的今天日期
       const cnDate = new Date(new Date().getTime() + 8 * 60 * 60 * 1000).toISOString().split('T')[0];
       
       // 去数据库查一下，今天这个学科已经上传了几份作业？
       const { count } = await supabase
         .from('homework')
         .select('*', { count: 'exact', head: true })
         .eq('subject', aiSubject)
         .gte('created_at', `${cnDate}T00:00:00+08:00`); // 从今天的零点开始算起

       // 在现有数量的基础上 +1
       const index = (count || 0) + 1;
       
       // 重新给 content 赋值为：学科名 + 数字（例如：数学1）
       content = `${aiSubject}${index}`; 
    }

    // 4. 存入数据库
    const { error } = await supabase.from('homework').insert([{
      content: content,
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
