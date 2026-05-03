// src/pages/supervisor/SupervisorApp.jsx
// 督導子系統 root。獨立 session（WCB_SUPERVISOR），不共用員工 / 大使 auth。
//
// v1 (5/3 上線): /login + /home 真實實作
// v2 (5/4 上線): /visit/:venueId + /inventory/:venueId
// v3 (5/5 上線): /restock/:venueId + /payment/:venueId
import { Routes, Route, Navigate } from 'react-router-dom'
import SupervisorGuard from '../../components/SupervisorGuard'
import SupervisorLogin from './SupervisorLogin'
import SupervisorHome from './SupervisorHome'

// Phase 2 待加實作的頁面 — 暫時 placeholder 防白屏
function ComingSoonPage({ title, target }) {
  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#e8dcc8', padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontSize: 32, color: '#c9a84c', fontWeight: 700, marginBottom: 12 }}>W</div>
      <div style={{ fontSize: 18, color: '#c9a84c', letterSpacing: 2, marginBottom: 12 }}>{title}</div>
      <div style={{ fontSize: 13, color: '#8a8278', marginBottom: 20, textAlign: 'center', lineHeight: 1.6 }}>
        此頁面開發中<br />預計 {target} 上線
      </div>
      <a href="/supervisor/home" style={{
        padding: '10px 20px', background: 'transparent',
        border: '1px solid #c9a84c44', borderRadius: 8,
        color: '#c9a84c', fontSize: 12, textDecoration: 'none', letterSpacing: 1,
      }}>← 返回首頁</a>
    </div>
  )
}

export default function SupervisorApp() {
  return (
    <Routes>
      {/* 登入頁不包 Guard，但已登入要導走 */}
      <Route path="/login" element={
        <SupervisorGuard inverse><SupervisorLogin /></SupervisorGuard>
      } />

      {/* 首頁：我管的店清單 + 應收 */}
      <Route path="/home" element={
        <SupervisorGuard><SupervisorHome /></SupervisorGuard>
      } />

      {/* Phase 2 placeholder — 5/4 22:00 前換成真實實作 */}
      <Route path="/visit/:venueId" element={
        <SupervisorGuard><ComingSoonPage title="到店打卡" target="5/4 22:00" /></SupervisorGuard>
      } />
      <Route path="/inventory/:venueId" element={
        <SupervisorGuard><ComingSoonPage title="庫存盤點" target="5/4 22:00" /></SupervisorGuard>
      } />
      <Route path="/restock/:venueId" element={
        <SupervisorGuard><ComingSoonPage title="補貨記錄" target="5/5 22:00" /></SupervisorGuard>
      } />
      <Route path="/payment/:venueId" element={
        <SupervisorGuard><ComingSoonPage title="收款記錄" target="5/5 22:00" /></SupervisorGuard>
      } />

      {/* 根路徑導首頁；錯誤路徑也導首頁避免白屏 */}
      <Route path="/" element={<Navigate to="/supervisor/home" replace />} />
      <Route path="*" element={<Navigate to="/supervisor/home" replace />} />
    </Routes>
  )
}
// src/pages/supervisor/SupervisorApp.jsx
// 督導子系統 root。獨立 session（WCB_SUPERVISOR），不共用員工 / 大使 auth。
// v1 Login 頁先上線，Home/Visit/Inventory/Restock/Payment 後續加。
import { Routes, Route, Navigate } from 'react-router-dom'
import SupervisorGuard from '../../components/SupervisorGuard'
import SupervisorLogin from './SupervisorLogin'

// Placeholder for /home — will be replaced by real SupervisorHome
function SupervisorHomePlaceholder() {
  const session = (() => {
    try { return JSON.parse(localStorage.getItem('WCB_SUPERVISOR') || 'null') } catch { return null }
  })()
  function handleLogout() {
    try { localStorage.removeItem('WCB_SUPERVISOR') } catch {}
    window.location.href = '/supervisor/login'
  }
  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#e8dcc8', padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontSize: 36, color: '#c9a84c', fontWeight: 700, marginBottom: 12 }}>W</div>
      <div style={{ fontSize: 18, color: '#c9a84c', letterSpacing: 2, marginBottom: 8 }}>登入成功</div>
      <div style={{ fontSize: 14, color: '#e8dcc8', marginBottom: 4 }}>歡迎，{session?.name || '督導'}</div>
      <div style={{ fontSize: 12, color: '#8a8278', marginBottom: 24 }}>工號 {session?.login_code} · 角色 {session?.role}</div>
      <div style={{ fontSize: 12, color: '#5a554e', textAlign: 'center', marginBottom: 24, lineHeight: 1.6 }}>
        督導手機 App 正在建置中<br />
        Page 1 (Login) 已上線 · Page 2-6 開發中<br />
        上線目標：5/10 凌晨
      </div>
      <button onClick={handleLogout} style={{
        padding: '10px 20px', background: 'transparent',
        border: '1px solid #c9a84c44', borderRadius: 8,
        color: '#c9a84c', fontSize: 12, cursor: 'pointer', letterSpacing: 1,
      }}>登出</button>
    </div>
  )
}

export default function SupervisorApp() {
  return (
    <Routes>
      {/* 登入頁不包 Guard，但已登入要導走 */}
      <Route path="/login" element={
        <SupervisorGuard inverse><SupervisorLogin /></SupervisorGuard>
      } />

      {/* 受保護頁面 */}
      <Route path="/home" element={
        <SupervisorGuard><SupervisorHomePlaceholder /></SupervisorGuard>
      } />

      {/* 根路徑導首頁；錯誤路徑也導首頁避免白屏 */}
      <Route path="/" element={<Navigate to="/supervisor/home" replace />} />
      <Route path="*" element={<Navigate to="/supervisor/home" replace />} />
    </Routes>
  )
}
