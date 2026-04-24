// src/pages/admin/Onboarding.jsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, ChevronRight, UserPlus } from 'lucide-react'
import { listOnboardings, PERSON_TYPES, ONBOARDING_STATUSES } from '../../lib/services/onboarding'
import PageShell, { Card, EmptyState, Badge } from '../../components/PageShell'

export default function Onboarding() {
  const navigate = useNavigate()
  const [list, setList] = useState([])

  useEffect(() => { listOnboardings().then(setList).catch(() => {}) }, [])

  return (
    <PageShell
      title="新進人員後台"
      subtitle="STAFF ONBOARDING"
      actions={
        <button onClick={() => navigate('/admin/onboarding/new')}
          style={{ background: 'linear-gradient(135deg, #c9a84c 0%, #8b6d2f 100%)', color: '#0a0a0a', border: 'none', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Plus size={14} /> 新增
        </button>
      }
    >
      {list.length === 0 ? <EmptyState /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {list.map(p => {
            const s = ONBOARDING_STATUSES[p.status] || {}
            return (
              <Card key={p.id} style={{ cursor: 'pointer' }}>
                <div onClick={() => navigate(`/admin/onboarding/${p.id}`)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <UserPlus size={22} color="#c9a84c" />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ color: '#e8e0d0', fontSize: 14, fontWeight: 500 }}>{p.name}</span>
                      <Badge color={s.color}>{s.label}</Badge>
                    </div>
                    <div style={{ fontSize: 11, color: '#8a8278' }}>
                      {PERSON_TYPES[p.person_type]} · {p.phone || '—'} · 報到 {p.start_date || '—'}
                    </div>
                  </div>
                  <ChevronRight size={18} color="#5a554e" />
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </PageShell>
  )
}
