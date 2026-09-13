import env from '@next/env'
import { createClient } from '@supabase/supabase-js'
import curriculum from '../lib/semester-vocab.json' with { type: 'json' }
env.loadEnvConfig(process.cwd())
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
for (const unit of curriculum.units) {
  const { data: module, error: modError } = await db.from('textbook_modules').upsert({
    book: curriculum.book, module_no: unit.unit, unit_label: `Unit ${unit.unit}`, sort_order: 20 + unit.unit
  }, { onConflict: 'book,module_no' }).select('id').single()
  if (modError) throw modError
  const { data: words, error } = await db.from('vocabulary').upsert(unit.words.map(w => ({
    word: w.word, meaning_zh: w.meaning_zh, topic: curriculum.topic, ipa: ''
  })), { onConflict: 'word,topic' }).select('id,word')
  if (error) throw error
  const { error: linkError } = await db.from('vocab_module_words').upsert(words.map(w => ({ module_id: module.id, word_id: w.id })), { onConflict: 'module_id,word_id' })
  if (linkError) throw linkError
  console.log(`Unit ${unit.unit}: ${words.length} words imported`)
}
