import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { compressImage } from '../../lib/imageUtils'
import { DollarSign, Camera, Send, History, Wallet, Pen, RotateCcw } from 'lucide-react'
import { format, endOfMonth } from 'date-fns'

function SignaturePad({ title, onSave, onCancel }) {
  const canvasRef = useRef(null)
  const [drawing, setDrawing] = useState(false)
  const [drawn, setDrawn] = useState(false)
  useEffect(() => {
    const c = canvasRef.current; if (!c) return
    const ctx = c.getContext('2d')
    const r = c.parentElement.getBoundingClientRect()
    c.width = r.width; c.height = 200
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
    ctx.strokeStyle = '#333'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  }, [])
  function gp(e) { const c = canvasRef.current, r = c.getBoundingClientRect(), t = e.touches ? e.touches[0] : e; return { x: t.clientX - r.left, y: t.clientY - r.top } }
  function sd(e) { e.preventDefault(); setDrawing(true); setDrawn(true); const ctx = canvasRef.current.getContext('2d'), p = gp(e); ctx.beginPath(); ctx.moveTo(p.x, p.y) }
  function dm(e) { if (!drawing) return; e.preventDefault(); const ctx = canvasRef.current.getContext('2d'), p = gp(e); ctx.lineTo(p.x, p.y); ctx.stroke() }
  function se(e) { if (e) e.preventDefault(); setDrawing(false) }
  function cl() { const c = canvasRef.current, ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.strokeStyle = '#333'; ctx.lineWidth = 3; setDrawn(false) }
  function sv() { if (!drawn) return alert('請先簽名'); onSave(canvasRef.current.toDataURL('image/png')) }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onCancel}>
      <div style={{ background: 'var(--black-card)', border: '1px solid var(--border-gold)', borderRadius: 20, padding: 20, width: '100%', maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--gold)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}><Pen size={18} /> {title || '老闆簽名確認'}</div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 12 }}>請老闆在下方簽名確認</div>
        <div style={{ borderRadius: 12, overflow: 'hidden', border: '2px solid var(--border-gold)', marginBottom: 12, touchAction: 'none' }}>
          <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: 200, cursor: 'crosshair' }}
            onMouseDown={sd} onMouseMove={dm} onMouseUp={se} onMouseLeave={se}
            onTouchStart={sd} onTouchMove={dm} onTouchEnd={se} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-outline" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }} onClick={cl}><RotateCcw size={14} /> 清除</button>
          <button className="btn-outline" style={{ flex: 1 }} onClick={onCancel}>取消</button>
          <button className="btn-gold" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }} onClick={sv}><Send size={14} /> 確認</button>
        </div>
      </div>
    </div>
  )
}

