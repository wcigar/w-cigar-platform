// src/pages/admin/CompensationRules.jsx
import { useEffect, useState } from 'react'
import { listCompensationProfiles } from '../../lib/services/compensationRules'
import PageShell, { Card, EmptyState, Badge } from '../../components/PageShell'

const EMP_TYPE = {
  hourly: '時薪', commission_only: '純抽成', base_plus_commission: '底薪+抽成',
  contractor: '外包', custom: '自訂',
}

export default function CompensationRules() {
  const [list, setList] = useState([])
  useEffect(() => { listCompensationProfiles().then(setList).catch(() => {}) }, [])

  return (
    <PageShell title="大使薪資規則" subtitle="ADMIN · COMPENSATION RULES">
      {list.length === 0 ? <EmptyState /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {list.map(p => (
            <Card key={p.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div>
                  <div style={{ color: '#e8e0d0', fontSize: 14, fontWeight: 500 }}>{p.ambassador?.name}</div>
                  <div style={{ fontSize: 11, color: '#8a8278' }}>{p.profile_name} · 生效 {p.effective_from}</div>
                </div>
                <Badge color={p.status === 'active' ? '#10b981' : '#6b7280'}>{p.status}</Badge>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, fontSize: 11 }}>
                <Mini label="類型" value={EMP_TYPE[p.employment_type]} />
                <Mini label="底薪" value={`NT$ ${(p.base_salary||0).toLocaleString()}`} />
                <Mini label="時薪" value={`NT$ ${(p.hourly_rate||0).toLocaleString()}`} />
                <Mini label="預設抽成" value={`${(p.default_commission_rate*100).toFixed(1)}%`} color="#c9a84c" />
              </div>
            </Card>
          ))}
        </div>
      )}

      <div style={{ marginTop: 16, padding: 12, borderRadius: 8, background: 'rgba(201,168,76,0.04)', border: '1px solid rgba(201,168,76,0.15)', fontSize: 11, color: '#8a8278', lineHeight: 1.7 }}>
        <div style={{ color: '#c9a84c', marginBottom: 4 }}>規則版本政策</div>
        · 不可直接改歷史規則<br/>
        · 新規則只能新建版本（RPC upsert 會自動關掉舊版 effective_to）<br/>
        · 舊銷售保留當時的 compensation snapshot（sales_profit_snapshots）<br/>
        · 規則需要 boss 核准才能 active
      </div>
    </PageShell>
  )
}

function Mini({ label, value, color }) {
  return (
    <div>
      <div style={{ color: '#6a655c', fontSize: 10 }}>{label}</div>
      <div style={{ color: color || '#e8e0d0', fontSize: 12 }}>{value}</div>
    </div>
  )
}
