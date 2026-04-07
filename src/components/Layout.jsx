import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { Home, ClipboardList, Package, BarChart3, Calendar, Settings, DollarSign, Users, LogOut, Briefcase } from 'lucide-react'

const STAFF_NAV = [
  { path: '/', icon: Home, label: '首頁' },
  { path: '/sop', icon: ClipboardList, label: 'SOP' },
  { path: '/inventory', icon: Package, label: '盤點' },
  { path: '/kpi', icon: BarChart3, label: 'KPI' },
  { path: '/schedule', icon: Calendar, label: '排班' },
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
  const isBoss = user?.role === 'boss' || user?.role === 'admin'
  const nav = isBoss ? BOSS_NAV : STAFF_NAV

  return (
    <div style={styles.wrapper}>
      {/* Top bar */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.headerLogo}>W</span>
          <span style={styles.headerTitle}>
            {isBoss ? '管理後台' : '員工系統'}
          </span>
        </div>
        <div style={styles.headerRight}>
          <span style={styles.userName}>{user?.name || user?.employee_id}</span>
          <button style={styles.logoutBtn} onClick={logout}>
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Content */}
      <main style={styles.main}>
        {children}
      </main>

      {/* Bottom nav */}
      <nav style={styles.bottomNav}>
        {nav.map(item => {
          const active = location.pathname === item.path
          const Icon = item.icon
          return (
            <button
              key={item.path}
              style={{ ...styles.navBtn, ...(active ? styles.navBtnActive : {}) }}
              onClick={() => navigate(item.path)}
            >
              <Icon size={20} style={{ color: active ? '#c9a84c' : '#5a554e' }} />
              <span style={{ ...styles.navLabel, color: active ? '#c9a84c' : '#5a554e' }}>
                {item.label}
              </span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}

const styles = {
  wrapper: {
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    background: '#0a0a0a',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 20px',
    borderBottom: '1px solid #2a2520',
    background: 'rgba(17,17,17,0.95)',
    backdropFilter: 'blur(10px)',
    flexShrink: 0,
    zIndex: 10,
  },
  headerLeft: {
    display: 'flex', alignItems: 'center', gap: 10,
  },
  headerLogo: {
    fontFamily: 'var(--font-display)',
    fontSize: 24,
    fontWeight: 700,
    color: '#c9a84c',
  },
  headerTitle: {
    fontSize: 13,
    color: '#8a8278',
    letterSpacing: 2,
  },
  headerRight: {
    display: 'flex', alignItems: 'center', gap: 12,
  },
  userName: {
    fontSize: 13, color: '#e8e0d0', fontWeight: 500,
  },
  logoutBtn: {
    background: 'none',
    border: 'none',
    color: '#5a554e',
    padding: 6,
    borderRadius: 6,
    display: 'flex',
    alignItems: 'center',
    cursor: 'pointer',
  },
  main: {
    flex: 1,
    overflow: 'hidden',
  },
  bottomNav: {
    display: 'flex',
    justifyContent: 'space-around',
    padding: '8px 0',
    paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
    borderTop: '1px solid #2a2520',
    background: 'rgba(17,17,17,0.98)',
    backdropFilter: 'blur(10px)',
    flexShrink: 0,
  },
  navBtn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
    padding: '6px 12px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    minWidth: 56,
    borderRadius: 8,
  },
  navBtnActive: {
    background: 'rgba(201,168,76,0.08)',
  },
  navLabel: {
    fontSize: 10,
    fontWeight: 500,
    letterSpacing: 0.5,
  },
}
