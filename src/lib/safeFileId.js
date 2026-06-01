// Supabase Storage 不接受中文 key（硯這種中文 ID 會跳 Invalid key）→ 轉 ASCII
// ASCII safe → 直接用；含中文 / 特殊字元 → base64 encode 前 10 字
export function safeFileId(id) {
  if (!id) return 'u'
  if (/^[a-zA-Z0-9_-]+$/.test(id)) return id
  try { return 'u' + btoa(unescape(encodeURIComponent(id))).replace(/[+/=]/g, '').slice(0, 10) } catch { return 'u' }
}
