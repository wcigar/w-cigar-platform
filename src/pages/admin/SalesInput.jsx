// src/pages/admin/SalesInput.jsx
// 酒店銷售輸入頁（/admin/sales-input）
// 寫入流程: RPC submit_venue_sale → venue_sales_daily / inventory_balances / monthly_collections 三件事原子完成
// 操作員身份請查 employees 表（login_code 不在程式碼註釋裡）
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import {
  listVenues,
  listAmbassadors,
  getVenuePricing,
  submitSale,
} from '../../services/salesInputService'
import { getProductCN } from '../../utils/productNames'

export default function SalesInput() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const operatorName =
    user?.name ||
    user?._raw?.name ||
    sessionStorage.getItem('wcb_user_name') ||
    'STAFF'

  const today = new Date().toISOString().split('T')[0]

  const [saleDate, setSaleDate] = useState(today)
  const [venues, setVenues] = useState([])
  const [ambassadors, setAmbassadors] = useState([])
  const [selectedVenue, setSelectedVenue] = useState('')
  const [selectedAmb, setSelectedAmb] = useState('')
  const [products, setProducts] = useState([]) // [{ product_key, sale_price, qty }]
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState(null)
  const [loadingProducts, setLoadingProducts] = useState(false)

  // 載入下拉選項
  useEffect(() => {
    listVenues().then(setVenues).catch((e) => console.error('listVenues', e))
    listAmbassadors().then(setAmbassadors).catch((e) => console.error('listAmbassadors', e))
  }, [])

  // 選酒店 → 載商品
  useEffect(() => {
    if (!selectedVenue) {
      setProducts([])
      return
    }
    setLoadingProducts(true)
    getVenuePricing(selectedVenue)
      .then((items) => setProducts(items.map((i) => ({ ...i, qty: 0 }))))
      .catch((e) => {
        console.error('getVenuePricing', e)
        setMessage({ type: 'error', text: '無法載入商品: ' + e.message })
      })
      .finally(() => setLoadingProducts(false))
  }, [selectedVenue])

  const totalQty = products.reduce((s, p) => s + p.qty, 0)
  const totalAmt = products.reduce(
    (s, p) => s + p.qty * Number(p.sale_price || 0),
    0,
  )

  const handleQtyChange = (key, delta) => {
    setProducts((prev) =>
      prev.map((p) =>
        p.product_key === key
          ? { ...p, qty: Math.max(0, Math.min(99, p.qty + delta)) }
          : p,
      ),
    )
  }

  const handleQtyInput = (key, value) => {
    const n = parseInt(value, 10)
    const safe = Number.isFinite(n) ? Math.max(0, Math.min(99, n)) : 0
    setProducts((prev) =>
      prev.map((p) => (p.product_key === key ? { ...p, qty: safe } : p)),
    )
  }

  const handleClearQty = () => {
    setProducts((prev) => prev.map((p) => ({ ...p, qty: 0 })))
    setNotes('')
    setMessage(null)
  }

  const handleSubmit = async () => {
    if (!selectedVenue || !selectedAmb || totalQty === 0) return

    setSubmitting(true)
    setMessage(null)

    const items = products
      .filter((p) => p.qty > 0)
      .map((p) => ({
        product_key: p.product_key,
        product_name: getProductCN(p.product_key),
        quantity: p.qty,
        unit_price: Number(p.sale_price),
        subtotal: p.qty * Number(p.sale_price),
      }))

    try {
      const result = await submitSale({
        saleDate,
        venueId: selectedVenue,
        ambassadorId: selectedAmb,
        items,
        totalAmount: totalAmt,
        submittedBy: operatorName,
        notes: notes || null,
      })

      setMessage({
        type: 'success',
        text: `✅ 已寫入 — 共 ${totalQty} 根 / NT$${totalAmt.toLocaleString()}（店家分潤 NT$${Number(
          result.venue_share_total || 0,
        ).toLocaleString()}）`,
      })
      // 重置數量與備註，保留 日期 / 酒店 / 大使（方便連續輸入同店）
      setProducts((prev) => prev.map((p) => ({ ...p, qty: 0 })))
      setNotes('')
    } catch (err) {
      console.error('submitSale failed', err)
      setMessage({ type: 'error', text: `❌ 失敗：${err.message}` })
    } finally {
      setSubmitting(false)
    }
  }

  // 按區域分組酒店
  const REGION_LABEL = { taipei: '台北', taoyuan: '桃園', taichung: '台中' }
  const venuesByRegion = venues.reduce((acc, v) => {
    const r = REGION_LABEL[v.region] || v.region || '其他'
    if (!acc[r]) acc[r] = []
    acc[r].push(v)
    return acc
  }, {})

  return (
    <div style={S.container}>
      <div style={S.header}>
        <div>
          <h1 style={S.title}>📝 酒店銷售輸入</h1>
          <p style={S.subtitle}>
            操作員：<b>{operatorName}</b>
          </p>
        </div>
        <button onClick={() => navigate('/')} style={S.btnGhost}>
          ← 返回首頁
        </button>
      </div>

      <div style={S.form}>
        <div style={S.row3}>
          <div style={S.field}>
            <label style={S.label}>📅 銷售日期</label>
            <input
              type="date"
              value={saleDate}
              onChange={(e) => setSaleDate(e.target.value)}
              style={S.input}
            />
          </div>

          <div style={S.field}>
            <label style={S.label}>🏨 酒店</label>
            <select
              value={selectedVenue}
              onChange={(e) => setSelectedVenue(e.target.value)}
              style={S.input}
            >
              <option value="">— 選擇酒店 —</option>
              {Object.entries(venuesByRegion).map(([region, vs]) => (
                <optgroup key={region} label={region}>
                  {vs.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div style={S.field}>
            <label style={S.label}>👤 大使</label>
            <select
              value={selectedAmb}
              onChange={(e) => setSelectedAmb(e.target.value)}
              style={S.input}
            >
              <option value="">— 選擇大使 —</option>
              {ambassadors.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}（{a.ambassador_code}）
                </option>
              ))}
            </select>
          </div>
        </div>

        {selectedVenue && loadingProducts && (
          <div style={S.loading}>載入商品中…</div>
        )}

        {selectedVenue && !loadingProducts && products.length === 0 && (
          <div style={S.empty}>
            ⚠️ 此酒店尚未在 venue_pricing 設定任何售價 &gt; 0 的商品，請先到「商品定價」設定。
          </div>
        )}

        {products.length > 0 && (
          <div style={S.products}>
            <h3 style={S.h3}>商品（按 −/＋ 或直接輸入數量）</h3>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>商品</th>
                  <th style={{ ...S.th, textAlign: 'right' }}>單價</th>
                  <th style={{ ...S.th, textAlign: 'center', width: 180 }}>
                    數量
                  </th>
                  <th style={{ ...S.th, textAlign: 'right' }}>小計</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr
                    key={p.product_key}
                    style={p.qty > 0 ? S.rowActive : undefined}
                  >
                    <td style={S.td}>{getProductCN(p.product_key)}</td>
                    <td style={{ ...S.td, textAlign: 'right' }}>
                      ${Number(p.sale_price).toLocaleString()}
                    </td>
                    <td style={{ ...S.td, textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => handleQtyChange(p.product_key, -1)}
                        disabled={p.qty === 0}
                        style={S.qtyBtn}
                      >
                        −
                      </button>
                      <input
                        type="number"
                        min={0}
                        max={99}
                        value={p.qty}
                        onChange={(e) =>
                          handleQtyInput(p.product_key, e.target.value)
                        }
                        style={S.qtyInput}
                      />
                      <button
                        type="button"
                        onClick={() => handleQtyChange(p.product_key, 1)}
                        disabled={p.qty === 99}
                        style={S.qtyBtn}
                      >
                        +
                      </button>
                    </td>
                    <td style={{ ...S.td, textAlign: 'right' }}>
                      ${(p.qty * Number(p.sale_price)).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={S.totalRow}>
                  <td style={S.td} colSpan={2}>
                    總計
                  </td>
                  <td style={{ ...S.td, textAlign: 'center' }}>
                    {totalQty} 根
                  </td>
                  <td style={{ ...S.td, textAlign: 'right' }}>
                    NT${totalAmt.toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {selectedVenue && (
          <div style={S.field}>
            <label style={S.label}>備註（選填）</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="例：客人 VIP / 特殊折扣 / 試抽 …"
              style={S.input}
            />
          </div>
        )}

        {message && (
          <div style={message.type === 'success' ? S.success : S.error}>
            {message.text}
          </div>
        )}

        <div style={S.actions}>
          <button onClick={handleClearQty} style={S.btnSecondary}>
            清空數量
          </button>
          <button
            onClick={handleSubmit}
            disabled={
              submitting || !selectedVenue || !selectedAmb || totalQty === 0
            }
            style={{
              ...S.btnPrimary,
              opacity:
                submitting || !selectedVenue || !selectedAmb || totalQty === 0
                  ? 0.5
                  : 1,
              cursor:
                submitting || !selectedVenue || !selectedAmb || totalQty === 0
                  ? 'not-allowed'
                  : 'pointer',
            }}
          >
            {submitting ? '寫入中…' : `送出銷售（${totalQty} 根 / NT$${totalAmt.toLocaleString()}）`}
          </button>
        </div>
      </div>
    </div>
  )
}

const S = {
  container: { maxWidth: 900, margin: '0 auto', padding: 20, color: '#222' },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderBottom: '2px solid #5C8FBF',
    paddingBottom: 12,
    marginBottom: 20,
  },
  title: { margin: 0, fontSize: 22 },
  subtitle: { margin: '4px 0 0 0', color: '#666', fontSize: 13 },
  form: { display: 'flex', flexDirection: 'column', gap: 16 },
  row3: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 12,
  },
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: { fontSize: 13, color: '#444', fontWeight: 600 },
  input: {
    padding: 10,
    fontSize: 15,
    border: '1px solid #ccc',
    borderRadius: 4,
    background: '#fff',
  },
  loading: { padding: 16, textAlign: 'center', color: '#666' },
  empty: {
    padding: 16,
    background: '#FFF8E1',
    border: '1px solid #FFB300',
    borderRadius: 4,
    color: '#7a5300',
  },
  products: { background: '#F0F4F8', padding: 16, borderRadius: 8 },
  h3: { margin: '0 0 12px 0', fontSize: 15 },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    textAlign: 'left',
    padding: '8px 6px',
    fontSize: 13,
    color: '#555',
    borderBottom: '1px solid #cfd8e3',
  },
  td: { padding: '8px 6px', fontSize: 14, borderBottom: '1px solid #e1e8f0' },
  rowActive: { background: '#FFFCE6' },
  qtyBtn: {
    width: 32,
    height: 32,
    fontSize: 18,
    border: '1px solid #5C8FBF',
    background: '#fff',
    color: '#2E5C8A',
    borderRadius: 4,
    cursor: 'pointer',
    margin: '0 4px',
  },
  qtyInput: {
    width: 50,
    padding: '4px 6px',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    border: '1px solid #ccc',
    borderRadius: 4,
  },
  totalRow: {
    background: '#5C8FBF',
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15,
  },
  success: {
    padding: 12,
    background: '#E8F5E9',
    border: '1px solid #4CAF50',
    borderRadius: 4,
    color: '#1b5e20',
    fontWeight: 600,
  },
  error: {
    padding: 12,
    background: '#FFEBEE',
    border: '1px solid #f44336',
    borderRadius: 4,
    color: '#b71c1c',
    fontWeight: 600,
  },
  actions: { display: 'flex', gap: 12, marginTop: 4 },
  btnPrimary: {
    flex: 1,
    padding: 14,
    background: '#2E5C8A',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    fontSize: 16,
    fontWeight: 600,
  },
  btnSecondary: {
    padding: '14px 18px',
    background: '#e0e0e0',
    color: '#333',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 14,
  },
  btnGhost: {
    padding: '8px 14px',
    background: 'transparent',
    color: '#5C8FBF',
    border: '1px solid #5C8FBF',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 13,
  },
}
