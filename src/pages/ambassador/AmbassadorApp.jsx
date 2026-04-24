// src/pages/ambassador/AmbassadorApp.jsx
// 雪茄大使子系統 root。獨立 session（ambassador_session），不共用員工 auth。
// 取消打卡：移除 /ambassador/punch 路由與 bottom nav 入口。
import { Routes, Route, Navigate } from 'react-router-dom'
import AmbassadorGuard from '../../components/AmbassadorGuard'
import AmbassadorLayout from '../../components/AmbassadorLayout'
import AmbassadorLogin from './AmbassadorLogin'
import AmbassadorHome from './AmbassadorHome'
import AmbassadorPerformance from './AmbassadorPerformance'
import AmbassadorRanking from './AmbassadorRanking'
import AmbassadorProfile from './AmbassadorProfile'
import AmbassadorReceipts from './AmbassadorReceipts'
import AmbassadorReceiptDetail from './AmbassadorReceiptDetail'
import AmbassadorSupplies from './AmbassadorSupplies'
import AmbassadorSupplyNew from './AmbassadorSupplyNew'
import AmbassadorSupplyDetail from './AmbassadorSupplyDetail'
import AmbassadorSupplyReceipts from './AmbassadorSupplyReceipts'
import AmbassadorPayroll from './AmbassadorPayroll'

export default function AmbassadorApp() {
  return (
    <Routes>
      {/* 登入頁不包 Guard，但已登入要導走 */}
      <Route path="/login" element={
        <AmbassadorGuard inverse><AmbassadorLogin /></AmbassadorGuard>
      } />

      {/* 所有受保護頁面都包 AmbassadorGuard + AmbassadorLayout */}
      <Route path="/home" element={<ProtectedWithLayout><AmbassadorHome /></ProtectedWithLayout>} />
      <Route path="/performance" element={<ProtectedWithLayout><AmbassadorPerformance /></ProtectedWithLayout>} />
      <Route path="/ranking" element={<ProtectedWithLayout><AmbassadorRanking /></ProtectedWithLayout>} />
      <Route path="/profile" element={<ProtectedWithLayout><AmbassadorProfile /></ProtectedWithLayout>} />

      <Route path="/receipts" element={<ProtectedWithLayout><AmbassadorReceipts /></ProtectedWithLayout>} />
      <Route path="/receipts/:id" element={<ProtectedWithLayout><AmbassadorReceiptDetail /></ProtectedWithLayout>} />

      <Route path="/supplies" element={<ProtectedWithLayout><AmbassadorSupplies /></ProtectedWithLayout>} />
      <Route path="/supplies/new" element={<ProtectedWithLayout><AmbassadorSupplyNew /></ProtectedWithLayout>} />
      <Route path="/supplies/:id" element={<ProtectedWithLayout><AmbassadorSupplyDetail /></ProtectedWithLayout>} />
      <Route path="/supply-receipts" element={<ProtectedWithLayout><AmbassadorSupplyReceipts /></ProtectedWithLayout>} />

      {/* Phase 3: 大使自己的薪資單 */}
      <Route path="/payroll" element={<ProtectedWithLayout><AmbassadorPayroll /></ProtectedWithLayout>} />
      <Route path="/payroll/:periodId" element={<ProtectedWithLayout><AmbassadorPayroll /></ProtectedWithLayout>} />

      {/* 取消打卡：/ambassador/punch 與 /ambassador/attendance 不建立；
          舊連結進來一律導首頁，避免白屏 */}
      <Route path="/punch" element={<Navigate to="/ambassador/home" replace />} />
      <Route path="/attendance" element={<Navigate to="/ambassador/home" replace />} />

      {/* 根路徑導首頁 */}
      <Route path="/" element={<Navigate to="/ambassador/home" replace />} />
      <Route path="*" element={<Navigate to="/ambassador/home" replace />} />
    </Routes>
  )
}

function ProtectedWithLayout({ children }) {
  return (
    <AmbassadorGuard>
      <AmbassadorLayout>{children}</AmbassadorLayout>
    </AmbassadorGuard>
  )
}
