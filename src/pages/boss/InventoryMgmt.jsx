import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Package, AlertTriangle, Search, Save, ChevronDown, ChevronUp, TrendingDown } from 'lucide-react'
import { format } from 'date-fns'

export default function InventoryMgmt() {
  const [tab, setTab] = useState('overview')
  const tabs = [
    { id: 'overview', l: '庫存總覽' },
    { id: 'low', l: '低庫存警報' },
    { id: 'records', l: '盤點紀錄' },
    { id: 'correct', l: '手動校正' },
  ]

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, overflowX: 'auto' }}>
        {tabs.map(t => <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: '7px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', background: tab === t.id ? 'var(--gold-glow)' : 'transparent', color: tab === t.id ? 'var(--gold)' : 'var(--text-dim)', border: tab === t.id ? '1px solid var(--border-gold)' : '1px solid var(--border)' }}>{t.l}</button>)}
      </div>
      {tab === 'overview' && <OverviewTab />}
      {tab === 'low' && <LowStockTab />}
      {tab === 'records' && <RecordsTab />}
      {tab === 'correct' && <CorrectTab />}
    </div>
  )
}

function OverviewTab() {
  const [items, setItems] = useState([])
  const [keyword, setKeyword] = useState('')
  const [catFilter, setCatFilter] = useState('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])
  async function load() {
    setLoading(true)
    const { data } = await supabase.from('inventory_master').select('*').eq('enabled', true).order('category').order('name')
    setItems(data || []); setLoading(false)
  }

  const cats = [...new Set(items.map(i => i.category || '未分類'))]
  const filtered = items.filter(i => {
    if (catFilter !== 'all' && (i.category || '未分類') !== catFilter) return false
    if (keyword) { const kw = keyword.toLowerCase(); return i.name?.toLowerCase().includes(kw) || i.id?.toLowerCase().includes(kw) }
    return true
  })
  const lowCount = items.filter(i => i.is_low).length
  const zeroCount = items.filter(i => i.current_stock === 0).length

  if (loading) return <div>{[1, 2, 3].map(i => <div key={i} className="loading-shimmer" style={{ height: 60, marginBottom: 8 }} />)}</div>

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
        <SB label="總品項" value={items.length} color="var(--gold)" />
        <SB label="低庫存" value={lowCount} color={lowCount ? 'var(--red)' : 'var(--green)'} />
        <SB label="零庫存" value={zeroCount} color={zeroCount ? 'var(--red)' : 'var(--green)'} />
        <SB label="分類" value={cats.length} color="var(--blue)" />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input placeholder="🔍 搜尋品項" value={keyword} onChange={e => setKeyword(e.target.value)} style={{ flex: 1, minWidth: 120, fontSize: 13, padding: 8 }} />
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)} style={{ width: 120, fontSize: 13, padding: 8 }}>
          <option value="all">全部分類</option>
          {cats.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>共 {filtered.length} 項</div>

      {filtered.map(item => (
        <div key={item.id} className="card" style={{ padding: 12, marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderColor: item.is_low ? 'rgba(196,77,77,.3)' : item.current_stock === 0 ? 'rgba(196,77,77,.5)' : undefined }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{item.name}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{item.category} · {item.sub_category} · {item.owner} · {item.count_day}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 18, fontFamily: 'var(--font-mono)', fontWeight: 700, color: item.current_stock === 0 ? 'var(--red)' : item.is_low ? '#ffb347' : 'var(--green)' }}>{item.current_stock} <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{item.unit}</span></div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>安全:{item.safe_stock}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

function LowStockTab() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])
  async function load() {
    setLoading(true)
    const { data } = await supabase.from('inventory_master').select('*').eq('enabled', true).eq('is_low', true).order('current_stock')
    setItems(data || []); setLoading(false)
  }

  if (loading) return <div>{[1, 2].map(i => <div key={i} className="loading-shimmer" style={{ height: 60, marginBottom: 8 }} />)}</div>

  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--red)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}><AlertTriangle size={16} /> 低庫存警報 ({items.length})</div>
      {items.length === 0 ? <div className="card" style={{ textAlign: 'center', padding: 30, color: 'var(--green)' }}>所有品項庫存充足！</div> :
        items.map(item => {
          const shortage = Math.max(0, (item.safe_stock || 0) - (item.current_stock || 0))
          const danger = item.current_stock === 0
          return (
            <div key={item.id} className="card" style={{ padding: 14, marginBottom: 8, borderColor: danger ? 'rgba(196,77,77,.5)' : 'rgba(196,77,77,.2)', background: danger ? 'rgba(196,77,77,.06)' : undefined }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{item.name} {danger && <span style={{ color: 'var(--red)' }}>🚨 零庫存</span>}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{item.category} · {item.owner} · {item.count_day} · {item.unit}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 24, fontFamily: 'var(--font-mono)', fontWeight: 700, color: danger ? 'var(--red)' : '#ffb347' }}>{item.current_stock}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>安全:{item.safe_stock} 缺:{shortage}</div>
                </div>
              </div>
              {item.last_update && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>最後更新: {String(item.last_update).slice(0, 16)}</div>}
            </div>
          )
        })}
    </div>
  )
}

