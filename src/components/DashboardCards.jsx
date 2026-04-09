import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { DollarSign, ShoppingCart, Package, AlertTriangle, Clock, TrendingUp, CreditCard } from 'lucide-react'

const fmt = n => (n || 0).toLocaleString()

export default function DashboardCards() {
  const [d, setD] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc('boss_unified_dashboard')
      if (data) setD(data)
      setLoading(false)
    })()
  }, [])

  if (loading) return <div style={{ padding: 20, color: '#8a8278', textAlign: 'center' }}>載入儀表板...</div>
  if (!d) return null

  const { today, this_month, pending, low_stock_top5, recent_orders, payment_breakdown } = d

  const cardStyle = { background: '#1a1714', border: '1px solid #2a2520', borderRadius: 10, padding: '14px 16px' }
  const labelStyle = { fontSize: 11, color: '#8a8278', marginBottom: 4 }
  const valStyle = { fontSize: 22, fontWeight: 700, color: '#c9a84c' }
  const subStyle = { fontSize: 11, color: '#5a554e', marginTop: 4 }
  const badge = count => count > 0 ? <span style={{ background: '#e74c3c', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 600, marginLeft: 6 }}>{count}</span> : null
  return (
    <div style={{ padding: '0 20px 20px' }}>
      {/* 今日銷售 */}
      <div style={{ fontSize: 14, fontWeight: 600, color: '#c9a84c', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
        <TrendingUp size={16} /> 今日銷售
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
        <div style={cardStyle}>
          <div style={labelStyle}>總銷售</div>
          <div style={valStyle}>${fmt(today.total_sales)}</div>
          <div style={subStyle}>{today.pos_txns + today.dealer_txns} 筆</div>
        </div>
        <div style={cardStyle}>
          <div style={labelStyle}>POS 收銀</div>
          <div style={{ ...valStyle, color: '#4caf50' }}>${fmt(today.pos_sales)}</div>
          <div style={subStyle}>{today.pos_txns} 筆</div>
        </div>
        <div style={cardStyle}>
          <div style={labelStyle}>經銷商</div>
          <div style={{ ...valStyle, color: '#2196f3' }}>${fmt(today.dealer_sales)}</div>
          <div style={subStyle}>{today.dealer_txns} 筆</div>
        </div>
      </div>

      {/* 待處理 */}
      <div style={{ fontSize: 14, fontWeight: 600, color: '#c9a84c', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Clock size={16} /> 待處理
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 20 }}>
        {[
          { label: 'POS訂單', val: pending.pos_orders, color: '#4caf50' },
          { label: '經銷商', val: pending.dealer_orders, color: '#2196f3' },
          { label: '低庫存', val: pending.low_stock, color: '#e74c3c' },
          { label: 'VIP欠款', val: pending.vip_receivable, color: '#ff9800' },
        ].map(item => (
          <div key={item.label} style={{ ...cardStyle, textAlign: 'center', borderColor: item.val > 0 ? item.color + '44' : '#2a2520' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: item.val > 0 ? item.color : '#5a554e' }}>{item.val}</div>
            <div style={{ fontSize: 11, color: '#8a8278', marginTop: 2 }}>{item.label}{badge(item.val)}</div>
          </div>
        ))}
      </div>

      {/* 本月累計 */}
      <div style={{ fontSize: 14, fontWeight: 600, color: '#c9a84c', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
        <CreditCard size={16} /> 本月累計
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
        <div style={cardStyle}>
          <div style={labelStyle}>月營收</div>
          <div style={valStyle}>${fmt(this_month.total_sales)}</div>
          <div style={subStyle}>{this_month.total_txns} 筆</div>
        </div>
        <div style={cardStyle}>
          <div style={labelStyle}>POS</div>
          <div style={{ ...valStyle, fontSize: 18, color: '#4caf50' }}>${fmt(this_month.pos_sales)}</div>
        </div>
        <div style={cardStyle}>
          <div style={labelStyle}>經銷商</div>
          <div style={{ ...valStyle, fontSize: 18, color: '#2196f3' }}>${fmt(this_month.dealer_sales)}</div>
        </div>
      </div>
      {/* 低庫存前5 */}
      {low_stock_top5 && low_stock_top5.length > 0 && (
        <>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#e74c3c', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertTriangle size={16} /> 低庫存警示 TOP 5
          </div>
          <div style={{ ...cardStyle, marginBottom: 20, padding: 0, overflow: 'hidden' }}>
            {low_stock_top5.map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: i < low_stock_top5.length - 1 ? '1px solid #2a2520' : 'none' }}>
                <div style={{ fontSize: 13 }}>
                  <span style={{ color: '#e8dcc8' }}>{item.name}</span>
                  {item.brand && <span style={{ color: '#5a554e', marginLeft: 6, fontSize: 11 }}>{item.brand}</span>}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>
                  <span style={{ color: '#e74c3c' }}>{item.current_stock}</span>
                  <span style={{ color: '#5a554e' }}> / {item.safe_stock}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* 最近訂單 */}
      {recent_orders && recent_orders.length > 0 && (
        <>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#c9a84c', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <ShoppingCart size={16} /> 最近訂單
          </div>
          <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
            {recent_orders.slice(0, 10).map((o, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: i < Math.min(recent_orders.length, 10) - 1 ? '1px solid #2a2520' : 'none' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#e8dcc8' }}>{o.buyer_name}</div>
                  <div style={{ fontSize: 11, color: '#5a554e', marginTop: 2 }}>{o.channel === 'pos' ? 'POS' : '經銷商'} · {new Date(o.created_at).toLocaleDateString('zh-TW')}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#c9a84c' }}>${fmt(o.order_total)}</div>
                  <div style={{ fontSize: 10, marginTop: 2, color: o.status === 'pending' ? '#ff9800' : '#4caf50', fontWeight: 600 }}>{o.status === 'pending' ? '待處理' : '已完成'}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
