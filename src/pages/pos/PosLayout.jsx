/**
 * POS Layout — iPad 橫屏全螢幕 Layout
 * - 頂部列：Logo + 操作員 + 班次狀態 + 營收摘要 + 切換/登出
 * - 無底部 nav（POS 全螢幕操作）
 * - 操作員切換前防呆（購物車/班次檢查）
 */
import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { DollarSign, Package, LogOut, RefreshCw, Clock, User, ShoppingCart, Printer, Users } from 'lucide-react'
import { getStatus } from '../../utils/printer'

const NAV_ITEMS = [
  { path: '/pos-app', icon: ShoppingCart, label: '收銀' },
  { path: '/pos-app/inventory', icon: Package, label: '庫存' },
  { path: '/pos-app/customers', icon: Users, label: '客戶' },
  { path: '/pos-app/printer-settings', icon: Printer, label: '列印' },
]

export default function PosLayout({
  session, shift, summary, cartCount, heldCount,
  onLogout, onSwitchOperator, onShowHeld, onShowOrders,
  children
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const [printerOk, setPrinterOk] = useState(null)

  useEffect(() => {
    let t;
    const check = () => getStatus().then(d => setPrinterOk(d.printer === 'online')).catch(() => setPrinterOk(false));
    check(); t = setInterval(check, 30000);
    return () => clearInterval(t)
  }, [])

  const [showSwitchConfirm, setShowSwitchConfirm] = useState(false)

  function handleSwitchClick() {
    // 防呆：購物車有東西或班次開著
    if (cartCount > 0) {
      setShowSwitchConfirm(true)
      return
    }
    onSwitchOperator()
  }

  function confirmSwitch() {
    setShowSwitchConfirm(false)
    onSwitchOperator()
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#0d0b09', overflow: 'hidden' }}>
      {/* Top Bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '0 12px', height: 48, minHeight: 48,
        borderBottom: '1px solid #2a2520', flexShrink: 0,
        background: '#1a1714',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <DollarSign size={16} color="#c9a84c" />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#c9a84c', letterSpacing: 1 }}>
              W CIGAR BAR
            </span>
            <span style={{ fontSize: 10, color: '#6b5a3a', letterSpacing: 0.5 }}>
              {import.meta.env.VITE_STORE_NAME || '大安總店'}
            </span>
          </div>
        </div>

        {/* Nav tabs */}
        <div style={{ display: 'flex', gap: 2, marginLeft: 8 }}>
          {NAV_ITEMS.map(item => {
            const active = location.pathname === item.path ||
              (item.path !== '/pos-app' && location.pathname.startsWith(item.path))
            const Icon = item.icon
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '4px 10px', borderRadius: 6, fontSize: 11,
                  fontWeight: active ? 600 : 400, cursor: 'pointer',
                  background: active ? 'rgba(201,168,76,.12)' : 'transparent',
                  color: active ? '#c9a84c' : '#8a7e6e',
                  border: active ? '1px solid rgba(201,168,76,.2)' : '1px solid transparent',
                }}>
                <Icon size={13} />
                {item.label}
              </button>
            )
          })}
        </div>

        {/* Shift status */}
        {shift && (
          <span style={{
            fontSize: 9, background: 'rgba(77,168,108,.15)', color: '#4da86c',
            padding: '2px 8px', borderRadius: 10, fontWeight: 600,
          }}>
            營業中
          </span>
        )}

        {/* Held orders badge */}
        {heldCount > 0 && (
          <button onClick={onShowHeld} style={{
            fontSize: 10, background: 'rgba(245,158,11,.12)', color: '#f59e0b',
            padding: '3px 10px', borderRadius: 10, fontWeight: 600,
            border: '1px solid rgba(245,158,11,.2)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 4
          }}>
            ⏸ 掛單
            <span style={{
              background: '#e74c3c', color: '#fff', borderRadius: '50%',
              width: 16, height: 16, fontSize: 9, display: 'inline-flex',
              alignItems: 'center', justifyContent: 'center'
            }}>{heldCount}</span>
          </button>
        )}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Revenue summary */}
        <div style={{ display: 'flex', gap: 8, fontSize: 10, color: '#8a7e6e', alignItems: 'center' }}>
          <span>${(summary?.revenue?.total || 0).toLocaleString()}</span>
          <span>{summary?.orders || 0}單</span>
        </div>

        {/* Today orders */}
        <button onClick={onShowOrders} style={{
          background: 'none', border: '1px solid #2a2520', borderRadius: 6,
          padding: '3px 8px', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 3,
          color: '#8a7e6e', fontSize: 10
        }}>📋 訂單</button>

        {/* Operator */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '3px 10px', background: '#0d0b09',
          borderRadius: 8, border: '1px solid #2a2520',
        }}>
          <User size={12} color={session?.is_admin ? '#c9a84c' : '#8a7e6e'} />
          <span style={{ fontSize: 11, color: '#e8dcc8', fontWeight: 500 }}>{session?.name}</span>
          {session?.is_admin && <span style={{ fontSize: 8, color: '#c9a84c' }}>ADMIN</span>}
        </div>

        {/* Switch operator */}
        <button onClick={handleSwitchClick} title="切換操作員" style={{
          background: 'none', border: '1px solid #2a2520', borderRadius: 6,
          padding: '4px 8px', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 3,
          color: '#8a7e6e', fontSize: 10,
        }}>
          <RefreshCw size={11} /> 切換
        </button>

        {/* Logout */}
        <button onClick={onLogout} style={{
          background: 'none', border: 'none', color: '#5a554e',
          padding: 4, borderRadius: 6, cursor: 'pointer', display: 'flex',
        }}>
          <LogOut size={16} />
        </button>
      </div>

      {/* Main content */}
      <main style={{ flex: 1, overflow: 'hidden' }}>
        {children}
      </main>

      {/* Switch confirmation modal */}
      {showSwitchConfirm && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,.85)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setShowSwitchConfirm(false)}>
          <div style={{
            background: '#1a1714', border: '1px solid rgba(201,168,76,.3)',
            borderRadius: 16, padding: 24, width: '100%', maxWidth: 360,
            textAlign: 'center',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#f59e0b', marginBottom: 12 }}>
              ⚠️ 購物車未結帳
            </div>
            <div style={{ fontSize: 13, color: '#e8dcc8', marginBottom: 8 }}>
              目前購物車有 <strong style={{ color: '#c9a84c' }}>{cartCount}</strong> 件商品尚未結帳。
            </div>
            <div style={{ fontSize: 12, color: '#8a7e6e', marginBottom: 20 }}>
              切換操作員將清空購物車，確定要繼續嗎？
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowSwitchConfirm(false)} style={{
                flex: 1, padding: 12, borderRadius: 10,
                border: '1px solid #2a2520', background: '#0d0b09',
                color: '#8a7e6e', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}>取消</button>
              <button onClick={confirmSwitch} style={{
                flex: 1, padding: 12, borderRadius: 10,
                border: 'none', background: '#f59e0b', color: '#000',
                fontSize: 14, fontWeight: 700, cursor: 'pointer',
              }}>確認切換</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
