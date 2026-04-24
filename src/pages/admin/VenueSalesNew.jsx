// src/pages/admin/VenueSalesNew.jsx
// 員工每日酒店銷售 Key-in 表單。AdminGuard 保護。
// payload 結構對齊 hq_submit_venue_sales RPC（payroll_onboarding_v1.sql）
import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2, AlertTriangle, Check } from 'lucide-react'
import {
  getVenues, getAmbassadors, getProductsForVenueSales,
  submitVenueSales, todayISO,
  PRODUCT_CATEGORIES, PAYMENT_STATUSES, SOURCE_TYPES,
} from '../../lib/services/venueSales'
import { newIdempotencyKey, createOneShot } from '../../lib/services/idempotency'
import PageShell, { Card } from '../../components/PageShell'

const oneShot = createOneShot()

function makeEmptyItem() {
  return {
    key: crypto.randomUUID(),
    product_id: '', product_name: '', category: '',
    quantity: 0, unit_price: 0,
  }
}

export default function VenueSalesNew() {
  const navigate = useNavigate()

  // ---- 基本資料 ----
  const [saleDate, setSaleDate] = useState(todayISO())
  const [venueId, setVenueId] = useState('')
  const [ambassadorId, setAmbassadorId] = useState('')
  const [sourceType, setSourceType] = useState('hotel_manual')
  const [note, setNote] = useState('')

  // ---- 商品明細 ----
  const [items, setItems] = useState([makeEmptyItem()])

  // ---- 收款 ----
  const [cash, setCash] = useState(0)
  const [transfer, setTransfer] = useState(0)
  const [monthly, setMonthly] = useState(0)
  const [unpaid, setUnpaid] = useState(0)
  const [paymentStatus, setPaymentStatus] = useState('paid')

  // ---- lookup lists ----
  const [venues, setVenues] = useState([])
  const [ambassadors, setAmbassadors] = useState([])
  const [products, setProducts] = useState([])

  // ---- UI ----
  const [submitting, setSubmitting] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [errors, setErrors] = useState([])
  const [idempotencyKey] = useState(() => newIdempotencyKey())

  useEffect(() => {
    getVenues().then(setVenues).catch(console.error)
    getAmbassadors().then(setAmbassadors).catch(console.error)
    getProductsForVenueSales().then(setProducts).catch(console.error)
  }, [])

  // ---- computed totals ----
  const salesTotal = useMemo(
    () => items.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0),
    [items]
  )
  const paymentTotal = useMemo(
    () => Number(cash || 0) + Number(transfer || 0) + Number(monthly || 0) + Number(unpaid || 0),
    [cash, transfer, monthly, unpaid]
  )
  const difference = salesTotal - paymentTotal

  // 自動建議 payment_status（使用者仍可手動改）
  const suggestedStatus = useMemo(() => {
    if (salesTotal <= 0) return 'unpaid'
    const paidPart = Number(cash || 0) + Number(transfer || 0)
    if (Number(unpaid || 0) === salesTotal) return 'unpaid'
    if (Number(monthly || 0) === salesTotal) return 'monthly'
    if (paidPart === salesTotal) return 'paid'
    if (paidPart > 0 || Number(monthly || 0) > 0) return 'partial'
    return 'unpaid'
  }, [cash, transfer, monthly, unpaid, salesTotal])

  // ---- item handlers ----
  function updateItem(key, field, value) {
    setItems(items.map(it => {
      if (it.key !== key) return it
      if (field === 'product_id') {
        const p = products.find(p => p.id === value)
        return {
          ...it,
          product_id: value,
          product_name: p?.name || '',
          category: p?.category || '',
          unit_price: it.unit_price || p?.unit_price || 0,
        }
      }
      return { ...it, [field]: value }
    }))
  }

  function addItem() { setItems([...items, makeEmptyItem()]) }
  function removeItem(key) {
    if (items.length === 1) { setItems([makeEmptyItem()]); return }
    setItems(items.filter(it => it.key !== key))
  }

  // ---- validation ----
  function validate() {
    const errs = []
    if (!saleDate) errs.push('銷售日期必填')
    if (!venueId) errs.push('酒店 / 場域必填')
    if (!ambassadorId) errs.push('大使必填')

    const validItems = items.filter(it => it.product_id)
    if (validItems.length === 0) errs.push('至少需要一筆商品')

    validItems.forEach((it, idx) => {
      if (!(Number(it.quantity) > 0)) errs.push(`第 ${idx + 1} 筆商品：數量必須 > 0`)
      if (Number(it.unit_price) < 0) errs.push(`第 ${idx + 1} 筆商品：單價不可為負`)
    })

    if (salesTotal <= 0) errs.push('商品總額必須 > 0')

    if (Number(cash) < 0 || Number(transfer) < 0 || Number(monthly) < 0 || Number(unpaid) < 0) {
      errs.push('收款金額不可為負數')
    }
    if (paymentTotal > salesTotal + 0.01) {
      errs.push(`收款總額 (NT$ ${paymentTotal.toLocaleString()}) 不可超過銷售總額 (NT$ ${salesTotal.toLocaleString()})`)
    }
    return errs
  }

  function handleTrySubmit() {
    const errs = validate()
    setErrors(errs)
    if (errs.length === 0) setConfirming(true)
  }

  // ---- submit ----
  async function doSubmit(continueAdd = false) {
    if (submitting) return
    setSubmitting(true)
    const validItems = items.filter(it => it.product_id)
    const payload = {
      sale_date: saleDate,
      venue_id: venueId,
      ambassador_id: ambassadorId,
      source_type: sourceType,
      items: validItems.map(it => ({
        product_id: it.product_id,
        product_name: it.product_name,
        category: it.category,
        quantity: Number(it.quantity),
        unit_price: Number(it.unit_price),
        subtotal: Number(it.quantity) * Number(it.unit_price),
      })),
      payment: {
        cash_amount: Number(cash) || 0,
        bank_transfer_amount: Number(transfer) || 0,
        monthly_settlement_amount: Number(monthly) || 0,
        unpaid_amount: Number(unpaid) || 0,
        payment_status: paymentStatus,
      },
      note: note.trim() || null,
      idempotency_key: idempotencyKey,
    }

    try {
      await oneShot.run(() => submitVenueSales(payload))
      if (continueAdd) {
        alert('✓ 銷售已送出（MVP mock）\n\n繼續新增下一筆')
        // reset 表單但保留日期與來源
        setVenueId(''); setAmbassadorId('')
        setItems([makeEmptyItem()])
        setCash(0); setTransfer(0); setMonthly(0); setUnpaid(0)
        setPaymentStatus('paid'); setNote('')
        setConfirming(false); setErrors([])
      } else {
        alert('✓ 銷售已送出（MVP mock）')
        navigate('/admin/venue-sales')
      }
    } catch (e) {
      alert('送出失敗：' + (e.message || '未知錯誤'))
      setConfirming(false)
    } finally {
      setSubmitting(false)
    }
  }

  // ---- render ----
  return (
    <PageShell
      title="新增酒店銷售"
      subtitle="HQ · VENUE SALES KEY-IN · 由 HQ / 員工 Key-in 每日場域銷售"
      actions={
        <button onClick={() => navigate('/admin/venue-sales')} style={backBtn()}>
          <ArrowLeft size={14} /> 返回
        </button>
      }
    >
      {/* 基本資料 */}
      <Card style={{ marginBottom: 12 }}>
        <SectionTitle>基本資料</SectionTitle>
        <Grid cols={2}>
          <Field label="銷售日期 *">
            <input type="date" value={saleDate} onChange={e => setSaleDate(e.target.value)} style={input()} />
          </Field>
          <Field label="來源">
            <select value={sourceType} onChange={e => setSourceType(e.target.value)} style={input()}>
              {Object.entries(SOURCE_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="酒店 / 場域 *">
            <select value={venueId} onChange={e => setVenueId(e.target.value)} style={input()}>
              <option value="">— 請選擇 —</option>
              {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </Field>
          <Field label="大使 *">
            <select value={ambassadorId} onChange={e => setAmbassadorId(e.target.value)} style={input()}>
              <option value="">— 請選擇 —</option>
              {ambassadors.map(a => <option key={a.id} value={a.id}>{a.name} ({a.ambassador_code})</option>)}
            </select>
          </Field>
        </Grid>
        <Field label="備註" style={{ marginTop: 10 }}>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} style={{ ...input(), resize: 'vertical' }} />
        </Field>
      </Card>

      {/* 商品明細 */}
      <Card style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <SectionTitle noMargin>商品明細 ({items.filter(i => i.product_id).length} 項)</SectionTitle>
          <button onClick={addItem} style={smallBtn('#c9a84c')}>
            <Plus size={12} /> 新增一列
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map((it, idx) => (
            <ItemRow
              key={it.key}
              idx={idx}
              item={it}
              products={products}
              onChange={(field, val) => updateItem(it.key, field, val)}
              onRemove={() => removeItem(it.key)}
              canRemove={items.length > 1}
            />
          ))}
        </div>
        <TotalLine label="商品總額" value={salesTotal} color="#c9a84c" big />
      </Card>

      {/* 收款資料 */}
      <Card style={{ marginBottom: 12 }}>
        <SectionTitle>收款資料</SectionTitle>
        <Grid cols={2}>
          <Field label="現金 (NT$)">
            <input type="number" min="0" value={cash || ''} onChange={e => setCash(e.target.value)} style={input()} />
          </Field>
          <Field label="匯款 (NT$)">
            <input type="number" min="0" value={transfer || ''} onChange={e => setTransfer(e.target.value)} style={input()} />
          </Field>
          <Field label="月結 (NT$)">
            <input type="number" min="0" value={monthly || ''} onChange={e => setMonthly(e.target.value)} style={input()} />
          </Field>
          <Field label="未收 (NT$)">
            <input type="number" min="0" value={unpaid || ''} onChange={e => setUnpaid(e.target.value)} style={input()} />
          </Field>
        </Grid>

        <TotalLine label="收款總額" value={paymentTotal} />
        <TotalLine
          label="差額（銷售 − 收款）"
          value={difference}
          color={difference === 0 ? '#10b981' : difference > 0 ? '#f59e0b' : '#f87171'}
          note={difference > 0 ? `尚有 NT$ ${difference.toLocaleString()} 未記錄為任何收款方式` : (difference < 0 ? `收款超出銷售 NT$ ${Math.abs(difference).toLocaleString()}` : '')}
        />

        {/* 收款狀態 */}
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, color: '#8a8278', marginBottom: 8, letterSpacing: 1 }}>
            收款狀態　<span style={{ color: '#c9a84c' }}>系統建議：{PAYMENT_STATUSES[suggestedStatus]}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {Object.entries(PAYMENT_STATUSES).map(([k, v]) => (
              <RadioTile
                key={k}
                active={paymentStatus === k}
                onClick={() => setPaymentStatus(k)}
                color={k === 'paid' ? '#10b981' : k === 'partial' ? '#f59e0b' : k === 'monthly' ? '#3b82f6' : '#f87171'}
              >
                {v}
              </RadioTile>
            ))}
          </div>
        </div>
      </Card>

      {/* 錯誤清單 */}
      {errors.length > 0 && (
        <Card style={{ marginBottom: 12, borderColor: 'rgba(248,113,113,0.35)', background: 'rgba(248,113,113,0.06)' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
            <AlertTriangle size={16} color="#f87171" />
            <span style={{ color: '#fecaca', fontSize: 13, fontWeight: 500 }}>請修正以下 {errors.length} 項：</span>
          </div>
          <ul style={{ margin: 0, paddingLeft: 22, fontSize: 12, color: '#fecaca', lineHeight: 1.8 }}>
            {errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </Card>
      )}

      {/* 按鈕 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
        <button onClick={handleTrySubmit} disabled={submitting}
          style={{
            width: '100%', padding: 14, borderRadius: 10, border: 'none',
            background: 'linear-gradient(135deg, #c9a84c 0%, #8b6d2f 100%)',
            color: '#0a0a0a', fontSize: 15, fontWeight: 700, cursor: 'pointer', letterSpacing: 2,
            opacity: submitting ? 0.6 : 1,
          }}>
          {submitting ? '處理中…' : '送出銷售'}
        </button>
      </div>

      {/* Confirm modal */}
      {confirming && (
        <ConfirmModal
          sale_date={saleDate}
          venue_name={venues.find(v => v.id === venueId)?.name}
          ambassador_name={ambassadors.find(a => a.id === ambassadorId)?.name}
          items={items.filter(i => i.product_id)}
          salesTotal={salesTotal}
          cash={cash} transfer={transfer} monthly={monthly} unpaid={unpaid}
          payment_status={paymentStatus}
          difference={difference}
          idempotencyKey={idempotencyKey}
          onCancel={() => setConfirming(false)}
          onConfirm={() => doSubmit(false)}
          onConfirmContinue={() => doSubmit(true)}
          submitting={submitting}
        />
      )}

      <div style={{ marginTop: 14, fontSize: 10, color: '#5a554e', textAlign: 'center' }}>
        MVP · USE_MOCK=true · 送出不會寫入 production DB
      </div>
    </PageShell>
  )
}

// ============== 子組件 ==============

function SectionTitle({ children, noMargin }) {
  return (
    <div style={{ fontSize: 11, color: '#8a8278', letterSpacing: 2, marginBottom: noMargin ? 0 : 10 }}>
      {children}
    </div>
  )
}

function Grid({ children, cols = 2 }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(160px, 1fr))`, gap: 10 }}>
      {children}
    </div>
  )
}

function Field({ label, children, style }) {
  return (
    <div style={style}>
      <div style={{ fontSize: 10, color: '#8a8278', marginBottom: 4, letterSpacing: 1 }}>{label}</div>
      {children}
    </div>
  )
}

function ItemRow({ idx, item, products, onChange, onRemove, canRemove }) {
  const subtotal = (Number(item.quantity) || 0) * (Number(item.unit_price) || 0)
  return (
    <div style={{
      padding: 10, background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(201,168,76,0.15)', borderRadius: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 10, color: '#c9a84c', letterSpacing: 2 }}># {idx + 1}</span>
        {canRemove && (
          <button onClick={onRemove}
            style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Trash2 size={12} /> 刪除
          </button>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
        <Field label="商品">
          <select value={item.product_id} onChange={e => onChange('product_id', e.target.value)} style={input()}>
            <option value="">— 請選擇 —</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="分類">
          <input value={PRODUCT_CATEGORIES[item.category] || ''} readOnly style={{ ...input(), background: '#0f0d0a', color: '#8a8278' }} />
        </Field>
        <Field label="數量">
          <input type="number" min="0" value={item.quantity || ''} onChange={e => onChange('quantity', e.target.value)} style={input()} />
        </Field>
        <Field label="單價 (NT$)">
          <input type="number" min="0" value={item.unit_price || ''} onChange={e => onChange('unit_price', e.target.value)} style={input()} />
        </Field>
        <Field label="小計">
          <div style={{ padding: '10px 12px', background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.25)', borderRadius: 8, color: '#c9a84c', fontWeight: 600, textAlign: 'right' }}>
            NT$ {subtotal.toLocaleString()}
          </div>
        </Field>
      </div>
    </div>
  )
}

function TotalLine({ label, value, color = '#e8e0d0', big, note }) {
  return (
    <div style={{ marginTop: 10, padding: '10px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 12, color: '#8a8278' }}>{label}</span>
        <span style={{ fontSize: big ? 20 : 15, color, fontWeight: 600 }}>
          NT$ {Number(value || 0).toLocaleString()}
        </span>
      </div>
      {note && <div style={{ fontSize: 10, color: '#8a8278', marginTop: 4 }}>{note}</div>}
    </div>
  )
}

function RadioTile({ active, onClick, color, children }) {
  return (
    <button onClick={onClick} style={{
      padding: '10px 6px', borderRadius: 8,
      background: active ? `${color}22` : 'rgba(255,255,255,0.02)',
      border: `1px solid ${active ? color : '#2a2520'}`,
      color: active ? color : '#8a8278', fontSize: 12, cursor: 'pointer',
      fontWeight: active ? 600 : 400,
    }}>{children}</button>
  )
}

function ConfirmModal({ sale_date, venue_name, ambassador_name, items, salesTotal, cash, transfer, monthly, unpaid, payment_status, difference, idempotencyKey, onCancel, onConfirm, onConfirmContinue, submitting }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{
        background: '#111', border: '1px solid #c9a84c44', borderRadius: 12,
        maxWidth: 520, width: '100%', maxHeight: '90vh', overflow: 'auto', padding: 20,
      }}>
        <div style={{ fontSize: 11, color: '#c9a84c', letterSpacing: 3, marginBottom: 4 }}>確認送出</div>
        <h2 style={{ fontSize: 18, color: '#e8e0d0', margin: 0, marginBottom: 14 }}>銷售單摘要</h2>

        <InfoRow label="日期" value={sale_date} />
        <InfoRow label="酒店" value={venue_name} />
        <InfoRow label="大使" value={ambassador_name} />

        <div style={{ margin: '12px 0 6px', fontSize: 10, color: '#8a8278', letterSpacing: 2 }}>商品</div>
        {items.map((it, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12 }}>
            <span style={{ color: '#e8e0d0' }}>{it.product_name} × {it.quantity}</span>
            <span style={{ color: '#c9a84c' }}>NT$ {(it.quantity * it.unit_price).toLocaleString()}</span>
          </div>
        ))}
        <div style={{ padding: '8px 0', marginTop: 6, borderTop: '1px solid #2a2520', display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#8a8278', fontSize: 12 }}>商品總額</span>
          <span style={{ color: '#c9a84c', fontWeight: 600 }}>NT$ {salesTotal.toLocaleString()}</span>
        </div>

        <div style={{ margin: '12px 0 6px', fontSize: 10, color: '#8a8278', letterSpacing: 2 }}>收款</div>
        <InfoRow label="現金" value={`NT$ ${Number(cash || 0).toLocaleString()}`} />
        <InfoRow label="匯款" value={`NT$ ${Number(transfer || 0).toLocaleString()}`} />
        <InfoRow label="月結" value={`NT$ ${Number(monthly || 0).toLocaleString()}`} />
        <InfoRow label="未收" value={`NT$ ${Number(unpaid || 0).toLocaleString()}`} color={Number(unpaid) > 0 ? '#f87171' : undefined} />
        <InfoRow label="收款狀態" value={PAYMENT_STATUSES[payment_status]} />

        {difference !== 0 && (
          <div style={{
            marginTop: 10, padding: 10, borderRadius: 6,
            background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.35)',
            color: '#fde68a', fontSize: 12,
          }}>
            ⚠ 差額 NT$ {Math.abs(difference).toLocaleString()}
            {difference > 0 ? '（收款少於銷售）' : '（收款多於銷售）'}
          </div>
        )}

        <div style={{ marginTop: 10, fontSize: 10, color: '#5a554e', fontFamily: 'monospace' }}>
          idempotency_key: {idempotencyKey.slice(0, 13)}…
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 16 }}>
          <button onClick={onCancel} disabled={submitting} style={modalBtn('#6b7280')}>取消</button>
          <button onClick={onConfirm} disabled={submitting} style={modalBtn('#10b981', true)}>
            <Check size={14} /> 送出返回
          </button>
          <button onClick={onConfirmContinue} disabled={submitting} style={modalBtn('#c9a84c', true)}>
            <Check size={14} /> 送出並繼續
          </button>
        </div>
      </div>
    </div>
  )
}

function InfoRow({ label, value, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12 }}>
      <span style={{ color: '#8a8278' }}>{label}</span>
      <span style={{ color: color || '#e8e0d0' }}>{value || '—'}</span>
    </div>
  )
}

// ============== styles ==============

function input() {
  return {
    width: '100%', padding: '10px 12px', background: '#1a1714',
    border: '1px solid #2a2520', borderRadius: 8, color: '#e8dcc8',
    fontSize: 14, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit',
  }
}
function backBtn() {
  return { background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.2)', color: '#c9a84c', padding: '6px 10px', borderRadius: 6, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }
}
function smallBtn(color) {
  return { background: `${color}22`, border: `1px solid ${color}44`, color, padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }
}
function modalBtn(color, filled = false) {
  return {
    padding: '10px 8px', borderRadius: 8,
    background: filled ? `${color}22` : 'transparent',
    border: `1px solid ${color}66`,
    color, cursor: 'pointer', fontSize: 13, fontWeight: 500,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
  }
}
