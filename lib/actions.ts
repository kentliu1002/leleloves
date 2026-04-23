'use server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!)

export async function getHomework() {
  const { data, error } = await supabase.from('homework').select('*').order('created_at', { ascending: false })
  if (error) console.error("获取数据失败:", error)
  return data || []
}

export async function uploadHomework(formData: FormData) {
  const content = formData.get('content') as string
  const file = formData.get('file') as File | null // 获取上传的文件
  let subject = '其它'
  
  // 1. 调用阿里云 AI 进行分类
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
    })
    const data = await aiResponse.json()
    if (data.choices && data.choices.length > 0) {
      subject = data.choices[0].message.content.trim()
    }
  } catch (aiError) {
    console.error("阿里云 AI 识别失败:", aiError)
    subject = '其它'
  }

  // 2. 处理附件上传到 Supabase Storage
  let fileUrl = null;
  let fileType = null;

  if (file && file.size > 0) {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
    
    // 上传到 attachments 存储桶
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('attachments')
      .upload(fileName, file);
      
    if (uploadError) throw new Error("附件上传失败: " + uploadError.message);
    
    // 获取文件的公开下载链接
    const { data: publicUrlData } = supabase.storage.from('attachments').getPublicUrl(fileName);
    fileUrl = publicUrlData.publicUrl;
    
    // 判断文件类型给前端显示
    if (file.type.includes('pdf')) fileType = 'pdf';
    else if (file.type.includes('word') || file.name.includes('.doc')) fileType = 'word';
    else fileType = 'image';
  }

  // 3. 将文字、AI分类、文件链接一起写入数据库
  const { error } = await supabase.from('homework').insert([{ 
    subject, 
    content,
    file_url: fileUrl,
    file_type: fileType
  }])
  
  if (error) {
    throw new Error(error.message)
  }
}
