import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { useNavigate } from 'react-router-dom'
import { LogOut, Upload, CheckCircle2, ChevronLeft } from 'lucide-react'

const GOLD = '#c9a84c'
const inputStyle = { width: '100%', padding: '11px 13px', background: '#1a1714', border: '1px solid #2a2520', borderRadius: 8, color: '#e8dcc8', fontSize: 14, boxSizing: 'border-box', outline: 'none', fontFamily: 'Noto Serif TC,serif' }
const labelStyle = { fontSize: 12, color: '#8a8278', marginBottom: 6, display: 'block' }

function YesNo({ label, value, onChange }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={labelStyle}>{label}</label>
      <div style={{ display: 'flex', gap: 8 }}>
        {[['yes', '是，已完成'], ['no', '否，尚未']].map(([v, t]) => {
          const sel = (v === 'yes') === value && value !== null
          return (
            <button key={v} onClick={() => onChange(v === 'yes')}
              style={{ flex: 1, padding: '10px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontFamily: 'Noto Serif TC,serif',
                background: sel ? (v === 'yes' ? 'rgba(100,170,100,.15)' : 'rgba(214,140,70,.12)') : 'rgba(255,255,255,.02)',
                border: `1px solid ${sel ? (v === 'yes' ? '#7faa7f' : '#d68c46') : '#2a2520'}`,
                color: sel ? (v === 'yes' ? '#7faa7f' : '#d68c46') : '#cdc4b2' }}>{t}</button>
          )
        })}
      </div>
    </div>
  )
}

