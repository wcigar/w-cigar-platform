import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { compressImage } from '../../lib/imageUtils'
import { DollarSign, Camera, Send, History } from 'lucide-react'
import { format } from 'date-fns'

export default function StaffExpense() {
  const { user } = useAuth()
  const [categories, setCategories] = useState([])
  const [vendors, setVendors] = useState([])
  const [records, setRecords] = useState([])
  const [tab, setTab] = useState('new')
  const [form, setForm] = useState({ category: '', vendor: '', item: '', amount: '', payment: '現金', note: '' })
  const [photo, setPhoto] = useState(null)
  const [preview, setPreview] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  const fileRef = useRef(null)
  const today = format(new Date(), 'yyyy-MM-dd')
  const month = format(new Date(), 'yyyy-MM')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [cR, vR, rR] = await Promise.all([
      supabase.from('expense_categories').select('*').eq('enabled', true).order('sort_order'),
      supabase.from('expense_vendors').select('*').eq('enabled', true).order('name'),
      supabase.from('expenses').select('*').eq('submitted_by', user.employee_id).gte('date', month + '-01').order('date', { ascending: false }),
    ])
    setCategories(cR.data || [])
    setVendors(vR.data || [])
    setRecords(rR.data || [])
    setLoading(false)
  }

  async function handlePhoto(file) {
    if (!file) { setPhoto(null); setPreview(null); return }
    const compressed = await compressImage(file)
    setPhoto(compressed)
    const reader = new FileReader()
    reader.onload = e => setPreview(e.target.result)
    reader.readAsDataURL(compressed)
  }

  function selectVendor(v) {
    setForm(p => ({ ...p, vendor: v.name }))
    if (v.category && !form.category) setForm(p => ({ ...p, category: v.category }))
  }

  async function handleSubmit() {
    if (!form.category) return alert('請選擇分類')
    if (!form.amount || Number(form.amount) <= 0) return alert('請輸入金額')
    if (!photo) return alert('請拍照上傳收據')
    if (!confirm('確定提交 $' + Number(form.amount).toLocaleString() + ' 的支出？')) return

    setSubmitting(true)
    let photoUrl = ''
    if (photo) {
      const path = 'expenses/' + today + '/' + user.employee_id + '_' + Date.now() + '.jpg'
      const { error } = await supabase.storage.from('photos').upload(path, photo)
      if (!error) { const { data } = supabase.storage.from('photos').getPublicUrl(path); photoUrl = data.publicUrl }
    }

    await supabase.from('expenses').insert({
      date: today, category: form.category, vendor: form.vendor, item: form.item || form.category,
      amount: +form.amount, payment: form.payment, handler: user.name, submitted_by: user.employee_id,
      photo_url: photoUrl, note: form.note
    })

    setSubmitting(false)
    alert('支出已提交！')
    setForm({ category: '', vendor: '', item: '', amount: '', payment: '現金', note: '' })
    setPhoto(null); setPreview(null)
    load()
  }

  const myTotal = records.reduce((s, r) => s + (r.amount || 0), 0)

  if (loading) return <div className="page-container">{[1, 2, 3].map(i => <div key={i} className="loading-shimmer" style={{ height: 60, marginBottom: 8 }} />)}</div>

  return (
    <div className="page-container fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <DollarSign size={20} color="var(--gold)" />
        <span className="section-title" style={{ marginBottom: 0 }}>支出登記</span>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        <button onClick={() => setTab('new')} style={{ padding: '8px 16px', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: tab === 'new' ? 'var(--gold-glow)' : 'transparent', color: tab === 'new' ? 'var(--gold)' : 'var(--text-dim)', border: tab === 'new' ? '1px solid var(--border-gold)' : '1px solid var(--border)' }}>新增支出</button>
        <button onClick={() => setTab('history')} style={{ padding: '8px 16px', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, background: tab === 'history' ? 'var(--gold-glow)' : 'transparent', color: tab === 'history' ? 'var(--gold)' : 'var(--text-dim)', border: tab === 'history' ? '1px solid var(--border-gold)' : '1px solid var(--border)' }}><History size={13} /> 本月紀錄</button>
      </div>

      {tab === 'new' && (
        <div>
          {/* Category selection */}
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 6 }}>分類 *</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
            {categories.map(c => (
              <button key={c.id} onClick={() => setForm(p => ({ ...p, category: c.name }))} style={{
                padding: '8px 14px', borderRadius: 14, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: form.category === c.name ? 'var(--gold-glow)' : 'transparent',
                color: form.category === c.name ? 'var(--gold)' : 'var(--text-dim)',
                border: form.category === c.name ? '1px solid var(--border-gold)' : '1px solid var(--border)',
              }}>{c.icon} {c.name}</button>
            ))}
          </div>

          {/* Vendor selection */}
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 6 }}>廠商（選填）</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 14, maxHeight: 80, overflowY: 'auto' }}>
            {vendors.filter(v => !form.category || v.category === form.category || !v.category).map(v => (
              <button key={v.id} onClick={() => selectVendor(v)} style={{
                padding: '5px 10px', borderRadius: 12, fontSize: 11, cursor: 'pointer',
                background: form.vendor === v.name ? 'rgba(77,168,108,.1)' : 'transparent',
                color: form.vendor === v.name ? 'var(--green)' : 'var(--text-muted)',
                border: form.vendor === v.name ? '1px solid rgba(77,168,108,.3)' : '1px solid var(--border)',
              }}>{v.name}</button>
            ))}
            <input placeholder="或手動輸入廠商" value={vendors.some(v => v.name === form.vendor) ? '' : form.vendor} onChange={e => setForm(p => ({ ...p, vendor: e.target.value }))} style={{ flex: 1, minWidth: 120, fontSize: 11, padding: '5px 10px' }} />
          </div>

          {/* Item + Amount */}
          <input placeholder="品項說明（選填）" value={form.item} onChange={e => setForm(p => ({ ...p, item: e.target.value }))} style={{ marginBottom: 8, fontSize: 14, padding: 12 }} />

          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 18, color: 'var(--gold)', fontWeight: 700 }}>$</span>
              <input type="number" inputMode="numeric" placeholder="金額" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
                style={{ width: '100%', paddingLeft: 32, fontSize: 22, fontFamily: 'var(--font-mono)', fontWeight: 700, padding: '12px 12px 12px 32px' }} />
            </div>
            <select value={form.payment} onChange={e => setForm(p => ({ ...p, payment: e.target.value }))} style={{ width: 100, fontSize: 13, padding: 12 }}>
              <option>現金</option><option>刷卡</option><option>轉帳</option><option>LINE Pay</option>
            </select>
          </div>

          {/* Photo */}
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 6 }}>收據照片 *</div>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => handlePhoto(e.target.files?.[0])} />
          <button className="btn-outline" onClick={() => fileRef.current?.click()} style={{
            width: '100%', padding: 14, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 8,
            background: photo ? 'rgba(77,168,108,.06)' : undefined, borderColor: photo ? 'rgba(77,168,108,.3)' : undefined, color: photo ? 'var(--green)' : undefined
          }}>
            <Camera size={18} /> {photo ? '已拍照 (' + Math.round(photo.size / 1024) + 'KB) 點擊重拍' : '📷 拍照上傳收據（必須）'}
          </button>
          {preview && <img src={preview} alt="收據" style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 10, marginBottom: 10, border: '1px solid var(--border-gold)' }} />}

          <input placeholder="備註（選填）" value={form.note} onChange={e => setForm(p => ({ ...p, note: e.target.value }))} style={{ marginBottom: 14, fontSize: 13, padding: 10 }} />

          <button className="btn-gold" onClick={handleSubmit} disabled={submitting} style={{
            width: '100%', padding: 16, fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: submitting ? .5 : 1
          }}>
            <Send size={18} /> {submitting ? '提交中...' : '提交支出'}
          </button>
        </div>
      )}

      {tab === 'history' && (
        <div>
          <div className="card" style={{ padding: 12, marginBottom: 14, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>本月我的支出</div>
            <div style={{ fontSize: 24, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--red)' }}>${myTotal.toLocaleString()}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{records.length} 筆</div>
          </div>
          {records.length === 0 ? <div className="card" style={{ textAlign: 'center', padding: 30, color: 'var(--text-dim)' }}>本月無支出紀錄</div> :
            records.map(r => (
              <div key={r.id} className="card" style={{ padding: 12, marginBottom: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{r.item || r.category}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{r.date} · {r.category} · {r.vendor || '無廠商'} · {r.payment}</div>
                  </div>
                  <div style={{ fontSize: 16, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--red)' }}>-${(r.amount || 0).toLocaleString()}</div>
                </div>
                {r.photo_url && <img src={r.photo_url} alt="" style={{ width: '100%', maxHeight: 120, objectFit: 'cover', borderRadius: 8, marginTop: 6, border: '1px solid var(--border)' }} />}
                {r.note && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>📝 {r.note}</div>}
              </div>
            ))}
        </div>
      )}
    </div>
  )
}
