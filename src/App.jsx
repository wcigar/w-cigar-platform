import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { seedTodayTasks } from './lib/seeder'
import ErrorBoundary from './components/ErrorBoundary'
import Login from './components/Login'
import Layout from './components/Layout'
import StaffHome from './pages/staff/StaffHome'
import StaffSOP from './pages/staff/StaffSOP'
import StaffSchedule from './pages/staff/StaffSchedule'
import StaffKPI from './pages/staff/StaffKPI'
import StaffRevenue from './pages/staff/StaffRevenue'
import StaffInventory from './pages/staff/StaffInventory'
import StaffExpense from './pages/staff/StaffExpense'
import StaffMeeting from './pages/staff/StaffMeeting'
import StaffPOS from './pages/staff/StaffPOS'
import BossHome from './pages/boss/BossHome'
import BossOperations from './pages/boss/Operations'
import BossHR from './pages/boss/HRSchedule'
import BossPayroll from './pages/boss/Payroll'
import BossSettings from './pages/boss/Settings'
import BossInventory from './pages/boss/BossInventory'
import Commission from './pages/boss/Commission'
import Customers from './pages/boss/Customers'
import DealerOrders from './pages/DealerOrders'
import AmbassadorApp from './pages/ambassador/AmbassadorApp'
import PosApp from './pages/pos/PosApp'
import VipCellar from './pages/VipCellar'
import JoinPage from './pages/join/JoinPage'
import MemberRegistrations from './pages/members/MemberRegistrations'
import MarketingPage from './pages/marketing/MarketingPage'
import QRCodePage from './pages/members/QRCodePage'
import CRMDashboard from './pages/crm/CRMDashboard'

function AppInner() {
  const { user, loading } = useAuth()

  useEffect(() => {
    if (user) seedTodayTasks().catch(console.error)
  }, [user])

  if (loading) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a' }}>
      <div className="loading-shimmer" style={{ width: 120, height: 120, borderRadius: '50%' }} />
    </div>
  )

  // Public pages (no auth required)
  if (window.location.pathname.startsWith('/join')) return (
    <Routes>
      <Route path="/join" element={<JoinPage />} />
    </Routes>
  )

  if (window.location.pathname.startsWith('/qrcode')) return (
    <Routes>
      <Route path="/qrcode" element={<QRCodePage />} />
    </Routes>
  )

  // VIP Cellar has its own auth
  if (window.location.pathname.startsWith('/vip-cellar')) return (
    <Routes>
      <Route path="/vip-cellar/*" element={<VipCellar />} />
    </Routes>
  )

  // POS App has its own auth (independent from employee system)
  if (window.location.pathname.startsWith('/pos-app')) return (
    <Routes>
      <Route path="/pos-app/*" element={<PosApp />} />
    </Routes>
  )

  // Ambassador system has its own auth
  if (window.location.pathname.startsWith('/ambassador')) return (
    <Routes>
      <Route path="/ambassador/*" element={<AmbassadorApp />} />
    </Routes>
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
          <Route path="/commission" element={<Commission />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/dealer-orders" element={<DealerOrders />} />
          <Route path="/pos" element={<StaffPOS />} />
          <Route path="/revenue" element={<StaffRevenue />} />
          <Route path="/settings" element={<BossSettings />} />
          <Route path="/members/registrations" element={<MemberRegistrations />} />
          <Route path="/marketing" element={<MarketingPage />} />
          <Route path="/crm" element={<CRMDashboard />} />
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
          <Route path="/meeting" element={<StaffMeeting />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      )}
    </Layout>
  )
}

export default function App() {
  return <ErrorBoundary><AppInner /></ErrorBoundary>
}
