/**
 * POS Inventory — 唯讀庫存查詢
 * - 只有 SELECT，不提供任何寫入能力
 * - 顯示庫存狀態、安全庫存、最後更新時間
 */
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { toTaipei } from '../../lib/timezone'
import { Search, Package, AlertTriangle, CheckCircle2, Printer } from 'lucide-react'
import { printBarcode } from '../../utils/printer'

const CATS = ['全部', '雪茄', '吧台飲品', '餐飲', '酒類', '配件', '營運耗材']

export default function PosInventory() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('全部')

  useEffect(() => { loadInventory() }, [])

  async function loadInventory() {
    setLoading(true)
    try {
      // Products (cigars)
      const { data: products } = await supabase
        .from('products')
        .select('id, brand, name, stock_status, image_url')
        .eq('is_active', true)
        .order('brand')
      const cigars = (products || []).map(p => ({
        id: 'p_' + p.id, name: p.name, brand: p.brand, category: '雪茄',
        stock_status: p.stock_status || '現貨', current_stock: null, safe_stock: null,
        image_url: p.image_url, last_update: null,
      }))

      // Inventory master (drinks/food/accessories)
      const { data: inv } = await supabase
        .from('inventory_master')
        .select('id, name, category, current_stock, safe_stock, retail_price, image_url, last_update, enabled')
        .eq('enabled', true)
        .order('category')
      const bar = (inv || []).map(p => ({
        id: 'i_' + p.id, name: p.name, brand: p.category, category: p.category,
        stock_status: p.current_stock <= 0 ? '缺貨' : p.current_stock <= (p.safe_stock || 0) ? '少量' : '現貨',
        current_stock: p.current_stock, safe_stock: p.safe_stock,
        image_url: p.image_url, last_update: p.last_update,
      }))

      setItems([...cigars, ...bar])
    } catch (e) { console.error('Inventory load:', e) }
    finally { setLoading(false) }
  }

  const filtered = items.filter(item => {
    if (catFilter !== '全部' && item.category !== catFilter) return false
    if (search) {
      const kw = search.toLowerCase()
      return [item.name, item.brand, item.category].filter(Boolean).join(' ').toLowerCase().includes(kw)
    }
    return true
  })

  const stockCounts = {
    total: items.length,
    ok: items.filter(i => i.stock_status === '現貨').length,
    low: items.filter(i => i.stock_status === '少量').length,
    out: items.filter(i => i.stock_status === '缺貨').length,
  }

  if (loading) return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="loading-shimmer" style={{ width: 60, height: 60, borderRadius: '50%' }} />
    </div>
  )

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#0d0b09', color: '#e8dcc8', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #2a2520', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Package size={16} color="#c9a84c" />
          <span style={{ fontSize: 16, fontWeight: 700, color: '#c9a84c' }}>庫存查詢</span>
          <span style={{ fontSize: 10, color: '#8a7e6e', background: '#1a1714', padding: '2px 8px', borderRadius: 10 }}>唯讀</span>
          <div style={{ flex: 1 }} />
          <button onClick={loadInventory} style={{ background: 'none', border: '1px solid #2a2520', borderRadius: 6, padding: '4px 12px', fontSize: 10, color: '#8a7e6e', cursor: 'pointer' }}>重新整理</button>
        </div>

        {/* Summary */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <div style={{ flex: 1, background: '#1a1714', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: '#8a7e6e' }}>總品項</div>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{stockCounts.total}</div>
          </div>
          <div style={{ flex: 1, background: 'rgba(77,168,108,.08)', borderRadius: 8, padding: '8px 10px', textAlign: 'center', border: '1px solid rgba(77,168,108,.2)' }}>
            <div style={{ fontSize: 9, color: '#4da86c' }}>現貨</div>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#4da86c' }}>{stockCounts.ok}</div>
          </div>
          <div style={{ flex: 1, background: 'rgba(245,158,11,.08)', borderRadius: 8, padding: '8px 10px', textAlign: 'center', border: '1px solid rgba(245,158,11,.2)' }}>
            <div style={{ fontSize: 9, color: '#f59e0b' }}>少量</div>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#f59e0b' }}>{stockCounts.low}</div>
          </div>
          <div style={{ flex: 1, background: 'rgba(231,76,60,.08)', borderRadius: 8, padding: '8px 10px', textAlign: 'center', border: '1px solid rgba(231,76,60,.2)' }}>
            <div style={{ fontSize: 9, color: '#e74c3c' }}>缺貨</div>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#e74c3c' }}>{stockCounts.out}</div>
          </div>
        </div>

        {/* Search + filter */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#8a7e6e' }} />
            <input placeholder="搜尋品名 / 品牌…" value={search} onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', fontSize: 12, padding: '6px 6px 6px 28px', background: '#0d0b09', border: '1px solid #2a2520', borderRadius: 8, color: '#e8dcc8' }} />
          </div>
          <div style={{ display: 'flex', gap: 2 }}>
            {CATS.map(cat => (
              <button key={cat} onClick={() => setCatFilter(cat)}
                style={{ padding: '3px 8px', borderRadius: 8, fontSize: 10, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', background: catFilter === cat ? 'rgba(201,168,76,.15)' : 'transparent', color: catFilter === cat ? '#c9a84c' : '#8a7e6e', border: catFilter === cat ? '1px solid rgba(201,168,76,.3)' : '1px solid transparent' }}>
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 16px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #2a2520', position: 'sticky', top: 0, background: '#0d0b09' }}>
              <th style={{ textAlign: 'left', padding: '8px 4px', color: '#8a7e6e', fontWeight: 500, fontSize: 10 }}>品項</th>
              <th style={{ textAlign: 'left', padding: '8px 4px', color: '#8a7e6e', fontWeight: 500, fontSize: 10 }}>分類</th>
              <th style={{ textAlign: 'center', padding: '8px 4px', color: '#8a7e6e', fontWeight: 500, fontSize: 10 }}>庫存</th>
              <th style={{ textAlign: 'center', padding: '8px 4px', color: '#8a7e6e', fontWeight: 500, fontSize: 10 }}>安全值</th>
              <th style={{ textAlign: 'center', padding: '8px 4px', color: '#8a7e6e', fontWeight: 500, fontSize: 10 }}>狀態</th>
              <th style={{ textAlign: 'right', padding: '8px 4px', color: '#8a7e6e', fontWeight: 500, fontSize: 10 }}>更新</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(item => {
              const statusStyle = item.stock_status === '缺貨'
                ? { color: '#e74c3c', bg: 'rgba(231,76,60,.1)' }
                : item.stock_status === '少量'
                  ? { color: '#f59e0b', bg: 'rgba(245,158,11,.1)' }
                  : { color: '#4da86c', bg: 'rgba(77,168,108,.1)' }
              return (
                <tr key={item.id} style={{ borderBottom: '1px solid #1a1714' }}>
                  <td style={{ padding: '8px 4px' }}>
                    <div style={{ fontWeight: 600, color: '#e8dcc8' }}>{item.name}</div>
                    <div style={{ fontSize: 10, color: '#8a7e6e' }}>{item.brand}</div>
                  </td>
                  <td style={{ padding: '8px 4px', color: '#8a7e6e' }}>{item.category}</td>
                  <td style={{ padding: '8px 4px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                    {item.current_stock !== null ? item.current_stock : '—'}
                  </td>
                  <td style={{ padding: '8px 4px', textAlign: 'center', fontFamily: 'var(--font-mono)', color: '#8a7e6e' }}>
                    {item.safe_stock || '—'}
                  </td>
                  <td style={{ padding: '8px 4px', textAlign: 'center' }}>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 8, color: statusStyle.color, background: statusStyle.bg }}>
                      {item.stock_status}
                    </span>
                  </td>
                  <td style={{ padding: '8px 4px', textAlign: 'right', fontSize: 10, color: '#8a7e6e' }}>
                    {item.last_update ? toTaipei(item.last_update) : '—'}
                  </td>
                  <td style={{ padding: '8px 4px', textAlign: 'center' }}>
                    <button onClick={() => printBarcode(item.id?.replace('p_','').replace('i_',''), item.name).catch(e => console.warn('[barcode]', e))} style={{ background: 'none', border: '1px solid #555', borderRadius: 4, padding: '2px 6px', color: '#8a7e6e', fontSize: 10, cursor: 'pointer' }} title="列印條碼"><Printer size={12} /></button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!filtered.length && <div style={{ textAlign: 'center', padding: 40, color: '#8a7e6e' }}>無符合品項</div>}
      </div>
    </div>
  )
}
