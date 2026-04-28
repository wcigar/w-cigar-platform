// src/pages/admin/VenueSalesMatrix.jsx
// 快速矩陣模式 — 對齊 Excel「2026雪茄銷量.xlsx」人工 Key-in 格式
// 特性：
//  - 地區切換：台北（22 家）/ 台中（5 家）
//  - 搜尋店家、只看有銷售、一鍵展開 / 收合
//  - 每家店卡片預設「收合」，點擊標頭展開
//  - 每家店統一支援「上班前店家銷售」（所有店，不限台中）
//  - payload / validation / builder 全部從 service 讀取
import { useEffect, useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle, Check, Trash2, Copy, Store, Minus, Search,
  ChevronDown, ChevronUp, Eye, EyeOff,
} from 'lucide-react'
import {
  getVenueSalesMatrixTemplate, getVenueSalesAmbassadors, submitVenueSalesMatrix,
  buildVenueSalesMatrixPayload, validateVenueSalesMatrix,
  todayISO, SOURCE_TYPES, REGIONS,
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
  const [sourceType, setSourceType] = useState('hotel_excel_matrix')
  const [topNote, setTopNote] = useState('')

  // ---- template & state ----
  const [template, setTemplate] = useState(null)
  const [ambassadors, setAmbassadors] = useState([])
  const [venueState, setVenueState] = useState({})

  // ---- UI ----
  const [searchQuery, setSearchQuery] = useState('')
  const [onlyWithSales, setOnlyWithSales] = useState(false)
  const [collapsed, setCollapsed] = useState({})     // { venueId: true/false }
  const [submitting, setSubmitting] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [errors, setErrors] = useState([])
  const [idempotencyKey, setIdempotencyKey] = useState(() => newIdempotencyKey())

  useEffect(() => { getVenueSalesAmbassadors(region).then(setAmbassadors).catch(console.error) }, [region])

  // 切換地區：若當前已有輸入資料，先 confirm
  function changeRegion(newRegion) {
    if (newRegion === region) return
    const hasData = Object.values(venueState).some(s => {
      if (!s) return false
      if (Object.values(s.quantities || {}).some(q => Number(q) > 0)) return true
      if (Number(s.preShiftAmount || 0) > 0) return true
      if (s.ambassadorId || s.note || s.preShiftNote) return true
      return false
    })
    if (hasData && !window.confirm(`切換到「${REGIONS[newRegion]}」會清空當前輸入的資料，確定繼續？`)) return
    setRegion(newRegion)
  }

  useEffect(() => {
    try { localStorage.setItem(LAST_REGION_KEY, region) } catch {}
    getVenueSalesMatrixTemplate(region).then(tpl => {
      setTemplate(tpl)
      const initState = {}
      const initCollapsed = {}
      tpl.venues.forEach(v => {
        initState[v.id] = {
          hasSales: true,
          ambassadorId: '',
          ambassadorRawName: '',
          quantities: Object.fromEntries(v.products.map(p => [p.key, 0])),
          preShiftAmount: 0,
          preShiftNote: '',
          note: '',
        }
        initCollapsed[v.id] = tpl.venues.length > 6   // 超過 6 家預設收合
      })
      setVenueState(initState)
      setCollapsed(initCollapsed)
      setErrors([])
      setTopNote('')
      setIdempotencyKey(newIdempotencyKey())
    })
  }, [region])

  // ---- helpers ----
  const venueTotal = useCallback((vid) => {
    if (!template) return 0
    const v = template.venues.find(x => x.id === vid)
    const s = venueState[vid]
    if (!v || !s || !s.hasSales) return 0
    let total = 0
    for (const p of v.products) total += (Number(s.quantities[p.key]) || 0) * p.price
    total += Number(s.preShiftAmount || 0)
    return total
  }, [template, venueState])

  const venueQty = useCallback((vid) => {
    if (!template) return 0
    const v = template.venues.find(x => x.id === vid)
    const s = venueState[vid]
    if (!v || !s || !s.hasSales) return 0
    let qty = 0
    for (const p of v.products) qty += Number(s.quantities[p.key]) || 0
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

  const activeVenues = useMemo(
    () => (template?.venues || []).filter(v => (venueState[v.id]?.hasSales) && venueTotal(v.id) > 0),
    [template, venueState, venueTotal]
  )
  const noSalesVenues = useMemo(
    () => (template?.venues || []).filter(v => venueState[v.id]?.hasSales === false),
    [template, venueState]
  )
  const blankVenues = useMemo(
    () => (template?.venues || []).length - activeVenues.length - noSalesVenues.length,
    [template, activeVenues, noSalesVenues]
  )

  // 可見店家（搜尋 + 只看有銷售）
  const visibleVenues = useMemo(() => {
    if (!template) return []
    let list = template.venues
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      list = list.filter(v => v.name.toLowerCase().includes(q))
    }
    if (onlyWithSales) {
      list = list.filter(v => {
        const s = venueState[v.id]
        if (!s || !s.hasSales) return false
        const hasQty = Object.values(s.quantities || {}).some(q => Number(q) > 0)
        return hasQty || Number(s.preShiftAmount || 0) > 0
      })
    }
    return list
  }, [template, searchQuery, onlyWithSales, venueState])

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
  function toggleCollapse(vid) {
    setCollapsed(prev => ({ ...prev, [vid]: !prev[vid] }))
  }
  function expandAll() {
    const next = {}; template.venues.forEach(v => { next[v.id] = false }); setCollapsed(next)
  }
  function collapseAll() {
    const next = {}; template.venues.forEach(v => { next[v.id] = true }); setCollapsed(next)
  }
  function clearDay() {
    if (!window.confirm('清空本日所有店家的數量、收款與備註？')) return
    const init = {}
    template.venues.forEach(v => {
      init[v.id] = {
        hasSales: true, ambassadorId: '', ambassadorRawName: '',
        quantities: Object.fromEntries(v.products.map(p => [p.key, 0])),
        preShiftAmount: 0, preShiftNote: '', note: '',
      }
    })
    setVenueState(init)
    setErrors([])
    setTopNote('')
    setIdempotencyKey(newIdempotencyKey())
  }
  function copyYesterday() {
    alert('🗂️ 複製昨天模板（Phase 2）\n\n目前為占位，未來會從昨天同地區最後一筆自動帶入大使與數量。')
  }

  // ---- build / submit ----
  function buildCurrentPayload() {
    return buildVenueSalesMatrixPayload({
      saleDate, region, topNote, template, ambassadors, venueState,
      idempotencyKey,
    })
  }

  function handleTrySubmit() {
    const errs = validateVenueSalesMatrix({
      saleDate, region, template, venueState,
    })
    setErrors(errs)
    if (errs.length === 0) {
      setConfirming(true)
    } else {
      // 員工常看不到上方錯誤卡，明確 alert + scroll
      alert('請先修正以下 ' + errs.length + ' 項：\n\n' + errs.map((e, i) => `${i + 1}. ${e}`).join('\n'))
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  async function doSubmit() {
    if (submitting) return
    setSubmitting(true)
    try {
      const payload = buildCurrentPayload()
      const res = await oneShot.run(() => submitVenueSalesMatrix(payload))
      if (!res) {
        // oneShot 被 lock 攔下（500ms 內已有送出 in-flight）
        alert('送出處理中，請稍候再試')
        return
      }
      if (res.success === false) {
        alert('送出失敗：' + (res.error || '未知錯誤'))
        setConfirming(false)
        return
      }
      alert(`✓ 已送出 ${res.sales_count} 家店的銷售單${res.inventory_deducted ? `\n（庫存已自動扣減 ${res.inventory_deducted} 項）` : ''}`)
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
                <RadioTile key={k} active={region === k} onClick={() => changeRegion(k)} color="#c9a84c" size="sm">{v}</RadioTile>
              ))}
            </div>
          </Field>
          <Field label="來源">
            <select value={sourceType} onChange={e => setSourceType(e.target.value)} style={input()}>
              <option value="hotel_excel_matrix">Excel 矩陣</option>
              {Object.entries(SOURCE_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
        </Grid>
        <Field label="整日備註（可選）" style={{ marginTop: 10 }}>
          <textarea value={topNote} onChange={e => setTopNote(e.target.value)} rows={1} style={{ ...input(), resize: 'vertical' }} />
        </Field>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <button onClick={copyYesterday} style={smallBtn('#3b82f6')}><Copy size={12} /> 複製昨天模板</button>
          <button onClick={clearDay} style={smallBtn('#f87171')}><Trash2 size={12} /> 清空本日</button>
        </div>
      </Card>

      {/* 店家控制列：搜尋 / 篩選 / 展開收合 */}
      <Card style={{ marginBottom: 12, padding: '10px 16px' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '1 1 200px', minWidth: 180 }}>
            <Search size={14} color="#8a8278" />
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder={`搜尋店家（共 ${template.venues.length} 家）`}
              style={{ ...input(), padding: '6px 8px', fontSize: 13 }} />
          </div>
          <button onClick={() => setOnlyWithSales(!onlyWithSales)}
            style={smallBtn(onlyWithSales ? '#10b981' : '#6b7280')}>
            {onlyWithSales ? <Eye size={12} /> : <EyeOff size={12} />} {onlyWithSales ? '只看有銷售' : '全部顯示'}
          </button>
          <button onClick={expandAll} style={smallBtn('#c9a84c')}><ChevronDown size={12} /> 展開全部</button>
          <button onClick={collapseAll} style={smallBtn('#8a8278')}><ChevronUp size={12} /> 收合全部</button>
          <span style={{ fontSize: 11, color: '#8a8278', marginLeft: 'auto' }}>
            顯示 {visibleVenues.length} / {template.venues.length} 家
          </span>
        </div>
      </Card>

      {/* 店家矩陣 */}
      {visibleVenues.length === 0 ? (
        <Card style={{ padding: 24, textAlign: 'center', color: '#6a655c', fontSize: 13 }}>
          沒有符合條件的店家 — 請調整搜尋或篩選
        </Card>
      ) : visibleVenues.map(v => {
        const s = venueState[v.id] || {}
        const isCollapsed = !!collapsed[v.id]
        return (
          <VenueMatrixCard
            key={v.id} venue={v} state={s}
            ambassadors={ambassadors}
            vtotal={venueTotal(v.id)} vqty={venueQty(v.id)}
            isCollapsed={isCollapsed}
            onToggleCollapse={() => toggleCollapse(v.id)}
            onToggleHasSales={(has) => updateVenue(v.id, { hasSales: has })}
            onChangeAmb={(id, displayName) => updateVenue(v.id, { ambassadorId: id, ambassadorRawName: displayName })}
            onChangeQty={(key, val) => updateQty(v.id, key, val)}
            onChangePreShift={(val) => updateVenue(v.id, { preShiftAmount: val })}
            onChangePreShiftNote={(val) => updateVenue(v.id, { preShiftNote: val })}
            onChangeNote={(val) => updateVenue(v.id, { note: val })}
          />
        )
      })}

      {/* 收款區已移除：所有酒店都是月結，督導每月 10 號前去收款 */}

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

      {/* 留底部空間給 sticky */}
      <div style={{ height: 100 }} />

      {/* Sticky summary */}
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0,
        background: 'linear-gradient(180deg, rgba(10,10,10,0.6) 0%, rgba(10,10,10,0.95) 40%)',
        borderTop: '1px solid rgba(201,168,76,0.25)',
        padding: '10px 16px', zIndex: 20,
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Summary label="今日總額" value={`NT$ ${totalSalesAmount.toLocaleString()}`} big color="#c9a84c" />
          <Summary label="總支數" value={`${totalQty} 支`} />
          <Summary label="有銷售" value={`${activeVenues.length} 家`} color="#10b981" />
          <Summary label="無銷售" value={`${noSalesVenues.length} 家`} color="#6b7280" />
          <Summary label="未填" value={`${blankVenues} 家`} color={blankVenues > 0 ? '#f59e0b' : '#6a655c'} />
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
          payload={buildCurrentPayload()}
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
  venue, state, ambassadors, vtotal, vqty,
  isCollapsed, onToggleCollapse,
  onToggleHasSales, onChangeAmb, onChangeQty,
  onChangePreShift, onChangePreShiftNote, onChangeNote,
}) {
  const hasSales = state.hasSales !== false

  return (
    <Card style={{ marginBottom: 10, borderLeft: `3px solid ${hasSales ? (vtotal > 0 ? '#c9a84c' : '#3a332a') : '#6b7280'}` }}>
      {/* Header: 可點擊收合 */}
      <div
        onClick={onToggleCollapse}
        style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', flexWrap: 'wrap', padding: '2px 0' }}>
        <Store size={18} color={hasSales ? (vtotal > 0 ? '#c9a84c' : '#6a655c') : '#5a554e'} />
        <span style={{ fontSize: 16, color: '#e8e0d0', fontWeight: 600 }}>{venue.name}</span>
        {venue.note && <span style={{ fontSize: 10, color: '#8a8278' }}>· {venue.note}</span>}
        {venue.settlement_hint && <span style={{ fontSize: 10, color: '#fbbf24', background: 'rgba(251,191,36,0.1)', padding: '1px 6px', borderRadius: 4 }}>{venue.settlement_hint}</span>}
        {vtotal > 0 && (
          <span style={{ marginLeft: 'auto', fontSize: 14, color: '#c9a84c', fontWeight: 600 }}>
            NT$ {vtotal.toLocaleString()} <span style={{ fontSize: 11, color: '#8a8278', marginLeft: 4 }}>· {vqty} 支</span>
          </span>
        )}
        {!hasSales && <span style={{ marginLeft: 'auto', fontSize: 11, color: '#6a655c' }}>今日無銷售</span>}
        <span style={{ color: '#8a8278', marginLeft: vtotal > 0 || !hasSales ? 8 : 'auto' }}>
          {isCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </span>
      </div>

      {!isCollapsed && (
        <div style={{ marginTop: 10 }}>
          {/* 有/無銷售 toggle */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <RadioTile size="sm" active={hasSales} onClick={() => onToggleHasSales(true)} color="#10b981">有銷售</RadioTile>
            <RadioTile size="sm" active={!hasSales} onClick={() => onToggleHasSales(false)} color="#6b7280"><Minus size={10} /> 今日無銷售</RadioTile>
          </div>

          {hasSales ? (
            <>
              {/* 大使（按店家綁定過濾；點「顯示全部」可 admin override） */}
              <Field label="大使 *">
                <VenueAmbassadorPicker
                  venue={venue}
                  ambassadors={ambassadors}
                  selectedId={state.ambassadorId || ''}
                  onChange={onChangeAmb}
                />
              </Field>

              {/* 商品矩陣 */}
              {venue.products.length > 0 && (
                <div style={{ overflowX: 'auto', margin: '10px 0' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 600 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(201,168,76,0.2)' }}>
                        <th style={cellHead()}>商品</th>
                        {venue.products.map(p => (
                          <th key={p.key} style={cellHead(true)}>
                            <div style={{ color: '#e8e0d0', fontWeight: 500 }}>{p.name}</div>
                            <div style={{ color: '#c9a84c', fontSize: 10, marginTop: 2 }}>NT$ {p.price.toLocaleString()}</div>
                            {p.note && <div style={{ color: '#8a8278', fontSize: 9, marginTop: 2 }}>{p.note}</div>}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={cellLabel()}>數量</td>
                        {venue.products.map(p => {
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
                          const subtotal = (Number(state.quantities?.[p.key]) || 0) * p.price
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
              )}

              {/* 上班前店家銷售（統一獨立區塊） */}
              <div style={{
                marginTop: 10, padding: 10,
                background: 'rgba(59,130,246,0.04)',
                border: '1px dashed rgba(59,130,246,0.3)', borderRadius: 6,
              }}>
                <div style={{ fontSize: 10, color: '#8a8278', marginBottom: 6, letterSpacing: 1 }}>上班前店家銷售（選填）</div>
                <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 8 }}>
                  <input type="number" min="0" value={state.preShiftAmount || ''}
                    onChange={e => onChangePreShift(e.target.value)}
                    placeholder="金額 NT$"
                    style={input()}
                  />
                  <input value={state.preShiftNote || ''} onChange={e => onChangePreShiftNote(e.target.value)}
                    placeholder="備註（例：店家原有銷售、交接前...）"
                    style={input()} />
                </div>
              </div>

              {/* 店家備註 */}
              <Field label="店家備註（選填）" style={{ marginTop: 10 }}>
                <input value={state.note || ''} onChange={e => onChangeNote(e.target.value)} style={input()} />
              </Field>

              {/* 店家合計 */}
              <div style={{
                marginTop: 10, padding: '8px 12px',
                background: 'rgba(201,168,76,0.06)',
                border: '1px solid rgba(201,168,76,0.2)', borderRadius: 6,
                display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
              }}>
                <span style={{ fontSize: 11, color: '#8a8278' }}>店家合計 · {vqty} 支（不含上班前）</span>
                <span style={{ fontSize: 16, color: '#c9a84c', fontWeight: 700 }}>NT$ {vtotal.toLocaleString()}</span>
              </div>
            </>
          ) : (
            <div style={{ padding: 16, textAlign: 'center', color: '#6a655c', fontSize: 13, background: 'rgba(255,255,255,0.02)', borderRadius: 6 }}>
              今日無銷售（不計入總額）
              <Field label="備註（選填）" style={{ marginTop: 10, maxWidth: 400, marginLeft: 'auto', marginRight: 'auto', textAlign: 'left' }}>
                <input value={state.note || ''} onChange={e => onChangeNote(e.target.value)} placeholder="例：店家休息 / 大使請假"
                  style={input()} />
              </Field>
            </div>
          )}
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
        <h2 style={{ fontSize: 18, color: '#e8e0d0', margin: 0, marginBottom: 14 }}>
          {payload.sale_date} · {REGIONS[payload.region]} · 模板 v{payload.template_version}
        </h2>

        {withSales.map(v => (
          <div key={v.venue_id} style={{ marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid #2a2520' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ color: '#e8e0d0', fontWeight: 500 }}>{v.venue_name}</span>
              <span style={{ color: '#8a8278', fontSize: 11 }}>
                {v.ambassador_name || '—'}{v.performance_note ? ` · ${v.performance_note}` : ''}
              </span>
            </div>
            {v.products.map((it, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: 11, color: '#8a8278' }}>
                <span>{it.product_name} × {it.quantity}</span>
                <span style={{ color: '#e8e0d0' }}>NT$ {it.subtotal.toLocaleString()}</span>
              </div>
            ))}
            {v.pre_shift_sales && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: 11, color: '#93c5fd' }}>
                <span>上班前店家銷售{v.pre_shift_sales.note ? `（${v.pre_shift_sales.note}）` : ''}</span>
                <span>NT$ {v.pre_shift_sales.amount.toLocaleString()}</span>
              </div>
            )}
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
            <span>{payload.active_venue_count} 家有銷售 · {payload.no_sales_venue_count} 家無銷售 · {payload.blank_venue_count} 家未填 · 共 {payload.total_quantity} 支</span>
            <span style={{ color: '#3b82f6' }}>月結（督導每月 10 號收款）</span>
          </div>
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

// =============== 共用小組件 ===============

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


// =============== VenueAmbassadorPicker ===============
// 依 venue.assigned_ambassador_codes 過濾大使下拉。
//   - 已綁定（codes 非空）→ 只列綁定的；右側「全部」按鈕可 admin override
//   - 未綁定（codes 為空）→ 顯示全部 + 黃色提示「此店尚未綁定大使，請至『店家管理』設定」
function VenueAmbassadorPicker({ venue, ambassadors, selectedId, onChange }) {
  const [showAll, setShowAll] = useState(false)
  const codes = (venue && venue.assigned_ambassador_codes) || []
  const hasBinding = codes.length > 0
  const list = (!hasBinding || showAll)
    ? ambassadors
    : ambassadors.filter(a => codes.includes(a.id))

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <select
          value={selectedId}
          onChange={e => {
            const amb = ambassadors.find(a => a.id === e.target.value)
            onChange(e.target.value, amb?.displayName || '')
          }}
          style={{ ...input(), flex: 1 }}>
          <option value="">— 請選擇 —</option>
          {list.map(a => <option key={a.id} value={a.id}>{a.displayName}</option>)}
        </select>
        {hasBinding && (
          <button
            type="button"
            onClick={() => setShowAll(s => !s)}
            title={showAll ? '只顯示綁定大使' : '顯示全部大使（admin override）'}
            style={{
              padding: '6px 10px', fontSize: 11, borderRadius: 6,
              border: '1px solid ' + (showAll ? '#f59e0b' : '#2a2520'),
              background: showAll ? 'rgba(245,158,11,0.15)' : 'transparent',
              color: showAll ? '#f59e0b' : '#8a8278', cursor: 'pointer', whiteSpace: 'nowrap',
            }}>
            {showAll ? '全部 ✓' : '全部'}
          </button>
        )}
      </div>
      {!hasBinding && (
        <div style={{ marginTop: 4, fontSize: 11, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 4 }}>
          <AlertTriangle size={11} /> 此店尚未綁定大使 — 請至「店家管理」設定，避免每天重複過濾全部 20 位
        </div>
      )}
      {hasBinding && showAll && (
        <div style={{ marginTop: 4, fontSize: 11, color: '#f59e0b' }}>
          ⚠ 已展開全部大使（admin override）— 提交後系統會記錄此選擇
        </div>
      )}
    </div>
  )
}
