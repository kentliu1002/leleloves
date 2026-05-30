import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const RETENTION_DAYS = 30

// 从一条 homework 行抽出全部该删的 Storage 文件名
function collectFileNames(row: any): string[] {
  const names: string[] = []
  if (row.file_url) {
    const n = String(row.file_url).split('/').pop()
    if (n) names.push(n)
  }
  if (row.file_urls) {
    try {
      const arr = JSON.parse(row.file_urls)
      if (Array.isArray(arr)) {
        for (const f of arr) {
          const u = typeof f === 'string' ? f : f?.url
          const n = u?.split('/').pop()
          if (n) names.push(n)
        }
      }
    } catch {}
  }
  if (row.proof_image) {
    let arr: string[] = []
    try { arr = JSON.parse(row.proof_image) }
    catch { arr = [row.proof_image] }
    for (const u of arr) {
      const n = u?.split('/').pop()
      if (n) names.push(n)
    }
  }
  return names
}

export async function GET(request: Request) {
  // 简单防护：Vercel cron 自动带 Authorization: Bearer <CRON_SECRET>
  // 如果设置了 CRON_SECRET 就校验，没设就放行（个人项目不强制）
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = request.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
  }

  try {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400_000).toISOString()

    // 1. 查出所有 cutoff 之前的作业记录
    const { data: rows, error } = await supabase
      .from('homework')
      .select('id, file_url, file_urls, proof_image, created_at')
      .lt('created_at', cutoff)
    if (error) throw error

    if (!rows || rows.length === 0) {
      return NextResponse.json({ deletedRows: 0, deletedFiles: 0, cutoff })
    }

    // 2. 收集所有要删的 Storage 文件名
    const fileNames: string[] = []
    rows.forEach(r => fileNames.push(...collectFileNames(r)))

    // 3. 批量删 Storage（Supabase 一次最多 1000，分批）
    let deletedFiles = 0
    for (let i = 0; i < fileNames.length; i += 1000) {
      const batch = fileNames.slice(i, i + 1000)
      const { data: removed, error: rmErr } = await supabase.storage
        .from('attachments').remove(batch)
      if (rmErr) console.error('[cleanup] remove err:', rmErr.message)
      else deletedFiles += removed?.length || 0
    }

    // 4. 删 DB 行
    const ids = rows.map(r => r.id)
    const { error: delErr } = await supabase.from('homework').delete().in('id', ids)
    if (delErr) throw delErr

    console.log(`[cleanup] retention=${RETENTION_DAYS}d, cutoff=${cutoff}, rows=${rows.length}, files=${deletedFiles}`)
    return NextResponse.json({
      deletedRows: rows.length,
      deletedFiles,
      cutoff,
      retentionDays: RETENTION_DAYS
    })
  } catch (e: any) {
    console.error('[cleanup] error:', e?.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