function RecordsTab() {
  const [records, setRecords] = useState([])
  const [keyword, setKeyword] = useState('')
  const [diffOnly, setDiffOnly] = useState(false)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const pageSize = 20

  useEffect(() => { load() }, [page])
  async function load() {
    setLoading(true)
    const { data } = await supabase.from('inventory_records').select('*').order('time', { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1)
    setRecords(prev => page === 1 ? (data || []) : [...prev, ...(data || [])]); setLoading(false)
  }

  function search() { setPage(1); setRecords([]); load() }

  const filtered = records.filter(r => {
    if (diffOnly && r.diff === 0) return false
    if (keyword) { const kw = keyword.toLowerCase(); return r.item_name?.toLowerCase().includes(kw) || r.item_id?.toLowerCase().includes(kw) || r.staff_code?.toLowerCase().includes(kw) }
    return true
  })

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input placeholder="搜尋品項/員工" value={keyword} onChange={e => setKeyword(e.target.value)} style={{ flex: 1, minWidth: 120, fontSize: 13, padding: 8 }} />
        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-dim)', cursor: 'pointer' }}><input type="checkbox" checked={diffOnly} onChange={e => setDiffOnly(e.target.checked)} /> 只看有差異</label>
      </div>

      {loading && page === 1 ? <div>{[1, 2, 3].map(i => <div key={i} className="loading-shimmer" style={{ height: 50, marginBottom: 6 }} />)}</div> :
        filtered.length === 0 ? <div className="card" style={{ textAlign: 'center', padding: 30, color: 'var(--text-dim)' }}>無紀錄</div> :
          filtered.map(r => (
            <div key={r.id} className="card" style={{ padding: 12, marginBottom: 4, borderColor: Math.abs(r.diff || 0) >= 10 ? 'rgba(196,77,77,.3)' : undefined }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{r.item_name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{r.staff_code} · {r.source} · {String(r.time || '').slice(0, 16)}</div>
                  {r.note && <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>📝 {r.note}</div>}
                </div>
                <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.before_stock}→</span>
                  <span style={{ fontSize: 16, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text)' }}>{r.after_stock}</span>
                  <div style={{ fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 700, color: r.diff > 0 ? 'var(--green)' : r.diff < 0 ? 'var(--red)' : 'var(--text-muted)' }}>
                    {r.diff > 0 ? '+' : ''}{r.diff || 0}
                    {Math.abs(r.diff || 0) >= 10 && <span style={{ color: 'var(--red)', marginLeft: 4 }}>⚠</span>}
                  </div>
                </div>
              </div>
            </div>
          ))}

      <button className="btn-outline" style={{ width: '100%', marginTop: 10, fontSize: 13, padding: 10 }} onClick={() => setPage(p => p + 1)} disabled={loading}>
        {loading ? '載入中...' : '載入更多'}
      </button>
    </div>
  )
}

function CorrectTab() {
  const [items, setItems] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [newQty, setNewQty] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])
  async function load() {
    setLoading(true)
    const { data } = await supabase.from('inventory_master').select('*').eq('enabled', true).order('name')
    setItems(data || []); setLoading(false)
  }

  const selected = items.find(i => i.id === selectedId)

  async function submit() {
    if (!selectedId) return alert('請選擇品項')
    if (newQty === '' || +newQty < 0) return alert('數量必須 ≥ 0')
    if (!reason.trim()) return alert('請填寫校正原因')
    if (!confirm(`確定將「${selected?.name}」庫存校正為 ${newQty}？`)) return

    setSubmitting(true)
    const before = selected?.current_stock || 0
    const qty = +newQty
    const safe = selected?.safe_stock || 0

    await supabase.from('inventory_master').update({
      current_stock: qty, is_low: safe > 0 && qty < safe,
      last_count_date: new Date().toISOString(), last_update: new Date().toISOString()
    }).eq('id', selectedId)

    await supabase.from('inventory_records').insert({
      staff_code: 'ADMIN', item_id: selectedId, item_name: selected?.name || '',
      before_stock: before, after_stock: qty, diff: qty - before,
      is_low: safe > 0 && qty < safe, note: '老闆校正：' + reason.trim(), source: '老闆手動校正'
    })

    setSubmitting(false)
    alert(`已校正「${selected?.name}」庫存為 ${qty}`)
    setNewQty(''); setReason(''); setSelectedId('')
    load()
  }

  if (loading) return <div className="loading-shimmer" style={{ height: 200 }} />

  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gold)', marginBottom: 12 }}>手動校正庫存</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>校正紀錄會自動寫入盤點紀錄表，可追溯。</div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 6 }}>選擇品項</div>
        <select value={selectedId} onChange={e => { setSelectedId(e.target.value); setNewQty('') }} style={{ fontSize: 14, padding: 10 }}>
          <option value="">請選擇...</option>
          {items.map(i => <option key={i.id} value={i.id}>{i.name}（{i.category} · 目前:{i.current_stock} {i.unit}）</option>)}
        </select>
      </div>

      {selected && (
        <div className="card" style={{ padding: 14, marginBottom: 12, borderColor: selected.is_low ? 'rgba(196,77,77,.3)' : 'var(--border-gold)' }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{selected.name}</div>
          <div style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 4 }}>
            目前庫存: <strong style={{ fontSize: 20, color: selected.is_low ? 'var(--red)' : 'var(--green)', fontFamily: 'var(--font-mono)' }}>{selected.current_stock}</strong> {selected.unit}
            <span style={{ marginLeft: 12 }}>安全庫存: {selected.safe_stock}</span>
          </div>
          {selected.last_update && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>最後更新: {String(selected.last_update).slice(0, 16)}</div>}
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 6 }}>校正後數量</div>
        <input type="number" min="0" inputMode="numeric" value={newQty} onChange={e => setNewQty(e.target.value)} placeholder="輸入正確庫存數量" style={{ fontSize: 18, padding: 12, fontFamily: 'var(--font-mono)', fontWeight: 600 }} />
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 6 }}>校正原因（必填）</div>
        <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="例如：現場實數 12 瓶、系統誤差、進貨未登記..." rows={3} style={{ fontSize: 14, padding: 10, resize: 'none' }} />
      </div>

      <button className="btn-gold" style={{ width: '100%', fontSize: 16, padding: 14, opacity: submitting ? .6 : 1 }} onClick={submit} disabled={submitting}>
        {submitting ? '校正中...' : '確認校正庫存'}
      </button>
    </div>
  )
}

function SB({ label, value, color }) {
  return <div className="card" style={{ padding: 8, textAlign: 'center' }}>
    <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>{label}</div>
    <div style={{ fontSize: 18, fontFamily: 'var(--font-mono)', fontWeight: 600, color }}>{value}</div>
  </div>
}
