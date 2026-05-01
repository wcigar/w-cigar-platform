// ============================================================
// FactorySubmit — 古巴/多明尼加員工專用報關提交頁
// 公開 URL: /customs/submit (無需登入)
// 中文 UI 介面 + 自動產生 3 份英文海關 PDF
// ============================================================
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Plus, Trash2, X, ChevronRight, FileText, Download, Check, Briefcase } from 'lucide-react'
import {
  generateAllDocs, downloadPdf, sharePdfFiles, computeShipmentTotals,
} from '../../lib/services/customsPdf'

export default function FactorySubmit() {
  const [step, setStep] = useState(1)
  const [supplier, setSupplier] = useState(null)
  const [defaultBuyer, setDefaultBuyer] = useState(null)
  const [products, setProducts] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(null)
  const [showCustom, setShowCustom] = useState(false)
  const [customForm, setCustomForm] = useState(null)
  const [showBrowse, setShowBrowse] = useState(false)

  const [draft, setDraft] = useState({
    shipment_no: 'INV-' + new Date().toISOString().slice(2,10).replace(/-/g,'') + '-' + Math.floor(Math.random()*900+100),
    shipment_date: new Date().toISOString().slice(0, 10),
    package_count: 1,
    shipment_method: 'Passenger checked baggage',
    invoice_terms: 'FOB, ex-Factory',
    items: [],
  })

  useEffect(() => {
    Promise.all([
      supabase.from('customs_suppliers').select('*').eq('is_default', true).limit(1).single(),
      supabase.from('customs_buyers').select('*').eq('is_default', true).limit(1).single(),
      supabase.from('customs_products').select('*').eq('enabled', true).order('sort_order'),
    ]).then(([sR, bR, pR]) => {
      setSupplier(sR.data || null)
      setDefaultBuyer(bR.data || null)
      setProducts(pR.data || [])
    })
  }, [])

  function addItem(p) {
    if (draft.items.some(i => i.product_id === p.id)) return
    setDraft(d => ({
      ...d,
      items: [...d.items, {
        product_id: p.id, name: p.name,
        pcs_per_bundle: p.pcs_per_bundle, package_type: p.package_type,
        unit_price_usd: p.unit_price_usd, unit_weight_g: p.unit_weight_g,
        hs_code: p.hs_code || '2402.10.00.00-8',
        qty_bundles: 1, total_pcs: p.pcs_per_bundle,
        subtotal: +(p.pcs_per_bundle * p.unit_price_usd).toFixed(2),
      }],
    }))
    setShowBrowse(false)
  }

  function addCustomItem() {
    const c = customForm
    if (!c?.name || !c.pcs_per_bundle || c.unit_price_usd === undefined) {
      alert('請填寫產品名稱、支/箱、單價')
      return
    }
    setDraft(d => ({
      ...d,
      items: [...d.items, {
        product_id: null, name: c.name,
        pcs_per_bundle: +c.pcs_per_bundle, package_type: c.package_type || 'Box',
        unit_price_usd: +c.unit_price_usd, unit_weight_g: 14,
        hs_code: '2402.10.00.00-8',
        qty_bundles: +c.qty_bundles || 1,
        total_pcs: (+c.qty_bundles || 1) * (+c.pcs_per_bundle),
        subtotal: +((+c.qty_bundles || 1) * (+c.pcs_per_bundle) * (+c.unit_price_usd)).toFixed(2),
        custom: true,
      }],
    }))
    setCustomForm(null); setShowCustom(false)
  }

  function updateItem(idx, field, value) {
    setDraft(d => {
      const items = [...d.items]
      items[idx] = { ...items[idx], [field]: value }
      const tp = (items[idx].qty_bundles || 0) * (items[idx].pcs_per_bundle || 0)
      items[idx].total_pcs = tp
      items[idx].subtotal = +(tp * (items[idx].unit_price_usd || 0)).toFixed(2)
      return { ...d, items }
    })
  }

  function removeItem(idx) {
    setDraft(d => ({ ...d, items: d.items.filter((_, i) => i !== idx) }))
  }

  async function submit() {
    if (!supplier || !defaultBuyer) { alert('系統設定載入中，請稍後再試'); return }
    if (draft.items.length === 0) { alert('請至少加入一項產品'); return }
    setSubmitting(true)
    const totals = computeShipmentTotals(draft.items)
    const shipment = {
      ...draft, ...totals,
      buyer_name: defaultBuyer.name,
      buyer_address: defaultBuyer.address,
      hs_code: '2402.10.00.00-8',
      total_packages: `${draft.package_count} ${draft.package_count > 1 ? 'CTNs' : 'CTN'}`,
    }
    const { error } = await supabase.from('customs_shipments').insert({
      shipment_no: shipment.shipment_no,
      shipment_date: shipment.shipment_date,
      supplier_id: supplier.id,
      buyer_name: shipment.buyer_name,
      buyer_address: shipment.buyer_address,
      shipment_method: shipment.shipment_method,
      total_packages: shipment.total_packages,
      package_count: shipment.package_count,
      package_unit: 'CTN',
      invoice_terms: shipment.invoice_terms,
      hs_code: shipment.hs_code,
      items: shipment.items,
      total_bundles: totals.total_bundles,
      total_sticks: totals.total_sticks,
      total_amount_usd: totals.total_amount_usd,
      total_net_weight_kg: totals.total_net_weight_kg,
      status: 'submitted',
      source: 'factory_link',
    })
    setSubmitting(false)
    if (error) { alert('提交失敗: ' + error.message); return }
    const docs = generateAllDocs({ supplier, shipment })
    setSuccess({ shipment, docs })
    setStep(3)
  }

  async function downloadAll(action) {
    if (!success) return
    const { shipment, docs } = success
    const files = [
      { doc: docs.packingList, filename: `PackingList_${shipment.shipment_no}.pdf` },
      { doc: docs.coo,         filename: `CertificateOfOrigin_${shipment.shipment_no}.pdf` },
      { doc: docs.invoice,     filename: `CommercialInvoice_${shipment.shipment_no}.pdf` },
    ]
    if (action === 'share') await sharePdfFiles(files)
    else files.forEach(f => downloadPdf(f.doc, f.filename))
  }

  if (!supplier || !defaultBuyer) return <div style={S.loading}>載入中…</div>

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div style={S.logoBox}>
          <div style={S.tdeBox}>TDE</div>
          <div style={S.logoSep}></div>
          <div>
            <div style={S.brandSmall}>TABACOS</div>
            <div style={S.brandLarge}>DON ESTEBAN</div>
          </div>
        </div>
        <div style={S.headerSub}>{supplier.address}</div>
        <div style={S.headerSub}>Tel: {supplier.tel} · {supplier.email}</div>
      </div>
      <div style={S.titleBar}>
        <FileText size={22} style={{ verticalAlign: -3, marginRight: 8 }} /> 報關文件提交
      </div>
      <div style={S.subtitle}>工廠員工專用 — 自動產生 3 份英文報關 PDF（裝箱單 / 產地證明 / 商業發票）</div>
      <div style={S.steps}>
        {[{ n: 1, label: '貨件資訊' }, { n: 2, label: '產品明細' }, { n: 3, label: '下載 PDF' }].map((s, i) => (
          <div key={s.n} style={{ ...S.step, opacity: step >= s.n ? 1 : 0.4 }}>
            <div style={{ ...S.stepDot, background: step >= s.n ? '#fbbf24' : '#444' }}>{step > s.n ? <Check size={12}/> : s.n}</div>
            <div style={S.stepLabel}>{s.label}</div>
            {i < 2 && <div style={{ ...S.stepBar, background: step > s.n ? '#fbbf24' : '#333' }}></div>}
          </div>
        ))}
      </div>
      {step === 1 && (
        <div style={S.card}>
          <div style={S.label}>出貨日期</div>
          <input type="date" value={draft.shipment_date} onChange={e => setDraft(d => ({ ...d, shipment_date: e.target.value }))} style={S.input} />
          <div style={{ ...S.label, marginTop: 16 }}>行李箱／包裝數量</div>
          <div style={S.pkgGrid}>
            {[1,2,3,4,5,6].map(n => (
              <button key={n} onClick={() => setDraft(d => ({ ...d, package_count: n }))} style={{ ...S.pkgBtn, ...(draft.package_count === n ? S.pkgBtnActive : {}) }}>
                <Briefcase size={16} style={{ marginBottom: 4 }} />
                <div>{n}</div>
              </button>
            ))}
          </div>
          <input type="number" min="1" max="50" value={draft.package_count} onChange={e => setDraft(d => ({ ...d, package_count: +e.target.value || 1 }))} style={{ ...S.input, marginTop: 8, width: 100 }} placeholder="自訂…" />
          <div style={{ ...S.label, marginTop: 16 }}>運送方式</div>
          <select value={draft.shipment_method} onChange={e => setDraft(d => ({ ...d, shipment_method: e.target.value }))} style={S.input}>
            <option value="Passenger checked baggage">隨身托運行李 (Passenger checked baggage)</option>
            <option value="Air Freight">空運 (Air Freight)</option>
            <option value="Courier (DHL/FedEx/UPS)">快遞 (DHL/FedEx/UPS)</option>
          </select>
          <div style={{ ...S.label, marginTop: 16 }}>發票編號</div>
          <input value={draft.shipment_no} onChange={e => setDraft(d => ({ ...d, shipment_no: e.target.value }))} style={S.input} />
          <div style={S.consigneeBox}>
            <div style={S.label}>收貨人（自動帶入）</div>
            <div style={{ fontWeight: 700, color: '#fbbf24' }}>{defaultBuyer.name}</div>
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{defaultBuyer.address}</div>
          </div>
          <button onClick={() => setStep(2)} style={{ ...S.btnPrimary, marginTop: 20 }}>
            下一步：加入產品 <ChevronRight size={16} style={{ verticalAlign: -3 }} />
          </button>
        </div>
      )}
      {step === 2 && (
        <div style={S.card}>
          <div style={S.label}>已選產品 ({draft.items.length})</div>
          {draft.items.length === 0 && <div style={S.emptyMsg}>還沒選產品。點下方按鈕加入。</div>}
          {draft.items.map((it, idx) => (
            <div key={idx} style={S.itemCard}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{it.name} {it.custom && <span style={S.customTag}>新增</span>}</div>
                <button onClick={() => removeItem(idx)} style={S.iconBtn}><X size={16} /></button>
              </div>
              <div style={S.itemGrid}>
                <div><div style={S.itemLabel}>箱/束</div><input type="number" min="0" value={it.qty_bundles} onChange={e => updateItem(idx, 'qty_bundles', +e.target.value || 0)} style={S.input} /></div>
                <div><div style={S.itemLabel}>支/箱</div><input type="number" min="0" value={it.pcs_per_bundle} onChange={e => updateItem(idx, 'pcs_per_bundle', +e.target.value || 0)} style={S.input} /></div>
                <div><div style={S.itemLabel}>單價 USD</div><input type="number" step="0.01" min="0" value={it.unit_price_usd} onChange={e => updateItem(idx, 'unit_price_usd', +e.target.value || 0)} style={S.input} /></div>
              </div>
              <div style={S.itemSummary}>總支數: {it.total_pcs} · 小計: ${it.subtotal?.toFixed?.(2) || it.subtotal}</div>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={() => setShowBrowse(true)} style={{ ...S.btnGoldOutline, flex: 1 }}><Plus size={14} style={{ verticalAlign: -2 }} /> 瀏覽產品庫</button>
            <button onClick={() => { setShowCustom(true); setCustomForm({ name: '', pcs_per_bundle: 25, package_type: 'Box', unit_price_usd: 0.85, qty_bundles: 1 }) }} style={{ ...S.btnGoldOutline, flex: 1 }}><Plus size={14} style={{ verticalAlign: -2 }} /> 新增自訂產品</button>
          </div>
          {showBrowse && (
            <div style={S.modal} onClick={() => setShowBrowse(false)}>
              <div style={S.modalCard} onClick={e => e.stopPropagation()}>
                <div style={S.modalHeader}><span>產品庫 ({products.length})</span><button onClick={() => setShowBrowse(false)} style={S.iconBtn}><X size={18} /></button></div>
                <div style={{ maxHeight: 400, overflow: 'auto' }}>
                  {products.filter(p => !draft.items.some(i => i.product_id === p.id)).map(p => (
                    <div key={p.id} onClick={() => addItem(p)} style={S.productRow}>
                      <div style={{ flex: 1 }}><div style={{ fontSize: 13 }}>{p.name}</div><div style={{ fontSize: 11, color: '#9ca3af' }}>{p.pcs_per_bundle}/{p.package_type} · ${p.unit_price_usd}</div></div>
                      <Plus size={18} style={{ color: '#fbbf24' }} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          {showCustom && customForm && (
            <div style={S.modal} onClick={() => { setShowCustom(false); setCustomForm(null) }}>
              <div style={S.modalCard} onClick={e => e.stopPropagation()}>
                <div style={S.modalHeader}><span>新增自訂產品</span><button onClick={() => { setShowCustom(false); setCustomForm(null) }} style={S.iconBtn}><X size={18} /></button></div>
                <div style={{ padding: 12 }}>
                  <div style={S.warnBox}>⚠ 產品名稱請用<b>英文</b>輸入（PDF 給海關用英文版）</div>
                  <div style={S.itemLabel}>產品名稱（英文）*</div>
                  <input value={customForm.name} onChange={e => setCustomForm({ ...customForm, name: e.target.value })} placeholder="例：Cigars Dominican CAPADURA Especial" style={S.input} />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
                    <div><div style={S.itemLabel}>支/箱 *</div><input type="number" value={customForm.pcs_per_bundle} onChange={e => setCustomForm({ ...customForm, pcs_per_bundle: e.target.value })} style={S.input} /></div>
                    <div><div style={S.itemLabel}>包裝類型</div><select value={customForm.package_type} onChange={e => setCustomForm({ ...customForm, package_type: e.target.value })} style={S.input}><option value="Box">Box (盒)</option><option value="Bundle">Bundle (束)</option></select></div>
                    <div><div style={S.itemLabel}>單價 USD *</div><input type="number" step="0.01" value={customForm.unit_price_usd} onChange={e => setCustomForm({ ...customForm, unit_price_usd: e.target.value })} style={S.input} /></div>
                    <div><div style={S.itemLabel}>數量（箱數）</div><input type="number" value={customForm.qty_bundles} onChange={e => setCustomForm({ ...customForm, qty_bundles: e.target.value })} style={S.input} /></div>
                  </div>
                  <button onClick={addCustomItem} style={{ ...S.btnPrimary, marginTop: 12 }}><Plus size={14} style={{ verticalAlign: -2 }} /> 加入貨件</button>
                </div>
              </div>
            </div>
          )}
          {draft.items.length > 0 && (() => {
            const t = computeShipmentTotals([...draft.items])
            return (
              <div style={S.summary}>
                <div style={S.summaryRow}><span>總箱/束數</span><b>{t.total_bundles}</b></div>
                <div style={S.summaryRow}><span>總支數</span><b>{t.total_sticks}</b></div>
                <div style={S.summaryRow}><span>淨重</span><b>{t.total_net_weight_kg} kg</b></div>
                <div style={{ ...S.summaryRow, color: '#4ade80', fontSize: 16 }}><span>總金額</span><b>USD ${t.total_amount_usd}</b></div>
              </div>
            )
          })()}
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button onClick={() => setStep(1)} style={{ ...S.btnSecondary, flex: 1 }}>← 上一步</button>
            <button onClick={submit} disabled={submitting || draft.items.length === 0} style={{ ...S.btnPrimary, flex: 2, opacity: (submitting || draft.items.length === 0) ? 0.5 : 1 }}>{submitting ? '提交中…' : '提交並產生 PDF'}</button>
          </div>
        </div>
      )}
      {step === 3 && success && (
        <div style={S.card}>
          <div style={S.successBox}>
            <div style={S.successIcon}><Check size={28} /></div>
            <div style={S.successTitle}>提交成功！</div>
            <div style={S.successSub}>編號：<b>{success.shipment.shipment_no}</b></div>
            <div style={S.successSub}>{success.shipment.total_sticks} 支 · USD ${success.shipment.total_amount_usd}</div>
          </div>
          <div style={{ marginTop: 20 }}>
            <button onClick={() => downloadAll('share')} style={{ ...S.btnPrimary, marginBottom: 8 }}><Download size={16} style={{ verticalAlign: -3, marginRight: 6 }} /> 分享/儲存 3 份 PDF</button>
            <button onClick={() => downloadAll('download')} style={S.btnSecondary}><Download size={16} style={{ verticalAlign: -3, marginRight: 6 }} /> 下載到電腦</button>
          </div>
          <div style={{ marginTop: 20, padding: 12, background: 'rgba(74,222,128,0.1)', borderRadius: 8, border: '1px solid rgba(74,222,128,0.3)', fontSize: 12 }}>✓ 已提交至 W Cigar Bar 總部，老闆會在後台看到此筆紀錄</div>
          <button onClick={() => { setStep(1); setSuccess(null); setDraft({ shipment_no: 'INV-' + new Date().toISOString().slice(2,10).replace(/-/g,'') + '-' + Math.floor(Math.random()*900+100), shipment_date: new Date().toISOString().slice(0, 10), package_count: 1, shipment_method: 'Passenger checked baggage', invoice_terms: 'FOB, ex-Factory', items: [] }) }} style={{ ...S.btnSecondary, marginTop: 12 }}>+ 再提交一筆貨件</button>
        </div>
      )}
      <div style={S.footer}>由 W Cigar Bar 提供 — wcigarbar.com</div>
    </div>
  )
}

const S = {
  page: { minHeight: '100vh', background: '#0a0a0a', color: '#fff', padding: 16, paddingBottom: 60 },
  loading: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a', color: '#888' },
  header: { textAlign: 'center', paddingBottom: 16, borderBottom: '1px solid #2a2a2a', marginBottom: 20 },
  logoBox: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 10 },
  tdeBox: { width: 60, height: 40, border: '2px solid #fbbf24', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 22, color: '#fbbf24', letterSpacing: 1 },
  logoSep: { width: 1, height: 36, background: '#fbbf24' },
  brandSmall: { fontSize: 9, letterSpacing: 3, color: '#fbbf24' },
  brandLarge: { fontSize: 16, fontWeight: 700, color: '#fbbf24', letterSpacing: 1 },
  headerSub: { fontSize: 11, color: '#888', marginTop: 4 },
  titleBar: { fontSize: 22, fontWeight: 700, color: '#fbbf24', textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 12, color: '#9ca3af', textAlign: 'center', marginBottom: 24 },
  steps: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  step: { display: 'flex', alignItems: 'center', flex: 1 },
  stepDot: { width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000', fontWeight: 700, fontSize: 12 },
  stepLabel: { marginLeft: 6, fontSize: 11, color: '#9ca3af' },
  stepBar: { flex: 1, height: 2, marginLeft: 8, marginRight: 8 },
  card: { background: 'rgba(255,255,255,0.03)', border: '1px solid #2a2a2a', borderRadius: 12, padding: 16, marginBottom: 16 },
  label: { fontSize: 11, color: '#9ca3af', marginBottom: 6, letterSpacing: 1, fontWeight: 600 },
  input: { width: '100%', padding: '10px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid #333', borderRadius: 8, color: '#fff', fontSize: 14, boxSizing: 'border-box' },
  pkgGrid: { display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 },
  pkgBtn: { padding: '12px 4px', background: 'rgba(255,255,255,0.05)', border: '1px solid #333', borderRadius: 8, color: '#9ca3af', cursor: 'pointer', fontSize: 16, fontWeight: 700, textAlign: 'center' },
  pkgBtnActive: { background: '#fbbf24', color: '#000', border: '1px solid #fbbf24' },
  consigneeBox: { marginTop: 16, padding: 12, background: 'rgba(255,193,7,0.05)', border: '1px solid rgba(255,193,7,0.2)', borderRadius: 8 },
  btnPrimary: { width: '100%', padding: 14, background: '#fbbf24', color: '#000', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: 'pointer' },
  btnSecondary: { width: '100%', padding: 12, background: '#2a2a2a', color: '#fff', border: '1px solid #444', borderRadius: 10, fontWeight: 600, fontSize: 14, cursor: 'pointer' },
  btnGoldOutline: { padding: 12, background: 'rgba(251,191,36,0.1)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.4)', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  itemCard: { background: 'rgba(255,255,255,0.04)', border: '1px solid #2a2a2a', borderRadius: 8, padding: 10, marginBottom: 8 },
  customTag: { fontSize: 9, padding: '1px 5px', background: '#fbbf24', color: '#000', borderRadius: 3, marginLeft: 6, fontWeight: 700 },
  iconBtn: { background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 4 },
  itemGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginTop: 8 },
  itemLabel: { fontSize: 10, color: '#9ca3af', marginBottom: 3 },
  itemSummary: { marginTop: 6, fontSize: 11, color: '#9ca3af' },
  emptyMsg: { textAlign: 'center', padding: 30, color: '#9ca3af', fontSize: 13 },
  warnBox: { padding: 8, background: 'rgba(251,146,60,0.1)', border: '1px solid rgba(251,146,60,0.3)', borderRadius: 6, color: '#fb923c', fontSize: 11, marginBottom: 10, lineHeight: 1.5 },
  modal: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 },
  modalCard: { background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 12, width: '100%', maxWidth: 420, maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' },
  modalHeader: { padding: 14, borderBottom: '1px solid #2a2a2a', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 700, color: '#fbbf24' },
  productRow: { padding: '10px 12px', borderBottom: '1px solid #2a2a2a', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  summary: { marginTop: 16, padding: 12, background: 'rgba(0,0,0,0.3)', borderRadius: 8 },
  summaryRow: { display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13, color: '#d1d5db' },
  successBox: { textAlign: 'center', padding: '20px 0' },
  successIcon: { width: 60, height: 60, borderRadius: '50%', background: 'rgba(74,222,128,0.2)', color: '#4ade80', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' },
  successTitle: { fontSize: 22, fontWeight: 700, color: '#4ade80', marginBottom: 6 },
  successSub: { fontSize: 13, color: '#9ca3af', marginTop: 2 },
  footer: { textAlign: 'center', fontSize: 10, color: '#666', marginTop: 30 },
}

