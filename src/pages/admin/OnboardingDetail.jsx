// src/pages/admin/OnboardingDetail.jsx
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, FileText, ListChecks, UserCheck, Settings } from 'lucide-react'
import { getOnboarding, ONBOARDING_STATUSES, PERSON_TYPES } from '../../lib/services/onboarding'
import PageShell, { Card, Badge } from '../../components/PageShell'

export default function OnboardingDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)

  useEffect(() => { getOnboarding(id).then(setProfile).catch(() => {}) }, [id])

  if (!profile) return <PageShell title="載入中..."><div /></PageShell>
  const s = ONBOARDING_STATUSES[profile.status] || {}

  return (
    <PageShell
      title={profile.name}
      subtitle={`ONBOARDING · ${PERSON_TYPES[profile.person_type]}`}
      actions={<button onClick={() => navigate('/admin/onboarding')} style={backBtn()}><ArrowLeft size={14} /> 返回</button>}
    >
      <Card style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ color: '#e8e0d0', fontSize: 14 }}>{profile.phone} · {profile.email || '—'}</div>
            <div style={{ fontSize: 11, color: '#8a8278', marginTop: 4 }}>報到：{profile.start_date || '—'}</div>
          </div>
          <Badge color={s.color}>{s.label}</Badge>
        </div>
      </Card>

      <Section icon={<FileText size={14} />} title="文件清單" count={`${(profile.documents||[]).filter(d=>d.status==='verified').length}/${(profile.documents||[]).length}`}>
        {(profile.documents || []).map(d => (
          <Row key={d.id} left={d.document_type} right={<StatusPill status={d.status} />} />
        ))}
      </Section>

      <Section icon={<ListChecks size={14} />} title="任務" count={`${(profile.tasks||[]).filter(t=>t.status==='done').length}/${(profile.tasks||[]).length}`}>
        {(profile.tasks || []).map(t => (
          <Row key={t.id} left={t.title} right={<StatusPill status={t.status} />} />
        ))}
      </Section>

      <Section icon={<UserCheck size={14} />} title="系統帳號" count={(profile.provisioning||[]).length}>
        {(profile.provisioning || []).length === 0 ? (
          <div style={{ fontSize: 11, color: '#6a655c', padding: '8px 0' }}>尚未開通，完成文件與任務後再建立</div>
        ) : profile.provisioning.map(p => (
          <Row key={p.id} left={p.target_system} right={<StatusPill status={p.status} />} />
        ))}
      </Section>

      <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <button style={primaryBtn()}><Settings size={14} /> 設定薪資規則</button>
        <button style={primaryBtn('#10b981')} onClick={() => alert('MVP: activate (mock)')}><UserCheck size={14} /> 啟用並開通</button>
      </div>
    </PageShell>
  )
}

function Section({ icon, title, count, children }) {
  return (
    <Card style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, fontSize: 11, color: '#8a8278', letterSpacing: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{icon}{title}</div>
        {count !== undefined && <span style={{ color: '#c9a84c' }}>{count}</span>}
      </div>
      {children}
    </Card>
  )
}
function Row({ left, right }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #2a2520', fontSize: 13 }}>
      <span style={{ color: '#e8e0d0' }}>{left}</span>
      {right}
    </div>
  )
}
function StatusPill({ status }) {
  const map = {
    missing: ['#6b7280','缺'], uploaded: ['#3b82f6','已上傳'], verified: ['#10b981','已驗證'], rejected: ['#ef4444','駁回'],
    pending: ['#6b7280','待'], in_progress: ['#3b82f6','進行中'], done: ['#10b981','完成'], blocked: ['#ef4444','阻塞'],
    created: ['#3b82f6','建立'], active: ['#10b981','啟用'], disabled: ['#6b7280','停用'],
  }
  const [c, l] = map[status] || ['#6b7280', status]
  return <Badge color={c}>{l}</Badge>
}
function primaryBtn(color = '#c9a84c') {
  return { padding: '10px', borderRadius: 8, border: `1px solid ${color}66`, background: `${color}22`, color, cursor: 'pointer', fontSize: 13, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }
}
function backBtn() {
  return { background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.2)', color: '#c9a84c', padding: '6px 10px', borderRadius: 6, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }
}
