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

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#0a0a0a' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid #2a2520', background: 'rgba(17,17,17,.95)', flexShrink: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, color: '#c9a84c' }}>W</span>
          <span style={{ fontSize: 13, color: '#8a8278', letterSpacing: 2 }}>{isBoss ? '管理後台' : '員工系統'}</span>
