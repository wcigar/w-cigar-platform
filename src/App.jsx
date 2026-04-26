import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { seedTodayTasks } from './lib/seeder'
import ErrorBoundary from './components/ErrorBoundary'
import Login from './components/Login'
import Layout from './components/Layout'
import AdminGuard from './components/AdminGuard'
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

// ========== feat/ambassador-supply-chain ==========
import AdminVenueSales from './pages/admin/VenueSales'
import AdminVenueSalesNew from './pages/admin/VenueSalesNew'
import AdminVenues from './pages/admin/Venues'
import AdminInventoryMatrix from './pages/admin/InventoryMatrix'
import AdminInventoryBaseline from './pages/admin/InventoryBaseline'
import AdminReplenishmentPrint from './pages/admin/ReplenishmentPrint'
import AdminCollectionReceipt from './pages/admin/CollectionReceipt'
import AdminVenueHub from './pages/admin/VenueHub'
import AdminReplenishment from './pages/admin/Replenishment'
import AdminReplenishmentDetail from './pages/admin/ReplenishmentDetail'
import AdminSupplyRequests from './pages/admin/SupplyRequests'
import AdminSupplyRequestDetail from './pages/admin/SupplyRequestDetail'
import AdminCollections from './pages/admin/Collections'
import AdminExceptions from './pages/admin/Exceptions'
import WHPickLists from './pages/warehouse/PickLists'
import WHShipments from './pages/warehouse/Shipments'
import WHShipmentDetail from './pages/warehouse/ShipmentDetail'
import WHSupplyPickLists from './pages/warehouse/SupplyPickLists'
import WHSupplyShipments from './pages/warehouse/SupplyShipments'
import BossWarRoom from './pages/boss/WarRoom'
// --- Phase 3: payroll + onboarding ---
import AdminAmbassadorPayroll from './pages/admin/AmbassadorPayroll'
import AdminAmbassadorPayrollDetail from './pages/admin/AmbassadorPayrollDetail'
import AdminCompensationRules from './pages/admin/CompensationRules'
import AdminVenueProfitRules from './pages/admin/VenueProfitRules'
import AdminAccountingPayrollReports from './pages/admin/AccountingPayrollReports'
import AdminOnboarding from './pages/admin/Onboarding'
import AdminOnboardingNew from './pages/admin/OnboardingNew'
import AdminOnboardingDetail from './pages/admin/OnboardingDetail'
// ===================================================

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
  if (window.location.pathname.startsWith('/join')) return <JoinPage />
  if (window.location.pathname.startsWith('/qrcode')) return <QRCodePage />

  // VIP Cellar has its own auth
  if (window.location.pathname.startsWith('/vip-cellar')) return (
    <Routes>
      <Route path="/vip-cellar/*" element={<VipCellar />} />
    </Routes>
  )

  // POS App has its own auth (12h session, independent)
  if (window.location.pathname.startsWith('/pos-app')) return (
    <Routes>
      <Route path="/pos-app/*" element={<PosApp />} />
    </Routes>
  )

  // Ambassador subsystem — fully independent (ambassador_session)
  // 大使不共用員工 auth；AmbassadorApp 內部自帶 Guard
  if (window.location.pathname.startsWith('/ambassador')) return (
    <Routes>
      <Route path="/ambassador/*" element={<AmbassadorApp />} />
    </Routes>
  )

  if (!user) return <Login />

  const isBoss = user.role === 'boss'

  return (
    <Layout>
      <Routes>
        {/* --- 既有員工主平台路由 --- */}
        {isBoss ? (
          <>
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
          </>
        ) : (
          <>
            <Route path="/" element={<StaffHome />} />
            <Route path="/sop" element={<StaffSOP />} />
            <Route path="/inventory" element={<StaffInventory />} />
            <Route path="/schedule" element={<StaffSchedule />} />
            <Route path="/pos" element={<StaffPOS />} />
            <Route path="/revenue" element={<StaffRevenue />} />
            <Route path="/kpi" element={<StaffKPI />} />
            <Route path="/expense" element={<StaffExpense />} />
            <Route path="/meeting" element={<StaffMeeting />} />
          </>
        )}

        {/* --- feat/ambassador-supply-chain --- */}
        {/* HQ / Staff 後台（boss + staff 都可進；供應鏈業務） */}
        <Route path="/admin/venue-sales" element={<AdminGuard scope="admin"><AdminVenueSales /></AdminGuard>} />
        <Route path="/admin/venue-sales/new" element={<AdminGuard scope="admin"><AdminVenueSalesNew /></AdminGuard>} />
        <Route path="/admin/venues" element={<AdminGuard scope="admin"><AdminVenues /></AdminGuard>} />
        <Route path="/admin/inventory" element={<AdminGuard scope="admin"><AdminInventoryMatrix /></AdminGuard>} />
        <Route path="/admin/inventory/baseline" element={<AdminGuard scope="admin"><AdminInventoryBaseline /></AdminGuard>} />
        <Route path="/admin/replenishment/:id/print" element={<AdminGuard scope="admin"><AdminReplenishmentPrint /></AdminGuard>} />
        <Route path="/admin/venue-hub" element={<AdminGuard scope="admin"><AdminVenueHub /></AdminGuard>} />
        <Route path="/admin/collections/receipt/:venueId/:period" element={<AdminGuard scope="admin"><AdminCollectionReceipt /></AdminGuard>} />
        <Route path="/admin/replenishment" element={<AdminGuard scope="admin"><AdminReplenishment /></AdminGuard>} />
        <Route path="/admin/replenishment/:id" element={<AdminGuard scope="admin"><AdminReplenishmentDetail /></AdminGuard>} />
        <Route path="/admin/supply-requests" element={<AdminGuard scope="admin"><AdminSupplyRequests /></AdminGuard>} />
        <Route path="/admin/supply-requests/:id" element={<AdminGuard scope="admin"><AdminSupplyRequestDetail /></AdminGuard>} />
        <Route path="/admin/collections" element={<AdminGuard scope="supervisor"><AdminCollections /></AdminGuard>} />
        <Route path="/admin/exceptions" element={<AdminGuard scope="admin"><AdminExceptions /></AdminGuard>} />

        {/* Warehouse 總倉 */}
        <Route path="/warehouse/pick-lists" element={<AdminGuard scope="warehouse"><WHPickLists /></AdminGuard>} />
        <Route path="/warehouse/shipments" element={<AdminGuard scope="warehouse"><WHShipments /></AdminGuard>} />
        <Route path="/warehouse/shipments/:id" element={<AdminGuard scope="warehouse"><WHShipmentDetail /></AdminGuard>} />
        <Route path="/warehouse/supply-pick-lists" element={<AdminGuard scope="warehouse"><WHSupplyPickLists /></AdminGuard>} />
        <Route path="/warehouse/supply-shipments" element={<AdminGuard scope="warehouse"><WHSupplyShipments /></AdminGuard>} />

        {/* Boss 戰情室 */}
        <Route path="/boss/war-room" element={<AdminGuard scope="boss"><BossWarRoom /></AdminGuard>} />

        {/* Phase 3: 薪資 / 獎金 */}
        <Route path="/admin/ambassador-payroll" element={<AdminGuard scope="admin"><AdminAmbassadorPayroll /></AdminGuard>} />
        <Route path="/admin/ambassador-payroll/:periodId" element={<AdminGuard scope="admin"><AdminAmbassadorPayrollDetail /></AdminGuard>} />
        <Route path="/admin/ambassador-payroll/:periodId/:ambassadorId" element={<AdminGuard scope="admin"><AdminAmbassadorPayrollDetail /></AdminGuard>} />
        <Route path="/admin/compensation-rules" element={<AdminGuard scope="admin"><AdminCompensationRules /></AdminGuard>} />
        <Route path="/admin/compensation-rules/:ambassadorId" element={<AdminGuard scope="admin"><AdminCompensationRules /></AdminGuard>} />
        <Route path="/admin/venue-profit-rules" element={<AdminGuard scope="admin"><AdminVenueProfitRules /></AdminGuard>} />
        <Route path="/admin/accounting-payroll-reports" element={<AdminGuard scope="admin"><AdminAccountingPayrollReports /></AdminGuard>} />
        <Route path="/admin/accounting-payroll-reports/:reportId" element={<AdminGuard scope="admin"><AdminAccountingPayrollReports /></AdminGuard>} />

        {/* Phase 3: 新進人員 */}
        <Route path="/admin/onboarding" element={<AdminGuard scope="admin"><AdminOnboarding /></AdminGuard>} />
        <Route path="/admin/onboarding/new" element={<AdminGuard scope="admin"><AdminOnboardingNew /></AdminGuard>} />
        <Route path="/admin/onboarding/:id" element={<AdminGuard scope="admin"><AdminOnboardingDetail /></AdminGuard>} />
        <Route path="/admin/onboarding/:id/documents" element={<AdminGuard scope="admin"><AdminOnboardingDetail /></AdminGuard>} />
        <Route path="/admin/onboarding/:id/tasks" element={<AdminGuard scope="admin"><AdminOnboardingDetail /></AdminGuard>} />
        <Route path="/admin/onboarding/:id/provisioning" element={<AdminGuard scope="admin"><AdminOnboardingDetail /></AdminGuard>} />
        <Route path="/admin/onboarding/:id/compensation" element={<AdminGuard scope="admin"><AdminOnboardingDetail /></AdminGuard>} />

        {/* 兜底 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}

export default function App() {
  return <ErrorBoundary><AppInner /></ErrorBoundary>
}
