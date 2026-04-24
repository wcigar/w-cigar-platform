// src/pages/admin/VenueSalesMatrix.jsx
// 快速矩陣模式：依地區展開店家、商品單價預填，員工只填數量
// 對應現有 Excel（2026雪茄銷量.xlsx）作業邏輯
import { useEffect, useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Check, Trash2, Copy, Store, Minus } from 'lucide-react'
import {
  getVenueSalesMatrixTemplate, getAmbassadors, submitVenueSalesMatrix, todayISO,
  PAYMENT_STATUSES, SOURCE_TYPES, REGIONS,
} from '../../lib/services/venueSales'
import { newIdempotencyKey, createOneShot } from '../../lib/services/idempotency'
import { Card } from '../../components/PageShell'

const oneShot = createOneShot()
const LAST_REGION_KEY = 'venue_sales_last_region'

export default function VenueSalesMatrix() {
  const navigate = useNavigate()

  // ---- basic ----
  const [saleDate, setSaleDate] = useState(todayISO())
  const [region, setRegion] = useState(() => {
    try { return localStorage.getItem(LAST_REGION_KEY) || 'taipei' } catch { return 'taipei' }
  })
  const [sourceType, setSourceType] = useState('hotel_manual_matrix')
  const [topNote, setTopNote] = useState('')

  // ---- template & state ----
  const [template, setTemplate] = useState(null)   // { region, venues: [{ id, name, products: [...] }] }
  const [ambassadors, setAmbassadors] = useState([])
  const [venueState, setVenueState] = useState({}) // { [venueId]: { hasSales, ambassadorId, quantities:{}, preShiftAmount, preShiftNote, note } }

  // ---- payment ----
  const [cash, setCash] = useState(0)
  const [transfer, setTransfer] = useState(0)
  const [monthly, setMonthly] = useState(0)
  const [unpaid, setUnpaid] = useState(0)
  const [paymentStatus, setPaymentStatus] = useState('paid')

  // ---- UI ----
  const [submitting, setSubmitting] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [errors, setErrors] = useState([])
  const [idempotencyKey] = useState(() => newIdempotencyKey())

  useEffect(() => { getAmbassadors().then(setAmbassadors).catch(console.error) }, [])

  // 切換地區 → 重讀 template + 重置 venueState
  useEffect(() => {
    try { localStorage.setItem(LAST_REGION_KEY, region) } catch {}
    getVenueSalesMatrixTemplate(region).then(tpl => {
      setTemplate(tpl)
      const init = {}
      tpl.venues.forEach(v => {
        init[v.id] = {
          hasSales: true,
          ambassadorId: '',
          quantities: Object.fromEntries(v.products.filter(p => p.price !== null).map(p => [p.key, 0])),
          preShiftAmount: 0,
          preShiftNote: '',
          note: '',
        }
      })
      setVenueState(init)
    })
  }, [region])

  // ---- helpers ----
  const venueTotal = useCallback((vid) => {
    if (!template) return 0
    const v = template.venues.find(x => x.id === vid)
    const s = venueState[vid]
    if (!v || !s || !s.hasSales) return 0
    let total = 0
    for (const p of v.products) {
      if (p.price === null) total += Number(s.preShiftAmount || 0)
      else total += (Number(s.quantities[p.key]) || 0) * p.price
    }
    return total
  }, [template, venueState])

  const venueQty = useCallback((vid) => {
    if (!template) return 0
    const v = template.venues.find(x => x.id === vid)
    const s = venueState[vid]
    if (!v || !s || !s.hasSales) return 0
    let qty = 0
    for (const p of v.products) {
      if (p.price !== null) qty += Number(s.quantities[p.key]) || 0
    }
    return qty
  }, [template, venueState])

  const totalSalesAmount = useMemo(
    () => (template?.venues || []).reduce((sum, v) => sum + venueTotal(v.id), 0),
    [template, venueTotal]
  )
  const totalQty = useMemo(
    () => (template?.venues || []).reduce((sum, v) => sum + venueQty(v.id), 0),
    [template, venueQty]
  )
  const venuesWithSalesCount = useMemo(
    () => (template?.venues || []).filter(v => (venueState[v.id]?.hasSales) && venueTotal(v.id) > 0).length,
    [template, venueState, venueTotal]
  )
  const venuesEmptyCount = (template?.venues.length || 0) - venuesWithSalesCount

  const paymentTotal = Number(cash || 0) + Number(transfer || 0) + Number(monthly || 0) + Number(unpaid || 0)
  const difference = totalSalesAmount - paymentTotal

  const suggestedStatus = useMemo(() => {
    if (totalSalesAmount <= 0) return 'unpaid'
    const paidPart = Number(cash || 0) + Number(transfer || 0)
    if (Number(unpaid || 0) === totalSalesAmount) return 'unpaid'
    if (Number(monthly || 0) === totalSalesAmount) return 'monthly'
    if (paidPart === totalSalesAmount) return 'paid'
    if (paidPart > 0 || Number(monthly || 0) > 0) return 'partial'
    return 'unpaid'
  }, [cash, transfer, monthly, unpaid, totalSalesAmount])

  // ---- state mutators ----
  function updateVenue(vid, patch) {
    setVenueState(prev => ({ ...prev, [vid]: { ...prev[vid], ...patch } }))
  }
  function updateQty(vid, key, value) {
    setVenueState(prev => ({
      ...prev,
      [vid]: { ...prev[vid], quantities: { ...prev[vid].quantities, [key]: value } },
    }))
  }
  function clearDay() {
    if (!window.confirm('清空本日所有店家的數量與收款？')) return
    const init = {}
    template.venues.forEach(v => {
      init[v.id] = {
        hasSales: true, ambassadorId: '',
        quantities: Object.fromEntries(v.products.filter(p => p.price !== null).map(p => [p.key, 0])),
        preShiftAmount: 0, preShiftNote: '', note: '',
      }
    })
    setVenueState(init)
    setCash(0); setTransfer(0); setMonthly(0); setUnpaid(0)
    setPaymentStatus('paid'); setErrors([]); setTopNote('')
  }
  function copyYesterday() {
    alert('🗂️ 複製昨天模板（Phase 2）：\n\n目前此功能為占位，未來會從昨天同地區的 venue_sales_daily 讀取最後一筆，\n自動填入大使與數量。\n\n現階段 MVP 請手動輸入。')
  }

  // ---- validation ----
  function validate() {
    const errs = []
    if (!saleDate) errs.push('銷售日期必填')
    if (!template) return errs

    const salesVenues = template.venues.filter(v => {
      const s = venueState[v.id]
      return s?.hasSales && venueTotal(v.id) > 0
    })
    if (salesVenues.length === 0) errs.push('至少一家店家要有銷售（請輸入數量或上班前店家銷售金額）')

    for (const v of salesVenues) {
      const s = venueState[v.id]
      if (!s.ambassadorId) errs.push(`${v.name}: 未選大使`)
    }

    if (Number(cash) < 0 || Number(transfer) < 0 || Number(monthly) < 0 || Number(unpaid) < 0) {
      errs.push('收款金額不可為負數')
    }
    if (paymentTotal > totalSalesAmount + 0.01) {
      errs.push(`收款總額 (NT$ ${paymentTotal.toLocaleString()}) 不可超過銷售總額 (NT$ ${totalSalesAmount.toLocaleString()})`)
    }
    if (totalSalesAmount > 0 && paymentTotal === 0) {
      errs.push('有銷售但尚未填任何收款方式（現金/匯款/月結/未收請至少填一種）')
    }
    return errs
  }

  function handleTrySubmit() {
    const errs = validate()
    setErrors(errs)
    if (errs.length === 0) setConfirming(true)
  }

  // ---- build payload ----
  function buildPayload() {
    const venuesArr = template.venues.map(v => {
      const s = venueState[v.id] || {}
      const amb = ambassadors.find(a => a.id === s.ambassadorId)
      const items = []
      let vt = 0
      for (const p of v.products) {
        if (p.price === null) {
          const amt = Number(s.preShiftAmount || 0)
          if (amt > 0) {
            items.push({
              product_key: p.key, product_name: p.name, category: p.category,
              quantity: 1, unit_price: amt, subtotal: amt,
              source_type: 'pre_shift_venue_sales',
              note: s.preShiftNote || null,
            })
            vt += amt
          }
        } else {
          const qty = Number(s.quantities[p.key]) || 0
          if (qty > 0) {
            const sub = qty * p.price
            items.push({
              product_key: p.key, product_name: p.name, category: p.category,
              quantity: qty, unit_price: p.price, subtotal: sub,
              source_type: 'hotel_manual',
            })
            vt += sub
          }
        }
      }
      return {
        venue_id: v.id, venue_name: v.name,
        ambassador_id: s.ambassadorId || null,
        ambassador_name: amb?.name || null,
        has_sales: !!s.hasSales && items.length > 0,
        items, venue_total: vt,
        note: s.note || null,
      }
    })
    return {
      sale_date: saleDate,
      region, source_type: sourceType,
      venues: venuesArr,
      payment: {
        cash_amount: Number(cash) || 0,
        bank_transfer_amount: Number(transfer) || 0,
        monthly_settlement_amount: Number(monthly) || 0,
        unpaid_amount: Number(unpaid) || 0,
        payment_status: paymentStatus,
      },
      total_sales_amount: totalSalesAmount,
      total_quantity: totalQty,
      idempotency_key: idempotencyKey,
      note: topNote || null,
    }
  }

  async function doSubmit() {
    if (submitting) return
    setSubmitting(true)
    try {
      const res = await oneShot.run(() => submitVenueSalesMatrix(buildPayload()))
      alert(`✓ 已送出（MVP mock）\n\n寫入 ${res.sales_count} 家店的銷售單`)
      navigate('/admin/venue-sales')
    } catch (e) {
      alert('送出失敗：' + (e.message || '未知錯誤'))
      setConfirming(false)
    } finally {
      setSubmitting(false)
    }
  }

  if (!template) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#6a655c' }}>載入地區模板中…</div>
  }

  return (
    <>
      {/* 基本設定 */}
      <Card style={{ marginBottom: 12 }}>
        <SectionTitle>基本設定</SectionTitle>
        <Grid>
          <Field label="銷售日期 *">
            <input type="date" value={saleDate} onChange={e => setSaleDate(e.target.value)} style={input()} />
          </Field>
          <Field label="地區 *">
            <div style={{ display: 'flex', gap: 6 }}>
              {Object.entries(REGIONS).map(([k, v]) => (
                <RadioTile key={k} active={region === k} onClick={() => setRegion(k)} color="#c9a84c" size="sm">{v}</RadioTile>
              ))}
            </div>
          </Field>
          <Field label="來源">
            <select value={sourceType} onChange={e => setSourceType(e.target.value)} style={input()}>
              <option value="hotel_manual_matrix">酒店快速矩陣</option>
              {Object.entries(SOURCE_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
        </Grid>
        <Field label="整日備註（可選）" style={{ marginTop: 10 }}>
          <textarea value={topNote} onChange={e => setTopNote(e.target.value)} rows={1} style={{ ...input(), resize: 'vertical' }} />
        </Field>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button onClick={copyYesterday} style={smallBtn('#3b82f6')}><Copy size={12} /> 複製昨天模板</button>
          <button onClick={clearDay} style={smallBtn('#f87171')}><Trash2 size={12} /> 清空本日</button>
        </div>
      </Card>

      {/* 店家矩陣 */}
      {template.venues.map(v => {
        const s = venueState[v.id] || {}
        return (
          <VenueMatrixCard
            key={v.id} venue={v} state={s}
            ambassadors={ambassadors}
            vtotal={venueTotal(v.id)} vqty={venueQty(v.id)}
            onToggleHasSales={(has) => updateVenue(v.id, { hasSales: has })}
            onChangeAmb={(id) => updateVenue(v.id, { ambassadorId: id })}
            onChangeQty={(key, val) => updateQty(v.id, key, val)}
            onChangePreShift={(val) => updateVenue(v.id, { preShiftAmount: val })}
            onChangePreShiftNote={(val) => updateVenue(v.id, { preShiftNote: val })}
            onChangeNote={(val) => updateVenue(v.id, { note: val })}
          />
        )
      })}

      {/* 收款區 */}
      <Card style={{ marginBottom: 12 }}>
        <SectionTitle>收款資料（全日合計）</SectionTitle>
        <Grid>
          <Field label="現金 (NT$)"><input type="number" min="0" value={cash || ''} onChange={e => setCash(e.target.value)} style={input()} /></Field>
          <Field label="匯款 (NT$)"><input type="number" min="0" value={transfer || ''} onChange={e => setTransfer(e.target.value)} style={input()} /></Field>
          <Field label="月結 (NT$)"><input type="number" min="0" value={monthly || ''} onChange={e => setMonthly(e.target.value)} style={input()} /></Field>
          <Field label="未收 (NT$)"><input type="number" min="0" value={unpaid || ''} onChange={e => setUnpaid(e.target.value)} style={input()} /></Field>
        </Grid>
        <TotalLine label="收款總額" value={paymentTotal} />
        <TotalLine label="差額（銷售 − 收款）" value={difference}
          color={difference === 0 ? '#10b981' : difference > 0 ? '#f59e0b' : '#f87171'}
          note={difference > 0 ? `尚有 NT$ ${difference.toLocaleString()} 未分配到收款方式（可歸為未收）` : (difference < 0 ? `收款超出銷售 NT$ ${Math.abs(difference).toLocaleString()}` : '')}
        />
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, color: '#8a8278', marginBottom: 8, letterSpacing: 1 }}>
            收款狀態　<span style={{ color: '#c9a84c' }}>系統建議：{PAYMENT_STATUSES[suggestedStatus]}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {Object.entries(PAYMENT_STATUSES).map(([k, v]) => (
              <RadioTile key={k} active={paymentStatus === k} onClick={() => setPaymentStatus(k)}
                color={k === 'paid' ? '#10b981' : k === 'partial' ? '#f59e0b' : k === 'monthly' ? '#3b82f6' : '#f87171'}>
                {v}
              </RadioTile>
            ))}
          </div>
        </div>
      </Card>

      {/* Errors */}
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

      {/* 留底部空間給 sticky summary */}
      <div style={{ height: 100 }} />

      {/* Sticky summary bar */}
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0,
        background: 'linear-gradient(180deg, rgba(10,10,10,0.6) 0%, rgba(10,10,10,0.95) 40%)',
        borderTop: '1px solid rgba(201,168,76,0.25)',
        padding: '10px 16px', zIndex: 20,
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Summary label="今日總額" value={`NT$ ${totalSalesAmount.toLocaleString()}`} big color="#c9a84c" />
          <Summary label="總支數" value={`${totalQty} 支`} />
          <Summary label="有銷售" value={`${venuesWithSalesCount} 家`} color="#10b981" />
          <Summary label="未填" value={`${venuesEmptyCount} 家`} color={venuesEmptyCount > 0 ? '#f59e0b' : '#6a655c'} />
          <Summary label="狀態" value={PAYMENT_STATUSES[paymentStatus]} />
          <button onClick={handleTrySubmit} disabled={submitting}
            style={{
              marginLeft: 'auto', padding: '10px 22px', borderRadius: 8, border: 'none',
              background: 'linear-gradient(135deg, #c9a84c 0%, #8b6d2f 100%)',
              color: '#0a0a0a', fontSize: 14, fontWeight: 700, cursor: 'pointer', letterSpacing: 2,
              opacity: submitting ? 0.6 : 1,
            }}>
            {submitting ? '處理中…' : '送出銷售'}
          </button>
        </div>
      </div>

      {confirming && (
        <ConfirmModal
          payload={buildPayload()}
          onCancel={() => setConfirming(false)}
          onConfirm={doSubmit}
          submitting={submitting}
        />
      )}
    </>
  )
}

