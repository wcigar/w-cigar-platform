import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './lib/auth'
import Login from './components/Login'
import Layout from './components/Layout'
import StaffHome from './pages/staff/StaffHome'
import StaffSOP from './pages/staff/StaffSOP'
import StaffInventory from './pages/staff/StaffInventory'
import StaffKPI from './pages/staff/StaffKPI'
import StaffSchedule from './pages/staff/StaffSchedule'
import BossHome from './pages/boss/BossHome'
import BossOperations from './pages/boss/Operations'
import BossHR from './pages/boss/HRSchedule'
import BossPayroll from './pages/boss/Payroll'
import BossSettings from './pages/boss/Settings'

export default function App() {
  const { user, loading } = useAuth()

  if (loading) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a' }}>
      <div className="loading-shimmer" style={{ width: 120, height: 120, borderRadius: '50%' }} />
    </div>
  )

  if (!user) return <Login />

  const isBoss = user.role === 'boss' || user.role === 'admin'

  return (
    <Layout>
      <Routes>
        {isBoss ? (
          <>
            <Route path="/" element={<BossHome />} />
            <Route path="/operations" element={<BossOperations />} />
            <Route path="/hr" element={<BossHR />} />
            <Route path="/payroll" element={<BossPayroll />} />
            <Route path="/settings" element={<BossSettings />} />
            {/* Boss can also see staff views */}
            <Route path="/staff" element={<StaffHome />} />
            <Route path="/sop" element={<StaffSOP />} />
            <Route path="/inventory" element={<StaffInventory />} />
          </>
        ) : (
          <>
            <Route path="/" element={<StaffHome />} />
            <Route path="/sop" element={<StaffSOP />} />
            <Route path="/inventory" element={<StaffInventory />} />
            <Route path="/kpi" element={<StaffKPI />} />
            <Route path="/schedule" element={<StaffSchedule />} />
          </>
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}
