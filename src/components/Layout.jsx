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
  { path: '/settings', icon: Settings, label: '設定' },
]

export default function Layout({ children }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const isBoss = user?.role === 'boss'
  const nav = isBoss ? BOSS_NAV : STAFF_NAV

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#0a0a0a' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid #2a2520', background: 'rgba(17,17,17,.95)', flexShrink: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, color: '#c9a84c' }}>W</span>
          <span style={{ fontSize: 13, color: '#8a8278', letterSpacing: 2 }}>{isBoss ? '管理後台' : '員工系統'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: '#e8e0d0', fontWeight: 500 }}>{user?.name}</span>
          <button style={{ background: 'none', border: 'none', color: '#5a554e', padding: 6, borderRadius: 6, display: 'flex', cursor: 'pointer' }} onClick={logout}><LogOut size={16} /></button>
        </div>
      </header>

      <main style={{ flex: 1, overflow: 'auto' }}>{children}</main>

      <nav style={{ display: 'flex', justifyContent: 'space-around', padding: '8px 0', paddingBottom: 'max(8px, env(safe-area-inset-bottom))', borderTop: '1px solid #2a2520', background: 'rgba(17,17,17,.98)', flexShrink: 0 }}>
        {nav.map(item => {
          const active = location.pathname === item.path
          return (
            <button key={item.path} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '6px 10px', background: active ? 'rgba(201,168,76,.08)' : 'none', border: 'none', cursor: 'pointer', minWidth: 48, borderRadius: 8 }} onClick={() => navigate(item.path)}>
              <item.icon size={17} style={{ color: active ? '#c9a84c' : '#5a554e' }} />
              <span style={{ fontSize: 11, fontWeight: 500, color: active ? '#c9a84c' : '#5a554e' }}>{item.label}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
