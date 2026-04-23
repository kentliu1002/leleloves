'use server'
import { createClient } from '@supabase/supabase-js'
import { GoogleGenerativeAI } from "@google/generative-ai"

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

export async function getHomework() {
  const { data } = await supabase.from('homework').select('*').order('created_at', { ascending: false })
  return data || []
}

export async function uploadHomework(formData: FormData) {
  const content = formData.get('content') as string
  
  // AI 智能分类
  const model = genAI.getGenerativeModel({ model: "gemini-pro" })
  const result = await model.generateContent(`分析以下作业内容：“${content}”，仅返回一个词：语文、数学、英语、科学或其它。`)
  const subject = result.response.text().trim()

  // 写入数据库
  await supabase.from('homework').insert([{ subject, content }])
}