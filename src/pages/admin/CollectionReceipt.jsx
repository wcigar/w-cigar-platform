// src/pages/admin/CollectionReceipt.jsx
// 督導結帳對帳單 — 列印 / LINE 分享 / 下載 PDF
// URL: /admin/collections/receipt/:venueId/:period
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Printer, Send, Download } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { listVenues } from '../../lib/services/venues'
import { getVenueSalesMatrixTemplate } from '../../lib/services/venueSales'
import { getMonthlyCollection } from '../../lib/services/collections'
import { getSupervisorById } from '../../lib/services/supervisors'

export default function CollectionReceipt() {
  const { venueId, period } = useParams()
  const navigate = useNavigate()
  const [venue, setVenue] = useState(null)
  const [products, setProducts] = useState([])
  const [collection, setCollection] = useState(null)
  const [inventoryMap, setInventoryMap] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const venues = await listVenues()
      const v = venues.find(x => x.id === venueId)
      setVenue(v)
      if (!v) { setLoading(false); return }
      const tpl = await getVenueSalesMatrixTemplate(v.region)
      const venueTpl = tpl.venues.find(x => x.id === venueId)
      const ps = venueTpl?.products || []
      setProducts(ps)

      // 累計當月 venue_sales_daily 的大使銷量（is_self_sale = false）
      const [py, pm] = period.split('-').map(Number)
      const startDate = `${py}-${String(pm).padStart(2, '0')}-01`
      const lastDay = new Date(py, pm, 0).getDate()
      const endDate = `${py}-${String(pm).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
      const { data: salesRows } = await supabase
        .from('venue_sales_daily')
        .select('items, is_self_sale')
        .eq('venue_id', venueId)
        .gte('sale_date', startDate)
        .lte('sale_date', endDate)
      // items 兼容兩種格式：array of {product_key, quantity} 或 object map {product_key: qty}
      const ambassadorMap = {}
      ;(salesRows || []).filter(r => !r.is_self_sale).forEach(row => {
        const items = row.items || []
        if (Array.isArray(items)) {
          items.forEach(item => {
            const key = item.product_key
            const qty = Number(item.quantity) || 0
            if (key && qty > 0) ambassadorMap[key] = (ambassadorMap[key] || 0) + qty
          })
        } else {
          Object.entries(items).forEach(([key, qty]) => {
            ambassadorMap[key] = (ambassadorMap[key] || 0) + Number(qty || 0)
          })
        }
      })

      const c = await getMonthlyCollection(period, venueId, ambassadorMap, !!v.has_self_sale)
      setCollection({ ...c, products: ps, venue_name: v.name, venue_region: v.region })

      // 系統庫存：用於「應剩 vs 實剩」推算自賣
      if (ps.length > 0) {
        const keys = ps.map(p => p.key)
        const { data } = await supabase
          .from('inventory_balances').select('product_key, current_qty')
          .eq('venue_id', venueId).in('product_key', keys)
        const map = {}
        ;(data || []).forEach(e => { map[e.product_key] = e.current_qty || 0 })
        setInventoryMap(map)
      }
      setLoading(false)
    })()
  }, [venueId, period])

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#8a8278' }}>載入中…</div>
  if (!venue) return <div style={{ padding: 40, textAlign: 'center', color: '#ef4444' }}>找不到店家</div>

  const supervisor = getSupervisorById(venue.supervisor_id)
  const today = new Date()
  const dateStr = `${today.getFullYear()}/${String(today.getMonth()+1).padStart(2,'0')}/${String(today.getDate()).padStart(2,'0')}`
  const ambDue = collection?.ambassador?.venue_share_due || 0
  const selfDue = collection?.self_sale?.venue_share_due || 0
  const total = ambDue + selfDue
  const paid = collection?.paid_amount || 0

  // LINE share URL — encode 簡單摘要
  const summary = `【W Cigar Bar 結帳單】\n${venue.name}（${period}）\n大使賣 NT$${Math.round(ambDue).toLocaleString()}\n${collection?.has_self_sale ? `店家自賣 NT$${Math.round(selfDue).toLocaleString()}\n` : ''}應付 NT$${Math.round(total).toLocaleString()}\n實付 NT$${Math.round(paid).toLocaleString()}\n督導 ${supervisor?.name || '?'}`
  const lineUrl = `https://line.me/R/msg/text/?${encodeURIComponent(summary)}`

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
        }
        .receipt {
          background: #fff; color: #000; padding: 28px 36px;
          max-width: 740px; margin: 0 auto;
          font-family: -apple-system, 'Helvetica Neue', sans-serif;
          border-radius: 8px;
        }
        .receipt h1 { margin: 0; font-size: 22px; font-weight: 600; }
        .receipt h2 { margin: 0 0 6px; font-size: 18px; font-weight: 500; }
        .receipt table { width: 100%; border-collapse: collapse; }
        .receipt th, .receipt td { padding: 8px 6px; text-align: left; border-bottom: 1px solid #ddd; font-size: 13px; }
        .receipt th { background: #f5f5f0; font-weight: 600; }
        .receipt td.center { text-align: center; }
        .receipt td.right { text-align: right; }
        .sig-img { background: #fafafa; border: 1px solid #ddd; border-radius: 4px; padding: 4px; max-width: 200px; max-height: 80px; }
      `}</style>

      <div className="no-print" style={{ background: '#0a0a0a', padding: '16px 20px', borderBottom: '1px solid #2a2520', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 10, gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => navigate('/admin/collections')}
          style={{ padding: '6px 12px', background: 'transparent', border: '1px solid #2a2520', borderRadius: 6, color: '#8a8278', fontSize: 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <ArrowLeft size={13} /> 返回督導結帳
        </button>
        <div style={{ color: '#c9a84c', fontSize: 14 }}>
          {venue.name} · {period} 對帳單
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <a href={lineUrl} target="_blank" rel="noopener noreferrer"
            style={{ padding: '8px 14px', background: '#06c755', border: 'none', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Send size={14} /> LINE 分享
          </a>
          <button onClick={() => window.print()}
            style={{ padding: '8px 14px', background: '#c9a84c', border: 'none', borderRadius: 6, color: '#0a0a0a', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Printer size={14} /> 列印 / 存 PDF
          </button>
        </div>
      </div>

      <div style={{ padding: '20px 16px', background: '#1a1714', minHeight: '100vh' }}>
        <div className="receipt">
          <div style={{ borderBottom: '2px solid #c9a84c', paddingBottom: 10, marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
              <h1>W Cigar Bar 月度結帳單</h1>
              <div style={{ marginTop: 4, fontSize: 11, color: '#666' }}>MONTHLY COLLECTION RECEIPT</div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 12 }}>
              <div style={{ color: '#999' }}>結帳期間</div>
              <div style={{ fontSize: 18, fontWeight: 500, color: '#c9a84c' }}>{period}</div>
              <div style={{ marginTop: 4, color: '#999', fontSize: 11 }}>結帳日 {dateStr}</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 11, color: '#999', marginBottom: 2 }}>店家</div>
              <h2>{venue.name}</h2>
              <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>地區：{regionLabel(venue.region)}{venue.address ? ` · ${venue.address}` : ''}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#999', marginBottom: 2 }}>負責督導</div>
              <h2>{supervisor?.name || '未指派'}</h2>
              <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>{supervisor?.region ? regionLabel(supervisor.region) : ''}</div>
            </div>
          </div>

          {/* 大使賣 section */}
          <div style={{ marginBottom: 14 }}>
            <h2 style={{ color: '#3b82f6', fontSize: 14, marginBottom: 6 }}>📊 大使賣（系統累計）</h2>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13 }}>
              <span>應付酒店</span>
              <span style={{ fontFamily: 'monospace', fontWeight: 500 }}>NT$ {Math.round(ambDue).toLocaleString()}</span>
            </div>
          </div>

          {/* 店家自賣 section（如有）*/}
          {collection?.has_self_sale && (
            <div style={{ marginBottom: 14 }}>
              <h2 style={{ color: '#f97316', fontSize: 14, marginBottom: 6 }}>🏪 店家自賣（盤點推算）</h2>
              <table>
                <thead>
                  <tr><th>商品</th><th className="center">系統剩</th><th className="center">實際剩</th><th className="center">自賣</th></tr>
                </thead>
                <tbody>
                  {Object.entries(collection.stocktake_qty_by_product || {}).filter(([_, v]) => v != null && v !== '').map(([pk, actual]) => {
                    const product = products.find(p => p.key === pk)
                    if (!product) return null
                    const should = inventoryMap[pk] ?? 0
                    const selfSale = Math.max(0, should - Number(actual))
                    return (
                      <tr key={pk}>
                        <td>{product.name}</td>
                        <td className="center">{should}</td>
                        <td className="center">{actual}</td>
                        <td className="center" style={{ color: '#f97316', fontWeight: 600 }}>{selfSale > 0 ? `+${selfSale}` : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 13 }}>
                <span>店家自賣應付酒店</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 500, color: '#f97316' }}>NT$ {Math.round(selfDue).toLocaleString()}</span>
              </div>
            </div>
          )}

          {/* 總計 */}
          <div style={{ marginTop: 16, padding: '12px 0', borderTop: '2px solid #c9a84c', borderBottom: '2px solid #c9a84c' }}>
            <table>
              <tbody>
                <tr style={{ fontSize: 14 }}>
                  <td style={{ padding: '6px 0', color: '#666' }}>應付總額</td>
                  <td className="right" style={{ padding: '6px 0', fontWeight: 600, color: '#c9a84c', fontFamily: 'monospace' }}>NT$ {Math.round(total).toLocaleString()}</td>
                </tr>
                <tr style={{ fontSize: 13 }}>
                  <td style={{ padding: '4px 0', color: '#666' }}>實付/實收</td>
                  <td className="right" style={{ padding: '4px 0', fontWeight: 500, fontFamily: 'monospace', color: '#10b981' }}>NT$ {Math.round(paid).toLocaleString()}</td>
                </tr>
                {total - paid > 0 && (
                  <tr style={{ fontSize: 13 }}>
                    <td style={{ padding: '4px 0', color: '#dc2626' }}>差額</td>
                    <td className="right" style={{ padding: '4px 0', fontWeight: 500, fontFamily: 'monospace', color: '#dc2626' }}>NT$ {Math.round(total - paid).toLocaleString()}</td>
                  </tr>
                )}
              </tbody>
            </table>
            {collection?.note && (
              <div style={{ marginTop: 8, padding: 8, background: '#fafafa', borderRadius: 4, fontSize: 11, color: '#666' }}>
                備註：{collection.note}
              </div>
            )}
          </div>

          {/* 簽名區 */}
          <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            <div>
              <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>督導簽名</div>
              {collection?.supervisor_signature ? (
                <img src={collection.supervisor_signature} alt="supervisor sig" className="sig-img" />
              ) : (
                <div style={{ height: 80, border: '1px dashed #ccc', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', fontSize: 11 }}>未簽名</div>
              )}
              <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>{supervisor?.name || '?'} · {dateStr}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>酒店會計簽名</div>
              {collection?.accountant_signature ? (
                <img src={collection.accountant_signature} alt="accountant sig" className="sig-img" />
              ) : (
                <div style={{ height: 80, border: '1px dashed #ccc', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', fontSize: 11 }}>未簽名</div>
              )}
              <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>{collection?.accountant_name || '?'} · {dateStr}</div>
            </div>
          </div>

          <div style={{ marginTop: 20, paddingTop: 10, borderTop: '1px dashed #ccc', fontSize: 10, color: '#999', textAlign: 'center' }}>
            W Cigar Bar 雪茄王子 · 系統自動生成 · {new Date().toISOString().slice(0, 19).replace('T', ' ')}
          </div>
        </div>
      </div>
    </>
  )
}

function regionLabel(r) {
  const map = { taipei: '台北', taoyuan: '桃園', hsinchu: '新竹', taichung: '台中', tainan: '台南', kaohsiung: '高雄' }
  return map[r] || r
}
