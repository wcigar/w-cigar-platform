import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Package, RefreshCw, Truck, CheckCircle2, XCircle, Clock, X } from 'lucide-react'

const TABS = [
  { key: null, label: '全部' },
  { key: 'pending', label: '待處理' },
  { key: 'confirmed', label: '確認中' },
  { key: 'shipped', label: '已出貨' },
  { key: 'cancelled', label: '已取消' },
]

const STATUS_BADGE = {
  pending: { label: '待處理', bg: 'rgba(245,158,11,.15)', color: '#f59e0b', border: '#f59e0b' },
  confirmed: { label: '確認中', bg: 'rgba(77,140,196,.15)', color: '#4d8ac4', border: '#4d8ac4' },
  shipped: { label: '已出貨', bg: 'rgba(77,168,108,.15)', color: '#4da86c', border: '#4da86c' },
  completed: { label: '已完成', bg: 'rgba(77,168,108,.15)', color: '#4da86c', border: '#4da86c' },
  cancelled: { label: '已取消', bg: 'rgba(138,126,110,.15)', color: '#8a7e6e', border: '#8a7e6e' },
}

export default function DealerOrders() {
  const { user } = useAuth()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('pending')
  const [actionLoading, setActionLoading] = useState(null)
  const [shippingModal, setShippingModal] = useState(null)
  const [shippingNo, setShippingNo] = useState('')
  const [toast, setToast] = useState(null)

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const loadOrders = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('get_dealer_orders', { p_status: activeTab })
      if (error) throw error
      setOrders(data?.orders || data || [])
    } catch (e) {
      console.error('Load dealer orders:', e)
      // Fallback: direct query
      try {
        let q = supabase.from('dealer_orders').select('*').order('created_at', { ascending: false }).limit(100)
        if (activeTab) q = q.eq('status', activeTab)
        const { data } = await q
        setOrders(data || [])
      } catch {
        setOrders([])
      }
    } finally { setLoading(false) }
  }, [activeTab])

  useEffect(() => { loadOrders() }, [loadOrders])

  async function updateStatus(orderNo, newStatus, extraShippingNo) {
    setActionLoading(orderNo)
    try {
      const { data, error } = await supabase.rpc('update_dealer_order_status', {
        p_order_no: orderNo,
        p_status: newStatus,
        p_handled_by: user?.name || 'ADMIN',
        p_shipping_no: extraShippingNo || null,
      })
      if (error) throw error
      if (data && !data.success) throw new Error(data.error || '操作失敗')
      showToast(`訂單 ${orderNo} → ${STATUS_BADGE[newStatus]?.label || newStatus}`)
      loadOrders()
    } catch (e) {
      // Fallback: direct update
      try {
        const update = { status: newStatus, handled_by: user?.name || 'ADMIN', updated_at: new Date().toISOString() }
        if (extraShippingNo) update.shipping_no = extraShippingNo
        await supabase.from('dealer_orders').update(update).eq('order_no', orderNo)
        showToast(`訂單 ${orderNo} → ${STATUS_BADGE[newStatus]?.label || newStatus}`)
        loadOrders()
      } catch (e2) {
        showToast(e2.message || '操作失敗', 'error')
      }
    } finally { setActionLoading(null) }
  }

  function handleConfirm(orderNo) { updateStatus(orderNo, 'confirmed') }
  function handleShipOpen(orderNo) { setShippingModal(orderNo); setShippingNo('') }
  function handleShipConfirm() {
    if (!shippingModal) return
    updateStatus(shippingModal, 'shipped', shippingNo.trim() || null)
    setShippingModal(null)
  }
  function handleCancel(orderNo) {
    if (!confirm(`確定要取消訂單 ${orderNo}？`)) return
    updateStatus(orderNo, 'cancelled')
  }

  const fmt = n => `$${Number(n || 0).toLocaleString()}`

  return (
    <div style={{ padding: 20, color: '#e8dcc8', maxWidth: 960, margin: '0 auto' }}>
      {/* Toast */}
      {toast && <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 999, padding: '10px 18px', borderRadius: 10, background: toast.type === 'error' ? 'rgba(231,76,60,.9)' : 'rgba(77,168,108,.9)', color: '#fff', fontSize: 13, fontWeight: 600, boxShadow: '0 4px 20px rgba(0,0,0,.4)' }}>{toast.msg}</div>}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#c9a84c', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Package size={22} /> 經銷商訂單管理
        </div>
        <button onClick={loadOrders} disabled={loading} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #2a2520', background: '#1a1714', color: '#e8dcc8', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
          <RefreshCw size={14} className={loading ? 'spin' : ''} /> 重新整理
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t.key ?? 'all'} onClick={() => setActiveTab(t.key)}
            style={{ padding: '6px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', background: activeTab === t.key ? 'rgba(201,168,76,.15)' : '#1a1714', color: activeTab === t.key ? '#c9a84c' : '#8a7e6e', border: activeTab === t.key ? '1px solid rgba(201,168,76,.3)' : '1px solid #2a2520' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Orders */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#8a7e6e' }}>載入中…</div>
      ) : orders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#8a7e6e' }}>
          <Package size={40} style={{ marginBottom: 12, opacity: .3 }} />
          <div>沒有{activeTab ? STATUS_BADGE[activeTab]?.label : ''}訂單</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {orders.map(o => {
            const badge = STATUS_BADGE[o.status] || STATUS_BADGE.pending
            const isActioning = actionLoading === o.order_no
            return (
              <div key={o.id || o.order_no} style={{ background: '#1a1714', border: `1px solid ${badge.border}30`, borderRadius: 12, overflow: 'hidden' }}>
                {/* Header */}
                <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#e8dcc8', fontFamily: 'var(--font-mono)' }}>{o.order_no}</span>
                      <span style={{ fontSize: 10, fontWeight: 600, color: badge.color, background: badge.bg, border: `1px solid ${badge.border}`, borderRadius: 8, padding: '2px 8px' }}>{badge.label}</span>
                      {o.settle_currency === 'CNY' && <span style={{ fontSize: 10, background: 'rgba(231,76,60,.15)', color: '#e74c3c', borderRadius: 8, padding: '2px 6px' }}>CNY</span>}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#e8dcc8' }}>{o.dealer_name || o.buyer_name || '—'}</div>
                    <div style={{ fontSize: 11, color: '#8a7e6e', marginTop: 2 }}>
                      {o.contact_name && <span>{o.contact_name}</span>}
                      {o.contact_phone && <span> · {o.contact_phone}</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#c9a84c', fontFamily: 'var(--font-mono)' }}>{fmt(o.order_total)}</div>
                    <div style={{ fontSize: 10, color: '#8a7e6e', marginTop: 2 }}>{o.created_at ? new Date(o.created_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}</div>
                  </div>
                </div>

                {/* Details */}
                <div style={{ padding: '0 16px 12px', fontSize: 12 }}>
                  {/* Shipping */}
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 6 }}>
                    {o.shipping_method && <div style={{ color: '#8a7e6e' }}>配送：<span style={{ color: '#e8dcc8' }}>{o.shipping_method}</span></div>}
                    {o.shipping_address && <div style={{ color: '#8a7e6e' }}>地址：<span style={{ color: '#e8dcc8' }}>{o.shipping_address}</span></div>}
                  </div>
                  {o.shipping_no && <div style={{ color: '#4da86c', fontWeight: 600, marginBottom: 4 }}>🚚 物流單號：{o.shipping_no}</div>}
                  {o.cvs_store_name && <div style={{ color: '#8a7e6e', marginBottom: 4 }}>門市：{o.cvs_store_name}{o.cvs_store_id ? ` (${o.cvs_store_id})` : ''}</div>}

                  {/* Items */}
                  {o.items_text && (
                    <div style={{ background: '#0d0b09', borderRadius: 8, padding: '8px 10px', marginBottom: 6, fontSize: 11, color: '#8a7e6e', lineHeight: 1.6, maxHeight: 80, overflowY: 'auto' }}>
                      {o.items_text}
                    </div>
                  )}

                  {/* Notes */}
                  {o.notes && <div style={{ fontSize: 11, color: '#8a7e6e', marginBottom: 4 }}>備註：{o.notes}</div>}
                  {o.handled_by && <div style={{ fontSize: 10, color: '#8a7e6e' }}>處理人：{o.handled_by}</div>}

                  {/* Fee breakdown */}
                  <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 10, color: '#8a7e6e' }}>
                    {Number(o.item_subtotal) > 0 && <span>小計 {fmt(o.item_subtotal)}</span>}
                    {Number(o.shipping_fee) > 0 && <span>運費 {fmt(o.shipping_fee)}</span>}
                    {Number(o.invoice_fee) > 0 && <span>發票費 {fmt(o.invoice_fee)}</span>}
                  </div>
                </div>

                {/* Actions */}
                {(o.status === 'pending' || o.status === 'confirmed') && (
                  <div style={{ padding: '8px 16px', borderTop: '1px solid #2a2520', display: 'flex', gap: 8 }}>
                    {o.status === 'pending' && (
                      <button onClick={() => handleConfirm(o.order_no)} disabled={isActioning}
                        style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', background: '#4d8ac4', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: isActioning ? .5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                        <CheckCircle2 size={14} /> {isActioning ? '處理中…' : '確認接單'}
                      </button>
                    )}
                    {o.status === 'confirmed' && (
                      <button onClick={() => handleShipOpen(o.order_no)} disabled={isActioning}
                        style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', background: '#4da86c', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: isActioning ? .5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                        <Truck size={14} /> {isActioning ? '處理中…' : '標記已出貨'}
                      </button>
                    )}
                    <button onClick={() => handleCancel(o.order_no)} disabled={isActioning}
                      style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(231,76,60,.3)', background: 'transparent', color: '#e74c3c', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: isActioning ? .5 : 1 }}>
                      取消
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Shipping number modal */}
      {shippingModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,.8)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setShippingModal(null)}>
          <div style={{ background: '#1a1714', border: '1px solid rgba(201,168,76,.3)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#c9a84c' }}>標記已出貨</span>
              <button onClick={() => setShippingModal(null)} style={{ background: 'none', border: 'none', color: '#8a7e6e', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <div style={{ fontSize: 13, color: '#8a7e6e', marginBottom: 12 }}>訂單 {shippingModal}</div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, color: '#c9a84c', fontWeight: 600, display: 'block', marginBottom: 4 }}>物流追蹤號碼（選填）</label>
              <input value={shippingNo} onChange={e => setShippingNo(e.target.value)} placeholder="黑貓/全家/順豐追蹤號碼"
                style={{ width: '100%', fontSize: 14, padding: '10px 12px', background: '#0d0b09', border: '1px solid #2a2520', borderRadius: 8, color: '#e8dcc8', boxSizing: 'border-box' }}
                onKeyDown={e => { if (e.key === 'Enter') handleShipConfirm() }} autoFocus />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShippingModal(null)} style={{ flex: 1, padding: 12, borderRadius: 10, border: '1px solid #2a2520', background: '#0d0b09', color: '#8a7e6e', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>取消</button>
              <button onClick={handleShipConfirm} style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#4da86c', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>確認出貨</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
