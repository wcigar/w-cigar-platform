// src/pages/admin/Exceptions.jsx
import { useEffect, useState } from 'react'
import { listExceptions, EXCEPTION_CATEGORIES } from '../../lib/services/exceptions'
import PageShell, { Card, EmptyState, Badge } from '../../components/PageShell'

export default function Exceptions() {
  const [list, setList] = useState([])
  useEffect(() => { listExceptions().then(setList).catch(() => {}) }, [])

  return (
    <PageShell title="異常中心" subtitle="EXCEPTION EVENTS">
      {list.length === 0 ? <EmptyState label="目前沒有未處理異常" /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {list.map(e => (
            <Card key={e.id} style={{
              borderLeft: `3px solid ${e.severity === 'critical' ? '#dc2626' : '#f59e0b'}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <Badge color={e.severity === 'critical' ? '#dc2626' : '#f59e0b'}>
                      {e.severity === 'critical' ? '緊急' : '關注'}
                    </Badge>
                    <span style={{ fontSize: 10, color: '#c9a84c' }}>
                      {EXCEPTION_CATEGORIES[e.category] || e.category}
                    </span>
                  </div>
                  <div style={{ color: '#e8e0d0', fontSize: 14 }}>{e.title}</div>
                  <div style={{ fontSize: 10, color: '#6a655c', marginTop: 4 }}>
                    {new Date(e.created_at).toLocaleString('zh-TW')}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </PageShell>
  )
}
