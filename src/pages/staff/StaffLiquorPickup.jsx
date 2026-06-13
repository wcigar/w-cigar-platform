import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { Wine, Printer } from 'lucide-react'
import SignaturePad from '../../components/SignaturePad'

const GOLD = '#c9a84c'
const inputStyle = { width: '100%', padding: '11px 13px', background: '#1a1714', border: '1px solid #2a2520', borderRadius: 8, color: '#e8dcc8', fontSize: 14, boxSizing: 'border-box', outline: 'none', fontFamily: 'Noto Serif TC,serif' }
const labelStyle = { fontSize: 12, color: '#8a8278', marginBottom: 6, display: 'block' }

function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }

// 開新視窗列印收據（隔離 app 版面）
function printReceipt(d, sigDataUrl) {
  const w = window.open('', '_blank', 'width=720,height=900')
  if (!w) { alert('請允許彈出視窗以列印'); return }
  const row = (k, v) => `<tr><td style="width:120px;color:#555;padding:7px 0;vertical-align:top;">${esc(k)}</td><td style="padding:7px 0;">${esc(v) || '—'}</td></tr>`
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>客戶存酒領取確認單</title>
  <style>body{font-family:"Noto Serif TC","Microsoft JhengHei",serif;color:#1a1a1a;margin:0;padding:40px 48px;}@media print{body{padding:24px;}}</style></head><body>
  <div style="text-align:center;border-bottom:2px solid #1a1a1a;padding-bottom:12px;margin-bottom:18px;">
    <div style="font-size:14px;letter-spacing:2px;color:#555;">W CIGAR BAR · 勝茄股份有限公司</div>
    <div style="font-size:22px;font-weight:700;margin-top:6px;">客戶存酒領取確認單</div>
  </div>
  <table style="width:100%;font-size:14px;border-collapse:collapse;">
    ${row('客戶姓名', d.customer_name)}${row('聯絡電話', d.phone)}${row('領取品項', d.items)}
    ${row('領取日期', d.pickup_date)}${row('領取方式', d.pickup_method === 'proxy' ? '委託他人代領' : '客戶本人')}
    ${d.pickup_method === 'proxy' ? row('代領人', d.proxy_name) : ''}${row('經手人員', d.handler_name)}${row('備註', d.note)}
  </table>
  <div style="margin-top:28px;border-top:1px dashed #999;padding-top:16px;font-size:13px;line-height:1.9;">
    本人確認已親自/委託領取上開存放之酒水，品項數量無誤，特此簽收。
    <div style="margin-top:14px;color:#555;">客戶簽名：</div>
    <div style="margin-top:6px;border:1px solid #ddd;border-radius:6px;display:inline-block;padding:6px;min-width:240px;min-height:90px;">
      ${sigDataUrl ? `<img src="${sigDataUrl}" style="height:90px;" />` : ''}
    </div>
    <div style="margin-top:14px;color:#555;">領取日期：中華民國 ____ 年 ____ 月 ____ 日</div>
  </div>
  <div style="margin-top:20px;font-size:10px;color:#999;text-align:center;">一式兩聯，公司存查聯歸檔。</div>
  </body></html>`)
  w.document.close()
  setTimeout(() => { w.focus(); w.print() }, 350)
}

export default function StaffLiquorPickup() {
  const { user } = useAuth()
  const [f, setF] = useState({ customer_name: '', phone: '', items: '', pickup_date: '', pickup_method: 'self', proxy_name: '', note: '' })
  const [sig, setSig] = useState(null)
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  async function saveAndPrint() {
    if (!f.customer_name || !f.items) return alert('客戶姓名與品項必填')
    setBusy(true)
    let sigPath = null
    try {
      if (sig) {
        const blob = await (await fetch(sig)).blob()
        const path = `liquor/${user.employee_id}_${Date.now()}.png`
        const up = await supabase.storage.from('staff-docs').upload(path, blob, { contentType: 'image/png' })
        if (!up.error) sigPath = path
      }
      const { data } = await supabase.rpc('liquor_pickup_create', {
        p_customer_name: f.customer_name, p_phone: f.phone, p_items: f.items, p_pickup_date: f.pickup_date || null,
        p_method: f.pickup_method, p_proxy_name: f.proxy_name, p_handler_id: user.employee_id, p_handler_name: user.name,
        p_signature_path: sigPath, p_note: f.note,
      })
      if (!data?.ok) { setBusy(false); return alert('儲存失敗：' + (data?.error || '')) }
      printReceipt({ ...f, handler_name: user.name }, sig)
    } catch (e) { alert('失敗：' + e.message) }
    setBusy(false)
  }

  return (
    <div style={{ padding: '0 20px 100px', maxWidth: 460, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', padding: '36px 0 16px' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 46, height: 46, borderRadius: 12, background: 'rgba(201,168,76,.1)', border: '1px solid rgba(201,168,76,.2)', marginBottom: 12 }}><Wine size={20} color={GOLD} /></div>
        <div style={{ fontFamily: 'Noto Serif TC,serif', fontSize: 22, fontWeight: 500, color: '#f0e8d8' }}>客戶存酒領取單</div>
        <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 11, fontStyle: 'italic', color: `${GOLD}77`, letterSpacing: 3, marginTop: 4 }}>LIQUOR PICKUP</div>
      </div>

      <div style={{ marginBottom: 12 }}><label style={labelStyle}>客戶姓名 *</label><input style={inputStyle} value={f.customer_name} onChange={e => set('customer_name', e.target.value)} /></div>
      <div style={{ marginBottom: 12 }}><label style={labelStyle}>聯絡電話</label><input style={inputStyle} value={f.phone} onChange={e => set('phone', e.target.value)} /></div>
      <div style={{ marginBottom: 12 }}><label style={labelStyle}>領取品項（品名・數量）*</label><textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} value={f.items} onChange={e => set('items', e.target.value)} placeholder="例：麥卡倫 18 年 1 瓶（剩約 1/2）" /></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        <div><label style={labelStyle}>領取日期</label><input type="date" style={inputStyle} value={f.pickup_date} onChange={e => set('pickup_date', e.target.value)} /></div>
        <div><label style={labelStyle}>領取方式</label>
          <select style={{ ...inputStyle, appearance: 'auto' }} value={f.pickup_method} onChange={e => set('pickup_method', e.target.value)}>
            <option value="self">客戶本人</option><option value="proxy">委託他人代領</option>
          </select>
        </div>
      </div>
      {f.pickup_method === 'proxy' && <div style={{ marginBottom: 12 }}><label style={labelStyle}>代領人姓名</label><input style={inputStyle} value={f.proxy_name} onChange={e => set('proxy_name', e.target.value)} /></div>}
      <div style={{ marginBottom: 12 }}><label style={labelStyle}>備註</label><input style={inputStyle} value={f.note} onChange={e => set('note', e.target.value)} /></div>
      <div style={{ marginBottom: 16 }}><label style={labelStyle}>客戶簽名</label><SignaturePad onChange={setSig} /></div>

      <button onClick={saveAndPrint} disabled={busy} style={{ width: '100%', padding: 15, borderRadius: 11, border: 'none', background: `linear-gradient(135deg,${GOLD},#a8863a)`, color: '#0f0d0a', fontSize: 15, fontWeight: 700, letterSpacing: 1, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
        <Printer size={15} style={{ verticalAlign: -2, marginRight: 6 }} />{busy ? '處理中…' : '儲存並列印領取單'}
      </button>
      <div style={{ fontSize: 11, color: '#6a655c', textAlign: 'center', padding: '12px 0', lineHeight: 1.7 }}>列印後請客戶簽收、公司存查聯歸檔。</div>
    </div>
  )
}
