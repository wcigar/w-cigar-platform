// ============================================================
// 報關文件管理頁 (/admin/customs)
// 雪茄報關: Packing List + Certificate of Origin + Commercial Invoice
// 手機優先 UI, 一鍵下載 / 分享 LINE
// ============================================================
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { FileText, Plus, Trash2, Download, Share2, Package, Edit3, X, ChevronRight, ChevronDown, ChevronUp, FileBadge } from 'lucide-react'
import {
  generateAllDocs, downloadPdf, sharePdfFiles, computeShipmentTotals,
} from '../../lib/services/customsPdf'

export default function Customs() {
  const [tab, setTab] = useState('list')           // list | new | products
  const [shipments, setShipments] = useState([])
  const [supplier, setSupplier] = useState(null)
  const [buyers, setBuyers] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState(null)

  // 新單草稿
  const [draft, setDraft] = useState(newDraft())

  function newDraft() {
    return {
      shipment_no: 'INV-' + new Date().toISOString().slice(2,10).replace(/-/g, ''),
      shipment_date: new Date().toISOString().slice(0, 10),
      buyer_name: '', buyer_address: '',
      shipment_method: 'Passenger checked baggage',
      total_packages: '1 checked baggage',
      invoice_terms: 'FOB, ex-Factory',
      notify_to: '',
      packing_remark: 'Net from unit weights; gross pending scale.',
      items: [],
    }
  }

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [sR, bR, pR, shR] = await Promise.all([
      supabase.from('customs_suppliers').select('*').eq('is_default', true).limit(1).single(),
      supabase.from('customs_buyers').select('*').order('is_default', { ascending: false }),
      supabase.from('customs_products').select('*').eq('enabled', true).order('sort_order'),
      supabase.from('customs_shipments').select('*').order('shipment_date', { ascending: false }).limit(100),
    ])
    setSupplier(sR.data || null)
    setBuyers(bR.data || [])
    setProducts(pR.data || [])
    setShipments(shR.data || [])
    if (bR.data?.[0] && !draft.buyer_name) {
      setDraft(d => ({ ...d, buyer_name: bR.data[0].name, buyer_address: bR.data[0].address }))
    }
    setLoading(false)
  }

  function addItem(productId) {
    const p = products.find(x => x.id === productId)
    if (!p) return
    if (draft.items.some(i => i.product_id === productId)) return
    setDraft(d => ({
      ...d,
      items: [...d.items, {
        product_id: p.id, name: p.name,
        pcs_per_bundle: p.pcs_per_bundle, package_type: p.package_type,
        unit_price_usd: p.unit_price_usd, unit_weight_g: p.unit_weight_g,
        qty_bundles: 1, total_pcs: p.pcs_per_bundle,
        subtotal: +(p.pcs_per_bundle * p.unit_price_usd).toFixed(2),
      }],
    }))
  }

  function updateItem(idx, field, value) {
    setDraft(d => {
      const items = [...d.items]
      items[idx] = { ...items[idx], [field]: value }
      return { ...d, items }
    })
  }

  function removeItem(idx) {
    setDraft(d => ({ ...d, items: d.items.filter((_, i) => i !== idx) }))
  }

  function pickBuyer(b) {
    setDraft(d => ({ ...d, buyer_name: b.name, buyer_address: b.address, notify_to: b.notify_to || d.notify_to }))
  }

  async function genDocs(action) {
    if (!supplier) { alert('未設定供應商資料'); return }
    if (draft.items.length === 0) { alert('請至少加入一項產品'); return }
    if (!draft.buyer_name) { alert('請填寫買家'); return }
    const totals = computeShipmentTotals(draft.items)
    const shipment = { ...draft, ...totals }
    const { error } = await supabase.from('customs_shipments').insert({
      shipment_no: shipment.shipment_no, shipment_date: shipment.shipment_date,
      supplier_id: supplier.id, buyer_name: shipment.buyer_name, buyer_address: shipment.buyer_address,
      shipment_method: shipment.shipment_method, total_packages: shipment.total_packages,
      packing_remark: shipment.packing_remark, invoice_terms: shipment.invoice_terms,
      notify_to: shipment.notify_to, items: shipment.items,
      total_bundles: totals.total_bundles, total_sticks: totals.total_sticks,
      total_amount_usd: totals.total_amount_usd, total_net_weight_kg: totals.total_net_weight_kg,
      status: 'issued',
    })
    if (error) { alert('儲存失敗: ' + error.message); return }
    const docs = generateAllDocs({ supplier, shipment })
    const files = [
      { doc: docs.packingList, filename: `PackingList_${shipment.shipment_no}.pdf` },
      { doc: docs.coo,         filename: `CertificateOfOrigin_${shipment.shipment_no}.pdf` },
      { doc: docs.invoice,     filename: `CommercialInvoice_${shipment.shipment_no}.pdf` },
    ]
    if (action === 'share') {
      const r = await sharePdfFiles(files)
      if (r.method === 'cancelled') return
    } else {
      files.forEach(f => downloadPdf(f.doc, f.filename))
    }
    setDraft(newDraft()); setTab('list'); loadAll()
  }

  async function regenDocs(sh, action) {
    if (!supplier) return
    const docs = generateAllDocs({ supplier, shipment: sh })
    const files = [
      { doc: docs.packingList, filename: `PackingList_${sh.shipment_no}.pdf` },
      { doc: docs.coo,         filename: `CertificateOfOrigin_${sh.shipment_no}.pdf` },
      { doc: docs.invoice,     filename: `CommercialInvoice_${sh.shipment_no}.pdf` },
    ]
    if (action === 'share') await sharePdfFiles(files)
    else files.forEach(f => downloadPdf(f.doc, f.filename))
  }

  async function deleteShipment(id) {
    if (!confirm('確定刪除此貨件記錄？')) return
    await supabase.from('customs_shipments').delete().eq('id', id)
    loadAll()
  }

  if (loading) return <div className="page-container"><div className="loading-shimmer" style={{ height: 80 }} /></div>

  return (
    <div className="page-container fade-in" style={{ paddingBottom: 100 }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--gold)', margin: 0 }}>
          <FileText size={22} style={{ verticalAlign: -3, marginRight: 8 }} /> 海關報關文件
        </h1>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
          選產品 → 自動產生 Packing List / Certificate of Origin / Commercial Invoice
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, borderBottom: '1px solid #2a2a2a' }}>
        {[
          { k: 'list',     label: '貨件記錄',  c: shipments.length },
          { k: 'new',      label: '建立新單',  c: draft.items.length },
          { k: 'products', label: '產品庫',    c: products.length },
        ].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} style={{
            flex: 1, padding: '10px 8px', background: 'transparent',
            border: 'none', borderBottom: tab === t.k ? '2px solid var(--gold)' : '2px solid transparent',
            color: tab === t.k ? 'var(--gold)' : 'var(--text-muted)',
            fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}>
            {t.label} {t.c > 0 && <span style={{ fontSize: 11, opacity: 0.7 }}>({t.c})</span>}
          </button>
        ))}
      </div>

      {tab === 'list' && (
        <div>
          {shipments.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
              還沒有貨件記錄。<br /><br />
              <button onClick={() => setTab('new')} style={{ padding: '10px 20px', borderRadius: 8, background: 'var(--gold)', color: '#000', border: 'none', fontWeight: 600 }}>
                <Plus size={16} style={{ verticalAlign: -3 }} /> 建立第一筆
              </button>
            </div>
          )}
          {shipments.map(sh => {
            const cleared = sh.status === 'cleared'
            const expanded = expandedId === sh.id
            return (
              <div key={sh.id} style={{ background: 'rgba(255,255,255,0.03)', border: cleared ? '1px solid rgba(74,222,128,0.3)' : '1px solid #2a2a2a', borderRadius: 10, padding: 12, marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ fontWeight: 700, color: 'var(--gold)' }}>{sh.shipment_no || '(未編號)'}</div>
                      {cleared && (
                        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'rgba(74,222,128,0.15)', color: '#4ade80', fontWeight: 600 }}>已清關 ✓</span>
                      )}
                    </div>
                    {sh.declaration_no && (
                      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2, fontFamily: 'monospace' }}>
                        <FileBadge size={10} style={{ verticalAlign: -1, marginRight: 3 }} />
                        報單 {sh.declaration_no}
                      </div>
                    )}
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{sh.shipment_date} · {sh.buyer_name}</div>
                    <div style={{ fontSize: 12, marginTop: 6 }}>
                      <Package size={12} style={{ verticalAlign: -2 }} /> {sh.total_bundles} 束 / {sh.total_sticks} 支
                      <span style={{ marginLeft: 8, color: '#4ade80' }}>USD${sh.total_amount_usd}</span>
                      {sh.tariff_twd && (
                        <span style={{ marginLeft: 8, color: '#fb923c' }}>進口稅 NT${Number(sh.tariff_twd).toLocaleString()}</span>
                      )}
                    </div>
                  </div>
                </div>
                {expanded && (
                  <div style={{ marginTop: 10, padding: 10, background: 'rgba(0,0,0,0.3)', borderRadius: 6, fontSize: 11, color: '#d1d5db', lineHeight: 1.7 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      {sh.hs_code && <div><b>HS Code:</b> {sh.hs_code}</div>}
                      {sh.master_awb && <div><b>主提單:</b> {sh.master_awb}</div>}
                      {sh.exchange_rate && <div><b>匯率:</b> {sh.exchange_rate}</div>}
                      {sh.fob_usd && <div><b>FOB:</b> USD${sh.fob_usd}</div>}
                      {sh.cif_usd && <div><b>CIF:</b> USD${sh.cif_usd}</div>}
                      {sh.cif_twd && <div><b>CIF TWD:</b> ${Number(sh.cif_twd).toLocaleString()}</div>}
                      {sh.gross_weight_kg && <div><b>毛重:</b> {sh.gross_weight_kg} kg</div>}
                      {sh.total_net_weight_kg && <div><b>淨重:</b> {sh.total_net_weight_kg} kg</div>}
                    </div>
                    {(sh.tariff_twd || sh.total_tax_twd) && (
                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed #444' }}>
                        <div style={{ fontWeight: 700, color: '#fb923c', marginBottom: 4 }}>稅費明細 (TWD)</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 11 }}>
                          {sh.tariff_twd && <div>進口稅 <span style={{ float: 'right' }}>${Number(sh.tariff_twd).toLocaleString()}</span></div>}
                          {sh.business_tax_twd && <div>營業稅 <span style={{ float: 'right' }}>${Number(sh.business_tax_twd).toLocaleString()}</span></div>}
                          {sh.tobacco_tax_twd && <div>菸酒稅 <span style={{ float: 'right' }}>${Number(sh.tobacco_tax_twd).toLocaleString()}</span></div>}
                          {sh.health_tax_twd && <div>健康捐 <span style={{ float: 'right' }}>${Number(sh.health_tax_twd).toLocaleString()}</span></div>}
                        </div>
                        {sh.total_tax_twd && (
                          <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px dashed #444', fontWeight: 700, color: '#fb923c' }}>
                            稅費合計 <span style={{ float: 'right' }}>${Number(sh.total_tax_twd).toLocaleString()}</span>
                          </div>
                        )}
                      </div>
                    )}
                    {sh.freight_forwarder && (
                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed #444', color: 'var(--text-muted)' }}>
                        報關行: {sh.freight_forwarder} · {sh.broker_name}
                      </div>
                    )}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                  <button onClick={() => regenDocs(sh, 'share')} style={{ flex: 1, padding: '8px', borderRadius: 6, background: 'var(--gold)', color: '#000', border: 'none', fontWeight: 600, fontSize: 13 }}>
                    <Share2 size={14} style={{ verticalAlign: -2 }} /> 分享 LINE
                  </button>
                  <button onClick={() => regenDocs(sh, 'download')} style={{ flex: 1, padding: '8px', borderRadius: 6, background: '#2a2a2a', color: '#fff', border: 'none', fontSize: 13 }}>
                    <Download size={14} style={{ verticalAlign: -2 }} /> 下載
                  </button>
                  {(sh.declaration_no || sh.tariff_twd) && (
                    <button onClick={() => setExpandedId(expanded ? null : sh.id)} style={{ padding: '8px 10px', borderRadius: 6, background: 'rgba(251,146,60,0.15)', color: '#fb923c', border: '1px solid rgba(251,146,60,0.3)', fontSize: 13 }}>
                      {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  )}
                  <button onClick={() => deleteShipment(sh.id)} style={{ padding: '8px 10px', borderRadius: 6, background: 'transparent', color: '#ef4444', border: '1px solid #ef4444', fontSize: 13 }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {tab === 'new' && (
        <div>
          <Section title="基本資訊">
            <Field label="發票號碼"><input value={draft.shipment_no} onChange={e => setDraft(d => ({ ...d, shipment_no: e.target.value }))} /></Field>
            <Field label="日期"><input type="date" value={draft.shipment_date} onChange={e => setDraft(d => ({ ...d, shipment_date: e.target.value }))} /></Field>
          </Section>
          <Section title="收貨人 (Consignee)">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {buyers.map(b => (
                <button key={b.id} onClick={() => pickBuyer(b)} style={{
                  padding: '6px 10px', borderRadius: 16, fontSize: 12,
                  background: draft.buyer_name === b.name ? 'var(--gold)' : 'transparent',
                  color: draft.buyer_name === b.name ? '#000' : '#fff',
                  border: '1px solid #444', cursor: 'pointer',
                }}>{b.name}</button>
              ))}
            </div>
            <Field label="買家名稱"><input value={draft.buyer_name} onChange={e => setDraft(d => ({ ...d, buyer_name: e.target.value }))} /></Field>
            <Field label="買家地址"><textarea value={draft.buyer_address} onChange={e => setDraft(d => ({ ...d, buyer_address: e.target.value }))} rows={2} /></Field>
            <Field label="Notify To (可選)"><textarea value={draft.notify_to} onChange={e => setDraft(d => ({ ...d, notify_to: e.target.value }))} rows={2} placeholder="貨運代理 / 第三方收件" /></Field>
          </Section>
          <Section title={`產品明細 (${draft.items.length})`}>
            {draft.items.map((it, idx) => (
              <div key={idx} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 10, marginBottom: 8, border: '1px solid #2a2a2a' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, fontSize: 13, fontWeight: 600, paddingRight: 8 }}>{it.name}</div>
                  <button onClick={() => removeItem(idx)} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer' }}><X size={16} /></button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginTop: 8 }}>
                  <FieldSmall label="束/盒數"><input type="number" min="0" value={it.qty_bundles} onChange={e => updateItem(idx, 'qty_bundles', +e.target.value || 0)} /></FieldSmall>
                  <FieldSmall label="支/束"><input type="number" min="0" value={it.pcs_per_bundle} onChange={e => updateItem(idx, 'pcs_per_bundle', +e.target.value || 0)} /></FieldSmall>
                  <FieldSmall label="單價 USD"><input type="number" step="0.01" min="0" value={it.unit_price_usd} onChange={e => updateItem(idx, 'unit_price_usd', +e.target.value || 0)} /></FieldSmall>
                </div>
                <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                  總支數: {(it.qty_bundles || 0) * (it.pcs_per_bundle || 0)} · 小計: ${((it.qty_bundles || 0) * (it.pcs_per_bundle || 0) * (it.unit_price_usd || 0)).toFixed(2)}
                </div>
              </div>
            ))}
            <details style={{ marginTop: 8 }}>
              <summary style={{ padding: '10px', background: 'rgba(255,215,0,0.1)', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: 'var(--gold)', listStyle: 'none' }}>
                <Plus size={14} style={{ verticalAlign: -2 }} /> 加入產品...
              </summary>
              <div style={{ marginTop: 8, maxHeight: 300, overflow: 'auto' }}>
                {products.filter(p => !draft.items.some(i => i.product_id === p.id)).map(p => (
                  <div key={p.id} onClick={() => addItem(p.id)} style={{ padding: '8px 10px', borderBottom: '1px solid #2a2a2a', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}>
                    <div style={{ flex: 1, fontSize: 12 }}>
                      <div>{p.name}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>{p.pcs_per_bundle}/{p.package_type} · ${p.unit_price_usd}</div>
                    </div>
                    <ChevronRight size={16} style={{ color: 'var(--gold)' }} />
                  </div>
                ))}
              </div>
            </details>
          </Section>
          {draft.items.length > 0 && (() => {
            const t = computeShipmentTotals([...draft.items])
            return (
              <Section title="總計">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13 }}>
                  <Stat label="總束/盒數" value={t.total_bundles} />
                  <Stat label="總支數" value={t.total_sticks} />
                  <Stat label="總金額 USD" value={`$${t.total_amount_usd}`} hi />
                  <Stat label="淨重 (kg)" value={t.total_net_weight_kg} />
                </div>
              </Section>
            )
          })()}
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: 12, background: 'rgba(0,0,0,0.95)', borderTop: '1px solid #333', display: 'flex', gap: 8, zIndex: 100 }}>
            <button onClick={() => genDocs('share')} disabled={draft.items.length === 0 || !draft.buyer_name} style={{ flex: 1, padding: 14, borderRadius: 10, background: 'var(--gold)', color: '#000', border: 'none', fontWeight: 700, fontSize: 14, opacity: (draft.items.length === 0 || !draft.buyer_name) ? 0.5 : 1 }}>
              <Share2 size={16} style={{ verticalAlign: -3 }} /> 產生並分享 LINE
            </button>
            <button onClick={() => genDocs('download')} disabled={draft.items.length === 0 || !draft.buyer_name} style={{ flex: 1, padding: 14, borderRadius: 10, background: '#2a2a2a', color: '#fff', border: '1px solid #555', fontSize: 14, opacity: (draft.items.length === 0 || !draft.buyer_name) ? 0.5 : 1 }}>
              <Download size={16} style={{ verticalAlign: -3 }} /> 下載 3 份 PDF
            </button>
          </div>
        </div>
      )}

      {tab === 'products' && <ProductManager products={products} onChange={loadAll} />}
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gold)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>{title}</div>
      <div>{children}</div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>{label}</div>
      <div>{children}</div>
      <style>{`input, textarea, select { width: 100%; padding: 8px 10px; background: rgba(255,255,255,0.05); border: 1px solid #333; border-radius: 6px; color: #fff; font-size: 13px; box-sizing: border-box; } input:focus, textarea:focus, select:focus { outline: none; border-color: var(--gold); }`}</style>
    </div>
  )
}

