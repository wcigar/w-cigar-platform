import { useNavigate, useLocation } from 'react-router-dom'
import { Home, MapPin, BarChart3, LogOut } from 'lucide-react'

const NAV = [
  { path: '/ambassador', icon: Home, label: '首頁' },
  { path: '/ambassador/punch', icon: MapPin, label: '打卡' },
  { path: '/ambassador/sales', icon: BarChart3, label: '銷量' },
]

export default function AmbassadorLayout({ children, user, onLogout }) {
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#0a0a0a' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid #2a2520', background: 'rgba(17,17,17,.95)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: '#c9a84c' }}>W</span>
          <span style={{ fontSize: 12, color: '#8a8278', letterSpacing: 2 }}>雪茄大使</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, color: '#e8e0d0' }}>{user?.name}</span>
          <button onClick={onLogout} style={{ background: 'none', border: 'none', color: '#5a554e', padding: 6, cursor: 'pointer', display: 'flex' }}>
            <LogOut size={18} />
          </button>
        </div>
      </header>
      <main style={{ flex: 1, overflow: 'auto', padding: '0 0 80px' }}>{children}</main>
      <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, display: 'flex', justifyContent: 'space-around', padding: '10px 0 env(safe-area-inset-bottom, 10px)', borderTop: '1px solid #2a2520', background: 'rgba(17,17,17,.97)', zIndex: 10 }}>
        {NAV.map(item => {
          const active = location.pathname === item.path
          const Icon = item.icon
          return (
            <button key={item.path} onClick={() => navigate(item.path)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, background: 'none', border: 'none', color: active ? '#c9a84c' : '#5a554e', padding: '4px 12px', cursor: 'pointer', fontSize: 11, fontWeight: active ? 600 : 400 }}>
              <Icon size={22} />
              {item.label}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