export default function StaffExpense() {
  const { user } = useAuth()
  const [categories, setCategories] = useState([])
  const [vendors, setVendors] = useState([])
  const [expenses, setExpenses] = useState([])
  const [cashRecords, setCashRecords] = useState([])
  const [tab, setTab] = useState('new')
  const [form, setForm] = useState({ category: '', vendor: '', item: '', amount: '', payment: '現金', note: '' })
  const [photo, setPhoto] = useState(null)
  const [noReceipt, setNoReceipt] = useState(false)
  const [noReceiptReason, setNoReceiptReason] = useState('')
  const [preview, setPreview] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  const fileRef = useRef(null)
  const today = format(new Date(), 'yyyy-MM-dd')
  const month = format(new Date(), 'yyyy-MM')
  const [showCashForm, setShowCashForm] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [newVendorName, setNewVendorName] = useState('')
  const [cashForm, setCashForm] = useState({ amount: '', method: '現金', given_by: 'Wilson', note: '' })
  const [showSign, setShowSign] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const s = month + '-01', e = format(endOfMonth(new Date(month + '-01')), 'yyyy-MM-dd')
    const [cR, vR, xR, pR] = await Promise.all([
      supabase.from('expense_categories').select('*').eq('enabled', true).order('sort_order'),
      supabase.from('expense_vendors').select('*').eq('enabled', true).order('name'),
      supabase.from('expenses').select('*').gte('date', s).lte('date', e).order('date', { ascending: false }),
      supabase.from('petty_cash').select('*').gte('date', s).lte('date', e).order('date', { ascending: false }),
    ])
    setCategories(cR.data || []); setVendors(vR.data || [])
    setExpenses(xR.data || []); setCashRecords(pR.data || [])
    setLoading(false)
  }

  const totalCashIn = cashRecords.reduce((s, r) => s + (r.amount || 0), 0)
  const totalSpent = expenses.reduce((s, r) => s + (r.amount || 0), 0)
  const balance = totalCashIn - totalSpent

  async function handlePhoto(file) {
    if (!file) { setPhoto(null); setPreview(null); return }
    const compressed = await compressImage(file)
    setPhoto(compressed)
    const reader = new FileReader()
    reader.onload = e => setPreview(e.target.result)
    reader.readAsDataURL(compressed)
  }

  async function handleSubmitExpense() {
    if (!form.category) return alert('請選擇分類')
    if (!form.amount || +form.amount <= 0) return alert('請輸入金額')
    if (!photo && !noReceipt) return alert('請拍照或勾選無收據')
    if (noReceipt && !noReceiptReason) return alert('無收據請選擇原因')
    if (!confirm('確定提交 $' + (+form.amount).toLocaleString() + ' 的支出？')) return
    setSubmitting(true)
    let photoUrl = ''
    if (photo) {
      const path = 'expenses/' + today + '/' + user.employee_id + '_' + Date.now() + '.jpg'
      const { error } = await supabase.storage.from('photos').upload(path, photo)
      if (!error) { const { data } = supabase.storage.from('photos').getPublicUrl(path); photoUrl = data.publicUrl }
    }
    await supabase.from('expenses').insert({ date: today, category: form.category, vendor: form.vendor, item: form.item || form.category, amount: +form.amount, payment: form.payment, handler: user.name, submitted_by: user.employee_id, photo_url: photoUrl, note: (noReceipt ? '[無收據:' + noReceiptReason + '] ' : '') + form.note })
    setSubmitting(false); alert('支出已提交！')
    setForm({ category: '', vendor: '', item: '', amount: '', payment: '現金', note: '' }); setPhoto(null); setPreview(null); setNoReceipt(false); setNoReceiptReason(''); load()
  }

  async function submitCashRequest(sigDataUrl) {
    if (!cashForm.amount || +cashForm.amount <= 0) return alert('請輸入金額')
    setSubmitting(true)
    let sigUrl = ''
    if (sigDataUrl && cashForm.method === '現金') {
      const blob = await (await fetch(sigDataUrl)).blob()
      const path = 'signatures/' + today + '/' + user.employee_id + '_' + Date.now() + '.png'
      const { error } = await supabase.storage.from('photos').upload(path, blob)
      if (!error) { const { data } = supabase.storage.from('photos').getPublicUrl(path); sigUrl = data.publicUrl }
    }
    await supabase.from('petty_cash').insert({ date: today, employee_id: 'SHARED', employee_name: '共用零用金', received_by: user.name, amount: +cashForm.amount, method: cashForm.method, given_by: cashForm.given_by, signature_url: sigUrl, note: cashForm.note })
    setSubmitting(false); setShowSign(false); setShowCashForm(false)
    alert('零用金 $' + (+cashForm.amount).toLocaleString() + ' 已收到！')
    setCashForm({ amount: '', method: '現金', given_by: 'Wilson', note: '' }); load()
  }

  function handleCashSubmit() {
    if (!cashForm.amount || +cashForm.amount <= 0) return alert('請輸入金額')
    if (cashForm.method === '現金') setShowSign(true)
    else { if (confirm('確認收到 $' + (+cashForm.amount).toLocaleString() + ' 匯款？')) submitCashRequest(null) }
  }

  if (loading) return <div className="page-container">{[1,2,3].map(i => <div key={i} className="loading-shimmer" style={{ height: 60, marginBottom: 8 }} />)}</div>

  return (
    <div className="page-container fade-in">
      {showSign && <SignaturePad title={'老闆簽名確認 — $' + (+cashForm.amount).toLocaleString()} onSave={sig => submitCashRequest(sig)} onCancel={() => setShowSign(false)} />}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <DollarSign size={20} color="var(--gold)" />
        <span className="section-title" style={{ marginBottom: 0 }}>支出管理</span>
      </div>

      <div className="card" style={{ padding: 14, marginBottom: 12, borderColor: 'var(--border-gold)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, textAlign: 'center' }}>
          <div><div style={{ fontSize: 9, color: 'var(--text-dim)' }}>零用金收入</div><div style={{ fontSize: 18, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--green)' }}>${totalCashIn.toLocaleString()}</div></div>
          <div><div style={{ fontSize: 9, color: 'var(--text-dim)' }}>全員支出</div><div style={{ fontSize: 18, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--red)' }}>${totalSpent.toLocaleString()}</div></div>
          <div><div style={{ fontSize: 9, color: 'var(--text-dim)' }}>餘額</div><div style={{ fontSize: 18, fontFamily: 'var(--font-mono)', fontWeight: 700, color: balance >= 0 ? 'var(--gold)' : 'var(--red)' }}>${balance.toLocaleString()}</div></div>
        </div>
      </div>

      <button onClick={() => setShowCashForm(!showCashForm)} style={{ width: '100%', marginBottom: 14, padding: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 16, fontWeight: 700, cursor: 'pointer', background: 'rgba(77,168,108,.08)', border: '1px solid rgba(77,168,108,.3)', borderRadius: 'var(--radius-sm)', color: 'var(--green)' }}>
        <Wallet size={20} /> 💰 申請零用金
      </button>

      {showCashForm && (
        <div className="card" style={{ padding: 16, marginBottom: 14, borderColor: 'rgba(77,168,108,.3)' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--green)', marginBottom: 12 }}>💰 申請零用金</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>金額</div>
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 20, color: 'var(--gold)', fontWeight: 700 }}>$</span>
            <input type="number" inputMode="numeric" placeholder="金額" value={cashForm.amount} onChange={e => setCashForm(p => ({ ...p, amount: e.target.value }))} style={{ width: '100%', paddingLeft: 34, fontSize: 24, fontFamily: 'var(--font-mono)', fontWeight: 700, padding: '12px 12px 12px 34px' }} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>方式</div>
              <div style={{ display: 'flex', gap: 4 }}>
                {['現金', '匯款'].map(m => (
                  <button key={m} onClick={() => setCashForm(p => ({ ...p, method: m }))} style={{ flex: 1, padding: 8, borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: cashForm.method === m ? (m === '現金' ? 'rgba(201,168,76,.12)' : 'rgba(77,138,196,.12)') : 'transparent', color: cashForm.method === m ? (m === '現金' ? 'var(--gold)' : 'var(--blue)') : 'var(--text-dim)', border: cashForm.method === m ? (m === '現金' ? '1px solid var(--border-gold)' : '1px solid rgba(77,138,196,.3)') : '1px solid var(--border)' }}>{m === '現金' ? '💵 現金' : '🏦 匯款'}</button>
                ))}
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>誰給的</div>
              <div style={{ display: 'flex', gap: 4 }}>
                {['Wilson', '珊珊'].map(g => (
                  <button key={g} onClick={() => setCashForm(p => ({ ...p, given_by: g }))} style={{ flex: 1, padding: 8, borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: cashForm.given_by === g ? 'var(--gold-glow)' : 'transparent', color: cashForm.given_by === g ? 'var(--gold)' : 'var(--text-dim)', border: cashForm.given_by === g ? '1px solid var(--border-gold)' : '1px solid var(--border)' }}>{g}</button>
                ))}
              </div>
            </div>
          </div>
          {cashForm.method === '現金' && <div style={{ fontSize: 11, color: '#f59e0b', marginBottom: 8, padding: '6px 10px', background: 'rgba(245,158,11,.06)', borderRadius: 8, border: '1px solid rgba(245,158,11,.2)' }}>⚠️ 現金需老闆在此畫面簽名確認</div>}
          <input placeholder="備註（選填）" value={cashForm.note} onChange={e => setCashForm(p => ({ ...p, note: e.target.value }))} style={{ marginBottom: 12, fontSize: 13, padding: 10 }} />
          <button className="btn-gold" onClick={handleCashSubmit} disabled={submitting} style={{ width: '100%', padding: 14, fontSize: 16, background: 'linear-gradient(135deg, #4da86c, #2d8a4e)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: submitting ? .5 : 1 }}>
            <Pen size={16} /> {cashForm.method === '現金' ? '請老闆簽名確認' : '確認收到匯款'}
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 4, marginBottom: 14, overflowX: 'auto' }}>
        {[['new','登記支出'],['history','支出紀錄'],['cash','零用金明細']].map(([v,l]) => (
          <button key={v} onClick={() => setTab(v)} style={{ padding: '7px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: tab === v ? 'var(--gold-glow)' : 'transparent', color: tab === v ? 'var(--gold)' : 'var(--text-dim)', border: tab === v ? '1px solid var(--border-gold)' : '1px solid var(--border)' }}>{l}</button>
        ))}
      </div>

      {tab === 'new' && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 6 }}>分類 *</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
            {categories.map(c => (
              <button key={c.id} onClick={() => setForm(p => ({ ...p, category: c.name }))} style={{ padding: '8px 14px', borderRadius: 14, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: form.category === c.name ? 'var(--gold-glow)' : 'transparent', color: form.category === c.name ? 'var(--gold)' : 'var(--text-dim)', border: form.category === c.name ? '1px solid var(--border-gold)' : '1px solid var(--border)' }}>{c.icon} {c.name}</button>
            ))}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 6 }}>廠商（選填）</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 14, maxHeight: 80, overflowY: 'auto' }}>
            {vendors.filter(v => !form.category || v.category === form.category || !v.category).map(v => (
              <button key={v.id} onClick={() => { setForm(p => ({ ...p, vendor: v.name })); if (v.category && !form.category) setForm(p => ({ ...p, category: v.category })) }} style={{ padding: '5px 10px', borderRadius: 12, fontSize: 11, cursor: 'pointer', background: form.vendor === v.name ? 'rgba(77,168,108,.1)' : 'transparent', color: form.vendor === v.name ? 'var(--green)' : 'var(--text-muted)', border: form.vendor === v.name ? '1px solid rgba(77,168,108,.3)' : '1px solid var(--border)' }}>{v.name}</button>
            ))}
            <input placeholder="或手動輸入" value={vendors.some(v => v.name === form.vendor) ? '' : form.vendor} onChange={e => setForm(p => ({ ...p, vendor: e.target.value }))} style={{ flex: 1, minWidth: 80, fontSize: 11, padding: '5px 10px' }} />
            {newVendorName === '' ? (
              <button onClick={() => setNewVendorName(' ')} style={{ padding: '5px 10px', borderRadius: 12, fontSize: 11, cursor: 'pointer', background: 'transparent', color: 'var(--green)', border: '1px dashed rgba(77,168,108,.4)', whiteSpace: 'nowrap' }}>+ 廠商</button>
            ) : (
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', width: '100%', marginTop: 6 }}>
                <input placeholder="廠商名稱" value={newVendorName.trim()} onChange={e => setNewVendorName(e.target.value)} style={{ flex: 1, fontSize: 12, padding: '6px 8px', minHeight: 32 }} />
                <button onClick={async () => { if (!newVendorName.trim()) return; await supabase.from('expense_vendors').insert({ name: newVendorName.trim(), category: form.category || '', enabled: true }); setNewVendorName(''); load() }} style={{ padding: '6px 10px', borderRadius: 10, fontSize: 11, fontWeight: 700, cursor: 'pointer', background: 'rgba(77,168,108,.12)', color: 'var(--green)', border: '1px solid rgba(77,168,108,.3)' }}>✓</button>
                <button onClick={() => setNewVendorName('')} style={{ padding: '6px 8px', borderRadius: 10, fontSize: 11, cursor: 'pointer', background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>✕</button>
              </div>
            )}
          </div>
          <input placeholder="品項說明（選填）" value={form.item} onChange={e => setForm(p => ({ ...p, item: e.target.value }))} style={{ marginBottom: 8, fontSize: 14, padding: 12 }} />
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <div style={{ flex: 1, position: 'relative' }}>
              
              <input type="number" inputMode="numeric" placeholder="金額" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} style={{ width: '100%', fontSize: 22, fontFamily: 'var(--font-mono)', fontWeight: 700, padding: '12px 14px' }} />
            </div>
            <select value={form.payment} onChange={e => setForm(p => ({ ...p, payment: e.target.value }))} style={{ width: 100, fontSize: 13, padding: 12 }}><option>現金</option><option>刷卡</option><option>轉帳</option><option>LINE Pay</option></select>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 6 }}>收據照片</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <input type="checkbox" checked={noReceipt} onChange={e => { setNoReceipt(e.target.checked); if (e.target.checked) { setPhoto(null); setPreview(null) } }} style={{ width: 22, height: 22, accentColor: '#f59e0b' }} />
            <span style={{ fontSize: 13, color: noReceipt ? '#f59e0b' : 'var(--text-dim)' }}>無收據</span>
            {noReceipt && (
              <select value={noReceiptReason} onChange={e => setNoReceiptReason(e.target.value)} style={{ flex: 1, fontSize: 13, padding: '6px 8px', minHeight: 36 }}>
                <option value="">請選擇原因</option>
                <option>小額零星消費</option>
                <option>廠商未提供</option>
                <option>線上轉帳</option>
                <option>代增收據</option>
                <option>其他</option>
              </select>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => handlePhoto(e.target.files?.[0])} />
          <button className="btn-outline" onClick={() => fileRef.current?.click()} style={{ width: '100%', padding: 14, display: noReceipt ? 'none' : 'flex', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 8, background: photo ? 'rgba(77,168,108,.06)' : undefined, borderColor: photo ? 'rgba(77,168,108,.3)' : undefined, color: photo ? 'var(--green)' : undefined }}>
            <Camera size={18} /> {photo ? '已拍照 (' + Math.round(photo.size / 1024) + 'KB) 點擊重拍' : '📷 拍照上傳收據（必須）'}
          </button>
          {preview && <img src={preview} alt="" style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 10, marginBottom: 10, border: '1px solid var(--border-gold)' }} />}
          <input placeholder="備註（選填）" value={form.note} onChange={e => setForm(p => ({ ...p, note: e.target.value }))} style={{ marginBottom: 14, fontSize: 13, padding: 10 }} />
          <button className="btn-gold" onClick={handleSubmitExpense} disabled={submitting} style={{ width: '100%', padding: 16, fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: submitting ? .5 : 1 }}>
            <Send size={18} /> {submitting ? '提交中...' : '提交支出'}
          </button>
        </div>
      )}

      {tab === 'history' && (
        <div>
          {expenses.length === 0 ? <div className="card" style={{ textAlign: 'center', padding: 30, color: 'var(--text-dim)' }}>本月無支出</div> :
            expenses.map(r => (
              <div key={r.id} className="card" style={{ padding: 12, marginBottom: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <div><div style={{ fontSize: 13, fontWeight: 600 }}>{r.item || r.category}</div><div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{r.date} · {r.category} · {r.vendor || '無廠商'} · <strong>{r.handler}</strong> · {r.payment}</div></div>
                  <div style={{ fontSize: 16, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--red)' }}>-${(r.amount || 0).toLocaleString()}</div>
                </div>
                {r.photo_url && <img src={r.photo_url} alt="" style={{ width: '100%', maxHeight: 120, objectFit: 'cover', borderRadius: 8, marginTop: 6, border: '1px solid var(--border)' }} onClick={() => window.open(r.photo_url)} />}
                {r.note && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>📝 {r.note}</div>}
              </div>
            ))}
        </div>
      )}

      {tab === 'cash' && (
        <div>
          {cashRecords.length === 0 && expenses.length === 0 ? <div className="card" style={{ textAlign: 'center', padding: 30, color: 'var(--text-dim)' }}>本月無零用金紀錄</div> : (
            <>
              {cashRecords.map(r => (
                <div key={'c' + r.id} className="card" style={{ padding: 12, marginBottom: 6, borderColor: 'rgba(77,168,108,.2)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <div><div style={{ fontSize: 13, fontWeight: 600, color: 'var(--green)' }}>💰 收到零用金</div><div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{r.date} · {r.given_by} · {r.method} · 經手：{r.received_by || r.employee_name}</div></div>
                    <span style={{ fontSize: 18, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--green)' }}>+${r.amount.toLocaleString()}</span>
                  </div>
                  {r.signature_url && <img src={r.signature_url} alt="" style={{ maxWidth: 160, height: 50, objectFit: 'contain', borderRadius: 6, border: '1px solid var(--border)', background: '#fff', marginTop: 4 }} />}
                </div>
              ))}
              {expenses.map(r => (
                <div key={'x' + r.id} className="card" style={{ padding: 12, marginBottom: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div><div style={{ fontSize: 13, fontWeight: 600 }}>🧀 {r.item || r.category}</div><div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{r.date} · <strong>{r.handler}</strong> · {r.category}</div></div>
                    <span style={{ fontSize: 16, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--red)' }}>-${(r.amount || 0).toLocaleString()}</span>
                  </div>
                </div>
              ))}
              <div className="card" style={{ padding: 12, marginTop: 8, borderColor: 'var(--border-gold)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--gold)' }}>💰 目前餘額</span>
                <span style={{ fontSize: 22, fontFamily: 'var(--font-mono)', fontWeight: 700, color: balance >= 0 ? 'var(--gold)' : 'var(--red)' }}>${balance.toLocaleString()}</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
