'use server'
import { createClient } from '@supabase/supabase-js'

// 初始化 Supabase 客户端
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

// 1. 获取所有作业
export async function getHomework() {
  const { data, error } = await supabase
    .from('homework')
    .select('*')
    .order('created_at', { ascending: false })
    
  if (error) throw new Error(error.message)
  return data || []
}

// 2. 家长端布置新作业
export async function uploadHomework(formData: FormData) {
  let content = formData.get('content') as string || ''
  const file = formData.get('file') as File | null
  
  let fileUrl = null
  let fileType = null

  // 处理附件上传
  if (file && file.size > 0) {
    const fileExt = file.name.split('.').pop() || 'png'
    const fileName = `parent-${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`
    
    const { error: uploadError } = await supabase.storage.from('attachments').upload(fileName, file)
    if (uploadError) throw new Error("附件上传失败: " + uploadError.message)
    
    const { data: publicUrlData } = supabase.storage.from('attachments').getPublicUrl(fileName)
    fileUrl = publicUrlData.publicUrl
    
    if (file.type.includes('pdf') || fileName.endsWith('.pdf')) fileType = 'pdf'
    else if (file.type.includes('word') || fileName.endsWith('.doc') || fileName.endsWith('.docx')) fileType = 'word'
    else fileType = 'image'

    // 如果没有输入文字，提取文件名作为内容
    if (!content.trim()) {
       content = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
    }
  }

  // 简单的科目匹配逻辑（防止前端没有传 subject）
  let subject = '其它'
  if (content.includes('语文')) subject = '语文'
  else if (content.includes('数学')) subject = '数学'
  else if (content.includes('英语')) subject = '英语'
  else if (content.includes('科学')) subject = '科学'

  const { error: dbError } = await supabase.from('homework').insert([{ 
    content: content, 
    subject: subject, 
    file_url: fileUrl, 
    file_type: fileType 
  }])
  
  if (dbError) throw new Error(dbError.message)
}

// 3. 孩子端拍照打卡（支持多张）
export async function completeHomework(formData: FormData) {
  const id = formData.get('id') as string
  const files = formData.getAll('file') as File[]

  const proofUrls: string[] = []

  for (const file of files) {
    if (file && file.size > 0) {
      const fileExt = file.name.split('.').pop() || 'png'
      const fileName = `proof-${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`

      const { error: uploadError } = await supabase.storage.from('attachments').upload(fileName, file)
      if (uploadError) throw new Error("打卡图片上传失败: " + uploadError.message)

      const { data: publicUrlData } = supabase.storage.from('attachments').getPublicUrl(fileName)
      proofUrls.push(publicUrlData.publicUrl)
    }
  }

  const proofValue = proofUrls.length > 0 ? JSON.stringify(proofUrls) : null

  // 更新数据库状态（同时记录打卡时间，供积分系统使用）
  const { error } = await supabase
    .from('homework')
    .update({ is_completed: true, proof_image: proofValue, completed_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw new Error(error.message)
}

// 4. 删除作业（支持单条和批量，并自动清理存储桶内的文件）
export async function deleteHomework(ids: string[]) {
  // 先查询这些作业是否有附件或打卡图片
  const { data: items } = await supabase
    .from('homework')
    .select('file_url, proof_image')
    .in('id', ids)

  if (items) {
    for (const item of items) {
      // 删掉布置作业时带的附件
      if (item.file_url) {
        const fileName = item.file_url.split('/').pop()
        if (fileName) await supabase.storage.from('attachments').remove([fileName])
      }
      // 删掉孩子打卡拍的照片（兼容单 URL 和 JSON 数组两种格式）
      if (item.proof_image) {
        let proofUrls: string[] = []
        try { proofUrls = JSON.parse(item.proof_image) } catch { proofUrls = [item.proof_image] }
        for (const url of proofUrls) {
          const proofName = url.split('/').pop()
          if (proofName) await supabase.storage.from('attachments').remove([proofName])
        }
      }
    }
  }

  // 彻底从数据库删除记录
  const { error } = await supabase
    .from('homework')
    .delete()
    .in('id', ids)
    
  if (error) throw new Error(error.message)
  return { success: true }
}
