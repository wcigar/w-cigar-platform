/**
 * POS App — 獨立入口
 * - 獨立 auth（不依賴員工系統的 AuthProvider）
 * - Session 綁定班次，12hr 上限
 * - 操作員切換需重新 PIN 驗證
 * - Routes: /pos-app (checkout), /pos-app/inventory
 */
import { useState, useCallback } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import PosLogin from './PosLogin'
import PosLayout from './PosLayout'
import PosCheckout from './PosCheckout'
import PosInventory from './PosInventory'
import PrinterSettings from './PrinterSettings'

const SESSION_KEY = 'w_pos_session'
const SESSION_MAX_MS = 12 * 60 * 60 * 1000 // 12 hours

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const s = JSON.parse(raw)
    // Check expiry
    if (s.expires_at && Date.now() > s.expires_at) {
      localStorage.removeItem(SESSION_KEY)
      return null
    }
    return s
  } catch { return null }
}

export default function PosApp() {
  const [session, setSession] = useState(() => loadSession())
  const [shift, setShift] = useState(null)
  const [summary, setSummary] = useState(null)
  const [cartCount, setCartCount] = useState(0)
  const [heldCount, setHeldCount] = useState(0)
  const [showHeldFromLayout, setShowHeldFromLayout] = useState(false)
  const [showOrdersFromLayout, setShowOrdersFromLayout] = useState(false)

  function handleLogin(sessionData) {
    const s = {
      ...sessionData,
      expires_at: Date.now() + SESSION_MAX_MS,
    }
    setSession(s)
    localStorage.setItem(SESSION_KEY, JSON.stringify(s))
  }

  function handleLogout() {
    setSession(null)
    setCartCount(0)
    localStorage.removeItem(SESSION_KEY)
  }

  function handleSwitchOperator() {
    // Clear current session, force re-login (PIN)
    setSession(null)
    setCartCount(0)
    localStorage.removeItem(SESSION_KEY)
  }

  const handleShiftChange = useCallback((s) => {
    setShift(s)
    // Update session with shift binding
    if (s && session) {
      const updated = { ...session, shift_id: s.id }
      setSession(updated)
      localStorage.setItem(SESSION_KEY, JSON.stringify(updated))
    }
  }, [session])

  const handleCartCountChange = useCallback((count) => {
    setCartCount(count)
  }, [])

  // Not logged in → show PIN login
  if (!session) return <PosLogin onLogin={handleLogin} />

  return (
    <PosLayout
      session={session}
      shift={shift}
      summary={summary}
      cartCount={cartCount}
      heldCount={heldCount}
      onLogout={handleLogout}
      onSwitchOperator={handleSwitchOperator}
      onShowHeld={() => setShowHeldFromLayout(true)}
      onShowOrders={() => setShowOrdersFromLayout(true)}
    >
      <Routes>
        <Route path="/" element={
          <PosCheckout
            session={session}
            shift={shift}
            onShiftChange={handleShiftChange}
            onCartCountChange={handleCartCountChange}
            onHeldCountChange={(count) => setHeldCount(count)}
            showHeldFromLayout={showHeldFromLayout}
            onHeldFromLayoutDone={() => setShowHeldFromLayout(false)}
            showOrdersFromLayout={showOrdersFromLayout}
            onOrdersFromLayoutDone={() => setShowOrdersFromLayout(false)}
          />
        } />
        <Route path="/inventory" element={<PosInventory />} />
                  <Route path="/printer-settings" element={<PrinterSettings />} />
        <Route path="*" element={<Navigate to="/pos-app" replace />} />
      </Routes>
    </PosLayout>
  )
}