function FieldSmall({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
      {children}
    </div>
  )
}

function Stat({ label, value, hi }) {
  return (
    <div style={{ padding: 10, background: 'rgba(255,255,255,0.04)', borderRadius: 6, border: hi ? '1px solid var(--gold)' : '1px solid #333' }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: hi ? 'var(--gold)' : '#fff' }}>{value}</div>
    </div>
  )
}

function ProductManager({ products, onChange }) {
  const [editing, setEditing] = useState(null)
  const [adding, setAdding] = useState(false)
  async function save(p) {
    if (p.id) {
      await supabase.from('customs_products').update({
        name: p.name, pcs_per_bundle: +p.pcs_per_bundle, package_type: p.package_type,
        unit_price_usd: +p.unit_price_usd, unit_weight_g: +p.unit_weight_g,
        sort_order: +p.sort_order || 999, updated_at: new Date().toISOString(),
      }).eq('id', p.id)
    } else {
      await supabase.from('customs_products').insert({
        name: p.name, pcs_per_bundle: +p.pcs_per_bundle || 25, package_type: p.package_type || 'Bundle',
        unit_price_usd: +p.unit_price_usd || 0, unit_weight_g: +p.unit_weight_g || 15, sort_order: 999,
      })
    }
    setEditing(null); setAdding(false); onChange()
  }
  async function remove(id) {
    if (!confirm('確定刪除此產品？')) return
    await supabase.from('customs_products').delete().eq('id', id)
    onChange()
  }
  return (
    <div>
      <button onClick={() => { setAdding(true); setEditing({ name: '', pcs_per_bundle: 25, package_type: 'Bundle', unit_price_usd: 0.85, unit_weight_g: 15 }) }} style={{ width: '100%', padding: 12, marginBottom: 12, borderRadius: 8, background: 'var(--gold)', color: '#000', border: 'none', fontWeight: 700 }}>
        <Plus size={16} style={{ verticalAlign: -3 }} /> 新增產品
      </button>
      {(editing || adding) && (
        <div style={{ background: 'rgba(255,215,0,0.05)', border: '1px solid var(--gold)', borderRadius: 10, padding: 12, marginBottom: 12 }}>
          <Field label="產品名稱"><input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Field label="支/束"><input type="number" value={editing.pcs_per_bundle} onChange={e => setEditing({ ...editing, pcs_per_bundle: e.target.value })} /></Field>
            <Field label="單位"><select value={editing.package_type} onChange={e => setEditing({ ...editing, package_type: e.target.value })}><option>Bundle</option><option>Box</option></select></Field>
            <Field label="單價 USD"><input type="number" step="0.01" value={editing.unit_price_usd} onChange={e => setEditing({ ...editing, unit_price_usd: e.target.value })} /></Field>
            <Field label="單支重 g"><input type="number" value={editing.unit_weight_g} onChange={e => setEditing({ ...editing, unit_weight_g: e.target.value })} /></Field>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button onClick={() => save(editing)} style={{ flex: 1, padding: 10, borderRadius: 6, background: 'var(--gold)', color: '#000', border: 'none', fontWeight: 700 }}>儲存</button>
            <button onClick={() => { setEditing(null); setAdding(false) }} style={{ padding: '10px 16px', borderRadius: 6, background: '#2a2a2a', color: '#fff', border: 'none' }}>取消</button>
          </div>
        </div>
      )}
      {products.map(p => (
        <div key={p.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid #2a2a2a', borderRadius: 8, padding: 10, marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.pcs_per_bundle}/{p.package_type} · ${p.unit_price_usd}</div>
          </div>
          <button onClick={() => setEditing(p)} style={{ background: 'transparent', border: 'none', color: 'var(--gold)', padding: 6 }}><Edit3 size={14} /></button>
          <button onClick={() => remove(p.id)} style={{ background: 'transparent', border: 'none', color: '#ef4444', padding: 6 }}><Trash2 size={14} /></button>
        </div>
      ))}
    </div>
  )
}
