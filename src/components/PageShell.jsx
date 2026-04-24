// src/components/PageShell.jsx
// 共用黑金頁框 + 標題 + 空狀態占位
export default function PageShell({ title, subtitle, actions, children }) {
  return (
    <div style={{ padding: '18px 16px 24px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <div>
          {subtitle && <div style={{ fontSize: 10, color: '#8a8278', letterSpacing: 3, marginBottom: 4 }}>{subtitle}</div>}
          <h1 style={{ fontSize: 20, fontWeight: 600, color: '#e8e0d0', margin: 0, letterSpacing: 1 }}>{title}</h1>
        </div>
        {actions}
      </div>
      {children}
    </div>
  )
}

export function EmptyState({ label = '目前沒有資料' }) {
  return (
    <div style={{
      padding: '48px 16px', textAlign: 'center', color: '#6a655c', fontSize: 13,
      background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(201,168,76,0.2)', borderRadius: 10,
    }}>{label}</div>
  )
}

export function StubPage({ title, subtitle = 'Phase 2 開發中' }) {
  return (
    <PageShell title={title} subtitle="AMBASSADOR SUPPLY CHAIN">
      <EmptyState label={`【${title}】${subtitle}`} />
    </PageShell>
  )
}

export function Card({ children, style }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(201,168,76,0.15)',
      borderRadius: 12, padding: '14px 16px', ...style,
    }}>{children}</div>
  )
}

export function Badge({ children, color = '#c9a84c' }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 10, padding: '2px 8px', borderRadius: 4,
      color, border: `1px solid ${color}44`, background: `${color}11`,
      letterSpacing: 1, fontWeight: 500,
    }}>{children}</span>
  )
}
