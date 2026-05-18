import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { ArrowLeft, Clock } from 'lucide-react'

export default function AdminPunch() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [emps, setEmps] = useState([])
  const [form, setForm] = useState({
    target_employee_id: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    punch_type: '上班',
    time: format(new Date(), 'HH:mm'),
    reason: '',
  })
  const [recent, setRecent] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    const [eRes, rRes] = await Promise.all([
      supabase.from('employees').select('id, name, role').eq('enabled', true).order('id'),
      supabase.from('punch_records').select('*').eq('manual_override', true).order('override_at', { ascending: false }).limit(20),
    ])
    setEmps((eRes.data || []).filter(e => e.id !== 'ADMIN'))
    setRecent(rRes.data || [])
  }

  async function submit() {
    if (!form.target_employee_id) { setMsg({ type: 'error', text: '請選擇員工' }); return }
    if (!form.reason.trim()) { setMsg({ type: 'error', text: '請填寫補打卡原因' }); return }
    setSubmitting(true)
    setMsg(null)
    // 組 datetime：日期 + 時間 + 台灣 +08:00
    const timeIso = `${form.date}T${form.time}:00+08:00`
    const { data, error } = await supabase.rpc('staff_admin_punch', {
      p_admin_employee_id: user.employee_id,
      p_target_employee_id: form.target_employee_id,
      p_date: form.date,
      p_punch_type: form.punch_type,
      p_time: timeIso,
      p_reason: form.reason.trim(),
    })
    setSubmitting(false)
    if (error) {
      setMsg({ type: 'error', text: '補打卡失敗：' + (error.message || JSON.stringify(error)) })
      return
    }
    setMsg({ type: 'success', text: `✅ 已為 ${data.employee_name} 補打 ${data.date} ${data.punch_type}卡（punch_id=${data.punch_id}）` })
    setForm({ ...form, reason: '' })
    load()
  }

  return (
    <div className="page-container fade-in">
      <button onClick={() => navigate(-1)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 12 }}>
        <ArrowLeft size={14} /> 返回
      </button>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--gold)', fontWeight: 600 }}>補打卡（老闆/會計專用）</h2>
      <p style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4, marginBottom: 16 }}>員工忘記打卡 → 由你代打。系統強制 manual_override=true + 記錄補打人與原因（完整稽核軌跡）</p>

<div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: 'var(--text-dim)' }}>員工</label>
          <select value={form.target_employee_id} onChange={e => setForm({ ...form, target_employee_id: e.target.value })} style={{ width: '100%', padding: 10, marginTop: 4, background: 'var(--black-card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 14 }}>
            <option value="">請選擇…</option>
            {emps.map(e => <option key={e.id} value={e.id}>{e.name}（{e.id}）</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, color: 'var(--text-dim)' }}>班次日期</label>
            <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} style={{ width: '100%', padding: 10, marginTop: 4, background: 'var(--black-card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 14 }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, color: 'var(--text-dim)' }}>打卡時間</label>
            <input type="time" value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} style={{ width: '100%', padding: 10, marginTop: 4, background: 'var(--black-card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 14 }} />
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: 'var(--text-dim)' }}>類型</label>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            {['上班', '下班'].map(t => (
              <button key={t} onClick={() => setForm({ ...form, punch_type: t })} style={{ flex: 1, padding: 10, background: form.punch_type === t ? 'rgba(201,168,76,.15)' : 'var(--black-card)', border: '1px solid ' + (form.punch_type === t ? 'var(--gold)' : 'var(--border)'), color: form.punch_type === t ? 'var(--gold)' : 'var(--text)', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 500 }}>{t}</button>
            ))}
          </div>
        </div>

<div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: 'var(--text-dim)' }}>原因（必填）</label>
          <input value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder="例：員工忘記打卡 / 系統敉隌 / 跨夜下班補登" style={{ width: '100%', padding: 10, marginTop: 4, background: 'var(--black-card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 14 }} />
        </div>

        {msg && (
          <div style={{ padding: 10, marginBottom: 12, borderRadius: 8, background: msg.type === 'success' ? 'rgba(100,170,100,.1)' : 'rgba(196,77,77,.1)', color: msg.type === 'success' ? 'var(--green)' : 'var(--red)', fontSize: 13 }}>
            {msg.text}
          </div>
        )}

        <button onClick={submit} disabled={submitting} style={{ width: '100%', padding: 12, background: 'var(--gold)', color: '#000', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? 0.6 : 1 }}>
          {submitting ? '送出中…' : '✏ ️ 確認補打卡'}
        </button>
      </div>

      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gold)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Clock size={14} /> 最近 20 筆補打卡記錄
      </div>
      {recent.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-dim)', textAlign: 'center', padding: 16 }}>暫無紀錄</div>}
      {recent.map(r => (
        <div key={r.id} className="card" style={{ padding: 10, marginBottom: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{r.name}</span>
              <span style={{ marginLeft: 8, fontSize: 11, padding: '2px 8px', borderRadius: 10, background: r.punch_type === '上班' ? 'rgba(201,168,76,.15)' : 'rgba(77,140,196,.15)', color: r.punch_type === '上班' ? 'var(--gold)' : 'var(--blue)' }}>{r.punch_type}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
              {r.date} {new Date(r.time).toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
          {r.override_reason && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>📝 {r.override_reason} · {r.override_by}</div>}
        </div>
      ))}
    </div>
  )
}
