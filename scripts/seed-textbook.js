// 把 lib/textbook-seed.json 装载到 textbook_modules + vocab_module_words
// 词若不在 vocabulary 表中，则新增（topic='外研教材'）
// 词若已存在（同 word 任何 topic 下都行），直接复用 id 建立 module-word 链接
const { Client } = require('pg');
const path = require('path');
const fs = require('fs');

(async () => {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../lib/textbook-seed.json')));
  const c = new Client({ connectionString: process.env.POSTGRES_URL.replace(/"/g, '') });
  await c.connect();

  const books = Object.keys(data);  // ['3上', '3下', ...]
  let moduleCount = 0, linkCount = 0, newWordCount = 0, reusedCount = 0;

  for (const book of books) {
    const sortOrderBase = books.indexOf(book) * 10;
    const modules = data[book];
    for (const moduleNo of Object.keys(modules)) {
      // upsert module
      const { rows: modRows } = await c.query(
        'INSERT INTO textbook_modules (book, module_no, sort_order) VALUES ($1,$2,$3) ON CONFLICT (book, module_no) DO UPDATE SET sort_order=EXCLUDED.sort_order RETURNING id',
        [book, parseInt(moduleNo), sortOrderBase + parseInt(moduleNo)]
      );
      const moduleId = modRows[0].id;
      moduleCount++;

      for (const w of modules[moduleNo]) {
        // 找已有词（任何 topic 都可，case-insensitive）
        const { rows: existing } = await c.query(
          'SELECT id FROM vocabulary WHERE lower(word) = lower($1) LIMIT 1',
          [w.word]
        );
        let wordId;
        if (existing.length > 0) {
          wordId = existing[0].id;
          reusedCount++;
        } else {
          // 不存在 → 新增到 vocabulary，topic='外研教材'
          const { rows: ins } = await c.query(
            'INSERT INTO vocabulary (word, ipa, meaning_zh, topic) VALUES ($1,$2,$3,$4) ON CONFLICT (word, topic) DO UPDATE SET ipa=EXCLUDED.ipa RETURNING id',
            [w.word, w.ipa, w.meaning, '外研教材']
          );
          wordId = ins[0].id;
          newWordCount++;
        }

        // 建立 module-word 链接
        await c.query(
          'INSERT INTO vocab_module_words (module_id, word_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
          [moduleId, wordId]
        );
        linkCount++;
      }
    }
  }

  console.log({ books: books.length, moduleCount, linkCount, reusedCount, newWordCount });
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
