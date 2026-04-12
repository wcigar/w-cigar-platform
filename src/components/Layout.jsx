import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { Home, ClipboardList, BarChart3, Calendar, Settings, DollarSign, Users, LogOut, Briefcase, Package, ShoppingCart } from 'lucide-react'

const STAFF_NAV = [
  { path: '/', icon: Home, label: '首頁' },
  { path: '/sop', icon: ClipboardList, label: '任務' },
  { path: '/inventory', icon: Package, label: '盤點' },
  { path: '/schedule', icon: Calendar, label: '排班' },
  { path: '/expense', icon: DollarSign, label: '支出' },
  { path: '/pos', icon: ShoppingCart, label: '收銀' },
  { path: '/revenue', label: '營收', icon: DollarSign },
  { path: '/kpi', icon: BarChart3, label: 'KPI' },
]

const BOSS_NAV = [
  { path: '/', icon: Home, label: '總覽' },
  { path: '/operations', icon: Briefcase, label: '營運' },
  { path: '/hr', icon: Users, label: '人事' },
  { path: '/payroll', icon: DollarSign, label: '薪資' },
  { path: '/boss-inventory', icon: Package, label: '庫存' },
  { path: '/settings', icon: Settings, label: '設定' },
]

export default function Layout({ children }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const isBoss = user?.role === 'boss'
  const nav = isBoss ? BOSS_NAV : STAFF_NAV

  // POS uses its own fullscreen layout — skip header, nav, and bottom padding
  const isFullscreen = location.pathname === '/pos'

  if (isFullscreen) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#0a0a0a', overflow: 'hidden' }}>
        {children}
      </div>
    )
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#0a0a0a' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid #2a2520', background: 'rgba(17,17,17,.95)', flexShrink: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, color: '#c9a84c' }}>W</span>
          <span style={{ fontSize: 13, color: '#8a8278', letterSpacing: 2 }}>{isBoss ? '管理後台' : '員工系統'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: '#e8e0d0', fontWeight: 500 }}>{user?.name}</span>
          <button style={{ background: 'none', border: 'none', color: '#5a554e', padding: 6, borderRadius: 6, display: 'flex', cursor: 'pointer' }} onClick={logout}>
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <main style={{ flex: 1, overflow: 'auto', padding: '0 0 80px' }}>
        {children}
      </main>

      <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, display: 'flex', justifyContent: 'space-around', padding: '8px 0 env(safe-area-inset-bottom, 8px)', borderTop: '1px solid #2a2520', background: 'rgba(17,17,17,.97)', zIndex: 10 }}>
        {nav.map(item => {
          const active = location.pathname === item.path
          const Icon = item.icon
          return (
            <button key={item.path} onClick={() => navigate(item.path)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, background: 'none', border: 'none', color: active ? '#c9a84c' : '#5a554e', padding: '4px 8px', cursor: 'pointer', fontSize: 10, fontWeight: active ? 600 : 400, transition: 'color .2s' }}>
              <Icon size={20} />
              {item.label}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
