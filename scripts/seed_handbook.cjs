// 把 Legacy Elite (Firebase) 20 章規章灌進 Supabase staff_handbook
// 來源：scripts/legacy-firestore.json（已備份的線上資料）
// 用法：node scripts/seed_handbook.cjs
const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

// --- 讀 .env 取 anon client（建表時尚未開 RLS，anon 可寫入）---
const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const url = get('VITE_SUPABASE_URL')
const key = get('VITE_SUPABASE_ANON_KEY')
if (!url || !key) { console.error('缺 VITE_SUPABASE_URL / ANON_KEY'); process.exit(1) }
const sb = createClient(url, key)

// --- 解析 Firestore REST JSON ---
const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'legacy-firestore.json'), 'utf8'))
const rows = (raw.documents || []).map((d) => {
  const f = d.field || d.fields
  const id = d.name.split('/').pop()
  const chapter_no = parseInt(id.split('-').pop(), 10)
  return {
    id,
    chapter_no,
    category: f.category.stringValue,
    title: f.title.stringValue,
    content: f.content.stringValue,
    enabled: true,
  }
}).sort((a, b) => a.chapter_no - b.chapter_no)

;(async () => {
  if (rows.length !== 20) console.warn('⚠️ 解析到', rows.length, '章（預期 20）')
  const { error } = await sb.from('staff_handbook').upsert(rows, { onConflict: 'id' })
  if (error) { console.error('❌ 寫入失敗：', error.message); process.exit(1) }
  const { count } = await sb.from('staff_handbook').select('*', { count: 'exact', head: true })
  console.log('✅ 已寫入', rows.length, '章；表中現有', count, '列')
  rows.forEach(r => console.log(`   ${r.id} [${r.category}] ${r.title} (${r.content.length} 字)`))
})()