export default function StaffResign() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [existing, setExisting] = useState(null)
  const [form, setForm] = useState({ last_work_day: '', reason: '', key: null, uniform: null, handover: null })
  const [filePath, setFilePath] = useState('')
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    const { data } = await supabase.rpc('resignation_get', { p_employee_id: user.employee_id })
    setExisting(data)
  }
  useEffect(() => { if (user?.employee_id) load() }, [user?.employee_id])

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  async function uploadFile(file) {
    if (!file) return
    setBusy(true)
    const ext = (file.name.split('.').pop() || 'pdf').toLowerCase()
    const path = `${user.employee_id}/handover_${Date.now()}.${ext}`
    const up = await supabase.storage.from('staff-docs').upload(path, file, { contentType: file.type })
    setBusy(false)
    if (up.error) return alert('上傳失敗：' + up.error.message)
    setFilePath(path); setFileName(file.name)
  }

  async function submit() {
    if (!form.last_work_day) return alert('請填預定最後工作日')
    if (form.key === null || form.uniform === null || form.handover === null) return alert('請完成三項歸還／移交確認')
    setBusy(true)
    const { data, error } = await supabase.rpc('resignation_submit', {
      p_employee_id: user.employee_id, p_last_work_day: form.last_work_day, p_reason: form.reason,
      p_key: form.key, p_uniform: form.uniform, p_handover: form.handover, p_file_path: filePath,
    })
    setBusy(false)
    if (error) return alert('送出失敗：' + error.message)
    if (!data.ok) return alert('送出失敗')
    alert('離職交接單已送出，主管將進行審核。')
    load()
  }

  if (!existing) return <div style={{ padding: 24 }}><div className="loading-shimmer" style={{ height: 120, borderRadius: 14 }} /></div>

  // 已送出
  if (existing.exists && existing.status === 'submitted') {
    return (
      <div style={{ padding: '0 20px 100px', maxWidth: 460, margin: '0 auto' }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: '#8a8278', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: '20px 0 10px' }}><ChevronLeft size={16} />返回</button>
        <div style={{ textAlign: 'center', padding: '30px 0' }}>
          <CheckCircle2 size={48} color="#7faa7f" />
          <div style={{ fontFamily: 'Noto Serif TC,serif', fontSize: 18, color: '#f0e8d8', marginTop: 12 }}>離職交接單已送出</div>
          <div style={{ fontSize: 13, color: '#888078', marginTop: 6 }}>最後工作日 {existing.last_work_day}　·　待主管審核</div>
        </div>
        <div style={{ background: 'rgba(201,168,76,.05)', border: '1px solid rgba(201,168,76,.15)', borderRadius: 12, padding: 16, fontSize: 12.5, color: '#a89f90', lineHeight: 1.8 }}>
          鑰匙／磁扣歸還：{existing.key_returned ? '✅' : '❌'}<br />制服與設備歸還：{existing.uniform_returned ? '✅' : '❌'}<br />業務與客戶名單移交：{existing.handover_done ? '✅' : '❌'}<br />交接檔案：{existing.has_file ? '✅ 已上傳' : '—'}
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '0 20px 100px', maxWidth: 460, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', padding: '36px 0 16px' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 46, height: 46, borderRadius: 12, background: 'rgba(201,168,76,.1)', border: '1px solid rgba(201,168,76,.2)', marginBottom: 12 }}><LogOut size={20} color={GOLD} /></div>
        <div style={{ fontFamily: 'Noto Serif TC,serif', fontSize: 22, fontWeight: 500, color: '#f0e8d8' }}>離職申請與交接單</div>
        <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 11, fontStyle: 'italic', color: `${GOLD}77`, letterSpacing: 3, marginTop: 4 }}>RESIGNATION & HANDOVER</div>
      </div>

      <div style={{ background: 'rgba(201,168,76,.05)', border: '1px solid rgba(201,168,76,.15)', borderRadius: 10, padding: '11px 13px', marginBottom: 16, fontSize: 11.5, color: 'rgba(196,163,90,.8)', lineHeight: 1.7 }}>
        📋 依規章第九章離職預告期：未滿 3 個月免預告 · 3 個月~1 年 10 日前 · 1~3 年 20 日前 · 3 年以上 30 日前。
      </div>

      <div style={{ marginBottom: 14 }}><label style={labelStyle}>預定最後工作日 *</label><input type="date" style={inputStyle} value={form.last_work_day} onChange={e => set('last_work_day', e.target.value)} /></div>
      <div style={{ marginBottom: 14 }}><label style={labelStyle}>離職原因</label><textarea style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }} value={form.reason} onChange={e => set('reason', e.target.value)} /></div>

      <YesNo label="門禁鑰匙／磁扣是否已歸還？ *" value={form.key} onChange={v => set('key', v)} />
      <YesNo label="制服及配發設備是否已歸還？ *" value={form.uniform} onChange={v => set('uniform', v)} />
      <YesNo label="負責之業務與客戶名單是否已移交完畢？ *" value={form.handover} onChange={v => set('handover', v)} />

      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>交接清冊／業務檔案（Word 或 PDF，選填）</label>
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 13px', borderRadius: 9, background: 'rgba(201,168,76,.05)', border: `1px solid ${filePath ? 'rgba(100,170,100,.3)' : 'rgba(201,168,76,.18)'}`, cursor: 'pointer' }}>
          <span style={{ fontSize: 13, color: '#e8e0d0' }}><Upload size={14} color={GOLD} style={{ verticalAlign: -2, marginRight: 7 }} />{fileName || '選擇檔案'}</span>
          <input type="file" accept=".pdf,.doc,.docx,application/pdf" style={{ display: 'none' }} onChange={e => uploadFile(e.target.files[0])} />
          {filePath ? <span style={{ fontSize: 11, color: '#7faa7f' }}>✓ 已上傳</span> : <span style={{ fontSize: 11, color: GOLD }}>上傳</span>}
        </label>
      </div>

      <button onClick={submit} disabled={busy} style={{ width: '100%', padding: 15, borderRadius: 11, border: 'none', background: `linear-gradient(135deg,${GOLD},#a8863a)`, color: '#0f0d0a', fontSize: 15, fontWeight: 700, letterSpacing: 2, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>{busy ? '送出中…' : '送出離職交接單'}</button>
    </div>
  )
}