// =============== VenueMatrixCard ===============

function VenueMatrixCard({
  venue, state, ambassadors,
  vtotal, vqty,
  onToggleHasSales, onChangeAmb, onChangeQty,
  onChangePreShift, onChangePreShiftNote, onChangeNote,
}) {
  const hasSales = state.hasSales !== false
  return (
    <Card style={{ marginBottom: 12, borderLeft: `3px solid ${hasSales ? '#c9a84c' : '#3a332a'}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Store size={18} color={hasSales ? '#c9a84c' : '#5a554e'} />
          <span style={{ fontSize: 16, color: '#e8e0d0', fontWeight: 600 }}>{venue.name}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <RadioTile size="sm" active={hasSales} onClick={() => onToggleHasSales(true)} color="#10b981">有銷售</RadioTile>
          <RadioTile size="sm" active={!hasSales} onClick={() => onToggleHasSales(false)} color="#6b7280"><Minus size={10} /> 今日無銷售</RadioTile>
        </div>
      </div>

      {hasSales ? (
        <>
          <div style={{ marginBottom: 10 }}>
            <Field label="大使 *">
              <select value={state.ambassadorId || ''} onChange={e => onChangeAmb(e.target.value)} style={input()}>
                <option value="">— 請選擇 —</option>
                {ambassadors.map(a => <option key={a.id} value={a.id}>{a.name} ({a.ambassador_code})</option>)}
              </select>
            </Field>
          </div>

          {/* 商品矩陣 */}
          <div style={{ overflowX: 'auto', marginBottom: 10 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 600 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(201,168,76,0.2)' }}>
                  <th style={cellHead()}>商品</th>
                  {venue.products.map(p => (
                    <th key={p.key} style={cellHead(true)}>
                      <div style={{ color: '#e8e0d0', fontWeight: 500 }}>{p.name}</div>
                      <div style={{ color: '#c9a84c', fontSize: 10, marginTop: 2 }}>
                        {p.price === null ? '手填金額' : `NT$ ${p.price.toLocaleString()}`}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={cellLabel()}>數量</td>
                  {venue.products.map(p => {
                    if (p.price === null) {
                      return (
                        <td key={p.key} style={cellBody()}>
                          <input type="number" min="0" value={state.preShiftAmount || ''}
                            onChange={e => onChangePreShift(e.target.value)}
                            placeholder="金額"
                            style={numInput()}
                          />
                        </td>
                      )
                    }
                    const qty = state.quantities?.[p.key] ?? 0
                    return (
                      <td key={p.key} style={cellBody()}>
                        <input type="number" min="0" value={qty || ''}
                          onChange={e => onChangeQty(p.key, e.target.value)}
                          style={numInput()}
                        />
                      </td>
                    )
                  })}
                </tr>
                <tr>
                  <td style={cellLabel('#8a8278')}>小計</td>
                  {venue.products.map(p => {
                    const subtotal = p.price === null
                      ? Number(state.preShiftAmount || 0)
                      : (Number(state.quantities?.[p.key]) || 0) * p.price
                    return (
                      <td key={p.key} style={{ ...cellBody(), color: subtotal > 0 ? '#c9a84c' : '#5a554e', fontSize: 12 }}>
                        NT$ {subtotal.toLocaleString()}
                      </td>
                    )
                  })}
                </tr>
              </tbody>
            </table>
          </div>

          {/* 上班前店家銷售備註 */}
          {Number(state.preShiftAmount || 0) > 0 && (
            <Field label="上班前銷售備註（選填）" style={{ marginTop: 8 }}>
              <input value={state.preShiftNote || ''} onChange={e => onChangePreShiftNote(e.target.value)}
                placeholder="例：店家原本已銷售、交接前銷售、訂桌..."
                style={input()} />
            </Field>
          )}

          {/* 店家備註 */}
          <Field label="店家備註（選填）" style={{ marginTop: 8 }}>
            <input value={state.note || ''} onChange={e => onChangeNote(e.target.value)} style={input()} />
          </Field>

          {/* 店家合計 */}
          <div style={{
            marginTop: 10, padding: '8px 12px',
            background: 'rgba(201,168,76,0.06)',
            border: '1px solid rgba(201,168,76,0.2)', borderRadius: 6,
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          }}>
            <span style={{ fontSize: 11, color: '#8a8278' }}>店家合計 · {vqty} 支</span>
            <span style={{ fontSize: 16, color: '#c9a84c', fontWeight: 700 }}>NT$ {vtotal.toLocaleString()}</span>
          </div>
        </>
      ) : (
        <div style={{ padding: 16, textAlign: 'center', color: '#6a655c', fontSize: 13, background: 'rgba(255,255,255,0.02)', borderRadius: 6 }}>
          今日無銷售（數量將不計入）
          <Field label="備註（選填）" style={{ marginTop: 10, maxWidth: 400, marginLeft: 'auto', marginRight: 'auto', textAlign: 'left' }}>
            <input value={state.note || ''} onChange={e => onChangeNote(e.target.value)} placeholder="例：店家休息 / 大使請假"
              style={input()} />
          </Field>
        </div>
      )}
    </Card>
  )
}

// =============== ConfirmModal ===============

function ConfirmModal({ payload, onCancel, onConfirm, submitting }) {
  const withSales = payload.venues.filter(v => v.has_sales)
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#111', border: '1px solid #c9a84c44', borderRadius: 12, maxWidth: 600, width: '100%', maxHeight: '90vh', overflow: 'auto', padding: 20 }}>
        <div style={{ fontSize: 11, color: '#c9a84c', letterSpacing: 3, marginBottom: 4 }}>確認送出</div>
        <h2 style={{ fontSize: 18, color: '#e8e0d0', margin: 0, marginBottom: 14 }}>{payload.sale_date} · {REGIONS[payload.region]}</h2>

        {withSales.map(v => (
          <div key={v.venue_id} style={{ marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid #2a2520' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ color: '#e8e0d0', fontWeight: 500 }}>{v.venue_name}</span>
              <span style={{ color: '#8a8278', fontSize: 11 }}>{v.ambassador_name || '—'}</span>
            </div>
            {v.items.map((it, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: 11, color: '#8a8278' }}>
                <span>{it.product_name} × {it.quantity}</span>
                <span style={{ color: '#e8e0d0' }}>NT$ {it.subtotal.toLocaleString()}</span>
              </div>
            ))}
            <div style={{ marginTop: 4, display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: '#8a8278' }}>店家合計</span>
              <span style={{ color: '#c9a84c', fontWeight: 600 }}>NT$ {v.venue_total.toLocaleString()}</span>
            </div>
          </div>
        ))}

        <div style={{ padding: '10px 12px', background: 'rgba(201,168,76,0.06)', borderRadius: 6, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#8a8278', fontSize: 12 }}>今日總額</span>
            <span style={{ color: '#c9a84c', fontSize: 18, fontWeight: 700 }}>NT$ {payload.total_sales_amount.toLocaleString()}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: '#8a8278' }}>
            <span>共 {withSales.length} 家 · {payload.total_quantity} 支</span>
            <span>狀態：{PAYMENT_STATUSES[payload.payment.payment_status]}</span>
          </div>
        </div>

        <div style={{ fontSize: 11, color: '#8a8278', marginBottom: 12 }}>
          收款：現金 NT$ {payload.payment.cash_amount.toLocaleString()} · 匯款 NT$ {payload.payment.bank_transfer_amount.toLocaleString()}
          {' · '}月結 NT$ {payload.payment.monthly_settlement_amount.toLocaleString()}
          {' · '}未收 NT$ {payload.payment.unpaid_amount.toLocaleString()}
        </div>

        <div style={{ fontSize: 10, color: '#5a554e', fontFamily: 'monospace', marginBottom: 12 }}>
          idempotency_key: {payload.idempotency_key.slice(0, 13)}…
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
          <button onClick={onCancel} disabled={submitting} style={modalBtn('#6b7280')}>取消</button>
          <button onClick={onConfirm} disabled={submitting} style={modalBtn('#10b981', true)}>
            <Check size={14} /> 確認送出 {withSales.length} 家
          </button>
        </div>
      </div>
    </div>
  )
}

// =============== 共用小組件與 styles ===============

function SectionTitle({ children }) {
  return <div style={{ fontSize: 11, color: '#8a8278', letterSpacing: 2, marginBottom: 10 }}>{children}</div>
}
function Grid({ children }) {
  return <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(160px, 1fr))`, gap: 10 }}>{children}</div>
}
function Field({ label, children, style }) {
  return (
    <div style={style}>
      <div style={{ fontSize: 10, color: '#8a8278', marginBottom: 4, letterSpacing: 1 }}>{label}</div>
      {children}
    </div>
  )
}
function TotalLine({ label, value, color = '#e8e0d0', note }) {
  return (
    <div style={{ marginTop: 10, padding: '10px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 12, color: '#8a8278' }}>{label}</span>
        <span style={{ fontSize: 15, color, fontWeight: 600 }}>NT$ {Number(value || 0).toLocaleString()}</span>
      </div>
      {note && <div style={{ fontSize: 10, color: '#8a8278', marginTop: 4 }}>{note}</div>}
    </div>
  )
}
function RadioTile({ active, onClick, color, children, size }) {
  const padY = size === 'sm' ? 6 : 10
  const padX = size === 'sm' ? 10 : 6
  return (
    <button onClick={onClick} style={{
      padding: `${padY}px ${padX}px`, borderRadius: 6,
      background: active ? `${color}22` : 'rgba(255,255,255,0.02)',
      border: `1px solid ${active ? color : '#2a2520'}`,
      color: active ? color : '#8a8278', fontSize: 12, cursor: 'pointer',
      fontWeight: active ? 600 : 400, display: 'inline-flex', alignItems: 'center', gap: 4,
    }}>{children}</button>
  )
}
function Summary({ label, value, color = '#e8e0d0', big }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
      <span style={{ fontSize: 10, color: '#6a655c', letterSpacing: 1 }}>{label}</span>
      <span style={{ fontSize: big ? 18 : 13, color, fontWeight: big ? 700 : 500 }}>{value}</span>
    </div>
  )
}

function input() {
  return { width: '100%', padding: '10px 12px', background: '#1a1714', border: '1px solid #2a2520', borderRadius: 8, color: '#e8dcc8', fontSize: 14, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }
}
function numInput() {
  return { width: '100%', padding: '6px 8px', background: '#1a1714', border: '1px solid #2a2520', borderRadius: 6, color: '#e8dcc8', fontSize: 13, textAlign: 'right', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }
}
function smallBtn(color) {
  return { background: `${color}22`, border: `1px solid ${color}44`, color, padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }
}
function modalBtn(color, filled = false) {
  return { padding: '12px 8px', borderRadius: 8, background: filled ? `${color}22` : 'transparent', border: `1px solid ${color}66`, color, cursor: 'pointer', fontSize: 13, fontWeight: 500, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }
}
function cellHead(centered) {
  return { padding: '8px 6px', fontSize: 10, color: '#8a8278', fontWeight: 500, textAlign: centered ? 'center' : 'left', letterSpacing: 1, whiteSpace: 'nowrap' }
}
function cellLabel(color = '#c9a84c') {
  return { padding: '8px 6px', fontSize: 11, color, fontWeight: 500, whiteSpace: 'nowrap' }
}
function cellBody() {
  return { padding: '8px 6px', textAlign: 'center' }
}
