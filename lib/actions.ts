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
  let subject = '其它'
  
  try {
    // 调用阿里云百炼（通义千问）的兼容接口
    const aiResponse = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.ALIYUN_API_KEY}`
      },
      body: JSON.stringify({
        model: 'qwen-plus', // 这里使用的是通义千问的 plus 版本，性价比极高
        messages: [
          { 
            role: 'user', 
            content: `分析以下作业内容：“${content}”，仅严格返回一个词：语文、数学、英语、科学或其它。不要返回任何其他标点或解释。` 
          }
        ],
        temperature: 0.1
      })
    })

    const data = await aiResponse.json()
    if (data.choices && data.choices.length > 0) {
      subject = data.choices[0].message.content.trim()
    } else {
      throw new Error(data.error?.message || "AI 返回格式异常")
    }
  } catch (aiError) {
    console.error("阿里云 AI 识别失败:", aiError)
    subject = '其它'
  }

  // 写入数据库
  const { error } = await supabase.from('homework').insert([{ subject, content }])
  if (error) {
    throw new Error(error.message)
  }
}
