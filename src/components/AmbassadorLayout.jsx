// src/components/AmbassadorLayout.jsx
// 大使專用 layout：header + bottom nav（6 項，無打卡）
import { useNavigate, useLocation } from 'react-router-dom'
import { Home, TrendingUp, PackageCheck, ShoppingBag, Trophy, User, LogOut } from 'lucide-react'
import { getAmbassadorSession, logoutAmbassador } from '../lib/services/ambassadorAuth'

// 大使底部導航：首頁 / 業績 / 收貨 / 耗材 / 排行榜 / 我的
const NAV = [
  { path: '/ambassador/home',        icon: Home,          label: '首頁' },
  { path: '/ambassador/performance', icon: TrendingUp,    label: '業績' },
  { path: '/ambassador/receipts',    icon: PackageCheck,  label: '收貨' },
  { path: '/ambassador/supplies',    icon: ShoppingBag,   label: '耗材' },
  { path: '/ambassador/ranking',     icon: Trophy,        label: '排行' },
  { path: '/ambassador/profile',     icon: User,          label: '我的' },
]

export default function AmbassadorLayout({ children }) {
  const navigate = useNavigate()
  const location = useLocation()
  const session = getAmbassadorSession()

  function handleLogout() {
    logoutAmbassador()
    navigate('/ambassador/login', { replace: true })
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#0a0a0a' }}>
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px', borderBottom: '1px solid #2a2520',
        background: 'rgba(17,17,17,.95)', flexShrink: 0, position: 'sticky', top: 0, zIndex: 9,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: '#c9a84c' }}>W</span>
          <span style={{ fontSize: 12, color: '#8a8278', letterSpacing: 2 }}>雪茄大使</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, color: '#e8e0d0' }}>{session?.name || ''}</span>
          <button onClick={handleLogout} title="登出"
            style={{ background: 'none', border: 'none', color: '#5a554e', padding: 6, cursor: 'pointer', display: 'flex' }}>
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <main style={{ flex: 1, overflow: 'auto', padding: '0 0 72px', WebkitOverflowScrolling: 'touch' }}>
        {children}
      </main>

      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        display: 'flex', justifyContent: 'space-around',
        padding: '6px 0 env(safe-area-inset-bottom, 6px)',
        borderTop: '1px solid #2a2520', background: 'rgba(17,17,17,.97)', zIndex: 10,
      }}>
        {NAV.map(item => {
          const active = location.pathname === item.path || location.pathname.startsWith(item.path + '/')
          const Icon = item.icon
          return (
            <button key={item.path} onClick={() => navigate(item.path)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                background: 'none', border: 'none',
                color: active ? '#c9a84c' : '#5a554e',
                padding: '6px 4px', cursor: 'pointer', fontSize: 10,
                fontWeight: active ? 600 : 400, minWidth: 0, flex: 1,
              }}>
              <Icon size={20} />
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
