import { getAmbassadorSession, logoutAmbassador } from '../../lib/services/ambassadorAuth'
import { useNavigate } from 'react-router-dom'
import PageShell, { Card } from '../../components/PageShell'
import { LogOut } from 'lucide-react'

export default function AmbassadorProfile() {
  const navigate = useNavigate()
  const session = getAmbassadorSession()
  function handleLogout() {
    logoutAmbassador()
    navigate('/ambassador/login', { replace: true })
  }
  const row = (k, v) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #2a2520' }}>
      <span style={{ color: '#8a8278', fontSize: 13 }}>{k}</span>
      <span style={{ color: '#e8e0d0', fontSize: 13 }}>{v || '—'}</span>
    </div>
  )
  return (
    <PageShell title="個人資料" subtitle="AMBASSADOR PROFILE">
      <Card style={{ marginBottom: 16 }}>
        {row('姓名', session?.name)}
        {row('大使代碼', session?.ambassador_code)}
        {row('電話', session?.phone)}
        {row('預設場域', session?.default_venue_id ? `#${session.default_venue_id}` : '—')}
        {row('登入時間', session?.login_at ? new Date(session.login_at).toLocaleString('zh-TW') : '—')}
        {row('Session 到期', session?.expires_at ? new Date(session.expires_at).toLocaleString('zh-TW') : '—')}
      </Card>
      <button onClick={handleLogout} style={{
        width: '100%', padding: 14, borderRadius: 10,
        background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.4)',
        color: '#f87171', fontSize: 14, cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontWeight: 500,
      }}>
        <LogOut size={16} /> 登出
      </button>
    </PageShell>
  )
}
