// src/pages/admin/OnboardingNew.jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { createOnboarding, PERSON_TYPES } from '../../lib/services/onboarding'
import PageShell, { Card } from '../../components/PageShell'

export default function OnboardingNew() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    person_type: 'ambassador', name: '', phone: '', email: '', start_date: '',
    emergency_contact: '', emergency_phone: '', id_number_masked: '',
    assigned_role: '', assigned_venue_id: '',
  })
  const [submitting, setSubmitting] = useState(false)

  function set(k, v) { setForm({ ...form, [k]: v }) }

  async function submit() {
    if (!form.name || !form.phone) { alert('姓名與電話必填'); return }
    setSubmitting(true)
    try {
      const res = await createOnboarding({ ...form, assigned_role: form.person_type }, 'me')
      alert('已建立（MVP mock）')
      navigate(res.profile_id ? `/admin/onboarding/${res.profile_id}` : '/admin/onboarding')
    } catch (e) { alert('失敗：' + e.message) }
    setSubmitting(false)
  }

  return (
    <PageShell
      title="新增人員"
      subtitle="STAFF ONBOARDING · NEW"
      actions={<button onClick={() => navigate(-1)} style={backBtn()}><ArrowLeft size={14} /> 返回</button>}
    >
      <Card style={{ marginBottom: 12 }}>
        <Row label="人員類型">
          <select value={form.person_type} onChange={e => set('person_type', e.target.value)} style={input()}>
            {Object.entries(PERSON_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Row>
        <Row label="姓名 *"><input value={form.name} onChange={e => set('name', e.target.value)} style={input()} /></Row>
        <Row label="電話 *"><input value={form.phone} onChange={e => set('phone', e.target.value)} style={input()} /></Row>
        <Row label="Email"><input value={form.email} onChange={e => set('email', e.target.value)} style={input()} /></Row>
        <Row label="身分證末 4 碼"><input value={form.id_number_masked} onChange={e => set('id_number_masked', e.target.value)} maxLength={4} style={input()} /></Row>
        <Row label="緊急聯絡人"><input value={form.emergency_contact} onChange={e => set('emergency_contact', e.target.value)} style={input()} /></Row>
        <Row label="緊急電話"><input value={form.emergency_phone} onChange={e => set('emergency_phone', e.target.value)} style={input()} /></Row>
        <Row label="報到日期"><input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} style={input()} /></Row>
      </Card>

      <div style={{ padding: 12, borderRadius: 8, background: 'rgba(201,168,76,0.04)', border: '1px solid rgba(201,168,76,0.15)', fontSize: 11, color: '#8a8278', lineHeight: 1.7, marginBottom: 14 }}>
        <div style={{ color: '#c9a84c', marginBottom: 4 }}>建立後自動產生任務清單</div>
        · 收集文件 · 簽訂合約 · 建立系統帳號 · 分配角色權限 · 設定薪資規則 · 教育訓練
      </div>

      <button onClick={submit} disabled={submitting}
        style={{
          width: '100%', padding: 14, borderRadius: 10, border: 'none',
          background: 'linear-gradient(135deg, #c9a84c 0%, #8b6d2f 100%)',
          color: '#0a0a0a', fontSize: 15, fontWeight: 700, cursor: 'pointer', letterSpacing: 2,
          opacity: submitting ? 0.6 : 1,
        }}>
        {submitting ? '建立中...' : '建立 onboarding'}
      </button>
    </PageShell>
  )
}

function Row({ label, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: '#8a8278', marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  )
}
function input() {
  return { width: '100%', padding: '10px 12px', background: '#1a1714', border: '1px solid #2a2520', borderRadius: 8, color: '#e8dcc8', fontSize: 14, boxSizing: 'border-box', outline: 'none' }
}
function backBtn() {
  return { background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.2)', color: '#c9a84c', padding: '6px 10px', borderRadius: 6, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }
}
