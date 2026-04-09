import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { seedTodayTasks } from './lib/seeder'
import Login from './components/Login'
import Layout from './components/Layout'
import StaffHome from './pages/staff/StaffHome'
import StaffSOP from './pages/staff/StaffSOP'
import StaffSchedule from './pages/staff/StaffSchedule'
import StaffKPI from './pages/staff/StaffKPI'
import StaffRevenue from './pages/staff/StaffRevenue'
import StaffInventory from './pages/staff/StaffInventory'
import StaffExpense from './pages/staff/StaffExpense'
import StaffPOS from './pages/staff/StaffPOS'
import BossHome from './pages/boss/BossHome'
import BossOperations from './pages/boss/Operations'
import BossHR from './pages/boss/HRSchedule'
import BossPayroll from './pages/boss/Payroll'
import BossSettings from './pages/boss/Settings'
import BossInventory from './pages/boss/BossInventory'

export default function App() {
  const { user, loading } = useAuth()

  useEffect(() => {
    if (user) seedTodayTasks().catch(console.error)
  }, [user])

  if (loading) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a' }}>
      <div className="loading-shimmer" style={{ width: 120, height: 120, borderRadius: '50%' }} />
    </div>
  )

  if (!user) return <Login />

  const isBoss = user.role === 'boss'

  return (
    <Layout>
      {isBoss ? (
        <Routes>
          <Route path="/" element={<BossHome />} />
          <Route path="/operations" element={<BossOperations />} />
          <Route path="/hr" element={<BossHR />} />
          <Route path="/payroll" element={<BossPayroll />} />
          <Route path="/boss-inventory" element={<BossInventory />} />
          <Route path="/settings" element={<BossSettings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      ) : (
        <Routes>
          <Route path="/" element={<StaffHome />} />
          <Route path="/sop" element={<StaffSOP />} />
          <Route path="/inventory" element={<StaffInventory />} />
          <Route path="/schedule" element={<StaffSchedule />} />
          <Route path="/pos" element={<StaffPOS />} />
          <Route path="/revenue" element={<StaffRevenue />} />
          <Route path="/kpi" element={<StaffKPI />} />
          <Route path="/expense" element={<StaffExpense />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      )}
    </Layout>
  )
}
