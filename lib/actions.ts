'use server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!)

// 1. 获取并清理作业列表
export async function getHomework() {
  // 💡 新增：计算 7 天前的时间点
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const cutoffIsoString = sevenDaysAgo.toISOString();

  // 💡 新增：静默删除 7 天前的数据，节约数据库空间
  await supabase.from('homework').delete().lt('created_at', cutoffIsoString);

  // 只拉取最近 7 天的数据
  const { data, error } = await supabase.from('homework')
    .select('*')
    .gte('created_at', cutoffIsoString)
    .order('created_at', { ascending: false })
    
  if (error) console.error("获取数据失败:", error)
  return data || []
}

// 2. 家长发布作业
export async function uploadHomework(formData: FormData) {
  const content = formData.get('content') as string
  const file = formData.get('file') as File | null
  let subject = '其它'
  
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

  let fileUrl = null;
  let fileType = null;

  if (file && file.size > 0) {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
    
    const { error: uploadError } = await supabase.storage.from('attachments').upload(fileName, file);
    if (uploadError) throw new Error("附件上传失败: " + uploadError.message);
    
    const { data: publicUrlData } = supabase.storage.from('attachments').getPublicUrl(fileName);
    fileUrl = publicUrlData.publicUrl;
    
    if (file.type.includes('pdf')) fileType = 'pdf';
    else if (file.type.includes('word') || file.name.includes('.doc')) fileType = 'word';
    else fileType = 'image';
  }

  const { error } = await supabase.from('homework').insert([{ 
    subject, 
    content,
    file_url: fileUrl,
    file_type: fileType
  }])
  
  if (error) throw new Error(error.message)
}

// 3. 孩子打卡完成作业
export async function completeHomework(formData: FormData) {
  const id = formData.get('id') as string
  const file = formData.get('file') as File | null

  let proofUrl = null;
  if (file && file.size > 0) {
    const fileExt = file.name.split('.').pop();
    const fileName = `proof-${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;

    const { error: uploadError } = await supabase.storage.from('attachments').upload(fileName, file);
    if (uploadError) throw new Error("照片上传失败: " + uploadError.message);

    const { data } = supabase.storage.from('attachments').getPublicUrl(fileName);
    proofUrl = data.publicUrl;
  }

  const { error } = await supabase.from('homework')
    .update({ is_completed: true, proof_image: proofUrl })
    .eq('id', id);

  if (error) throw new Error(error.message);
}
