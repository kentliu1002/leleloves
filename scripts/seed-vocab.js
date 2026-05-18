// 用 service_role_key 把 lib/vocab-seed.json 写入 vocabulary 表
// 运行：set -a && source .env.local && set +a && NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/seed-vocab.js
const { Client } = require('pg');
const path = require('path');
const fs = require('fs');

(async () => {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../lib/vocab-seed.json')));
  console.log('Seeding', data.length, 'words...');

  const c = new Client({ connectionString: process.env.POSTGRES_URL.replace(/"/g, '') });
  await c.connect();

  // 批量插入，遇到 (word, topic) 重复就跳过
  let inserted = 0;
  for (const w of data) {
    try {
      await c.query(
        'INSERT INTO vocabulary (word, ipa, meaning_zh, topic) VALUES ($1,$2,$3,$4) ON CONFLICT (word, topic) DO UPDATE SET ipa=EXCLUDED.ipa, meaning_zh=EXCLUDED.meaning_zh',
        [w.word, w.ipa, w.meaning_zh, w.topic]
      );
      inserted++;
    } catch (e) {
      console.error('Failed:', w.word, w.topic, e.message);
    }
  }
  console.log('Done. Inserted/updated:', inserted);
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
