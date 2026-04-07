import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { Package, Save, Send, Search, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Users, Settings, ClipboardList, History } from 'lucide-react'
import { format } from 'date-fns'

export default function InventoryMgmt() {
  const [tab, setTab] = useState('overview')
  const [items, setItems] = useState([])
  const [employees, setEmployees] = useState([])
  const [records, setRecords] = useState([])
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [keyword, setKeyword] = useState('')
  const [msg, setMsg] = useState('')

  // Safe stock editing state
  const [safeEdits, setSafeEdits] = useState({})
  const [savingSafe, setSavingSafe] = useState(false)

  // Assignment state
  const [assignEdits, setAssignEdits] = useState({})
  const [savingAssign, setSavingAssign] = useState(false)

  // Batch select
  const [selected, setSelected] = useState(new Set())
  const [batchOwner, setBatchOwner] = useState('')
  const [batchDay, setBatchDay] = useState('')
  const [batchSafe, setBatchSafe] = useState('')

  // Expand/collapse categories
  const [collapsed, setCollapsed] = useState(new Set())

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [itemRes, empRes, recRes, taskRes] = await Promise.all([
      supabase.from('inventory_master').select('*').order('category').order('sub_category').order('name'),
      supabase.from('employees').select('*').eq('is_active', true).order('name'),
      supabase.from('inventory_records').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('inventory_tasks').select('*').order('created_at', { ascending: false }).limit(200),
    ])
    setItems(itemRes.data || [])
    setEmployees(empRes.data || [])
    setRecords(recRes.data || [])
    setTasks(taskRes.data || [])
    setLoading(false)
  }

  function flash(text) { setMsg(text); setTimeout(() => setMsg(''), 3000) }

  // --- Filtered items ---
  const filtered = useMemo(() => {
    let list = items
    if (filter === 'low') list = list.filter(i => i.is_low)
    if (filter === 'enabled') list = list.filter(i => i.enabled)
    if (filter === 'disabled') list = list.filter(i => !i.enabled)
    if (filter === 'noSafe') list = list.filter(i => !i.safe_stock && i.safe_stock !== 0)
    if (keyword) {
      const kw = keyword.toLowerCase()
      list = list.filter(i => i.name?.toLowerCase().includes(kw) || i.id?.toLowerCase().includes(kw) || i.category?.toLowerCase().includes(kw) || i.sub_category?.toLowerCase().includes(kw))
    }
    return list
  }, [items, filter, keyword])

  const byCat = useMemo(() => {
    const map = {}
    filtered.forEach(i => { const c = i.category || '未分類'; if (!map[c]) map[c] = []; map[c].push(i) })
    return map
  }, [filtered])

  const lowCount = items.filter(i => i.is_low).length
  const totalEnabled = items.filter(i => i.enabled).length

  // --- Safe stock batch save ---
  async function saveSafeStocks() {
    const entries = Object.entries(safeEdits).filter(([_, v]) => v !== '' && v != null)
    if (!entries.length) return flash('沒有變更')
    setSavingSafe(true)
    let ok = 0
    for (const [id, val] of entries) {
      const num = Number(val)
      if (isNaN(num) || num < 0) continue
      const item = items.find(i => i.id === id)
      const isLow = item ? (num > 0 && (item.current_stock || 0) < num) : false
      const { error } = await supabase.from('inventory_master').update({ safe_stock: num, is_low: isLow }).eq('id', id)
      if (!error) ok++
    }
    setSavingSafe(false)
    setSafeEdits({})
    flash(`✅ 已更新 ${ok} 筆安全庫存`)
    loadAll()
  }

  // --- Batch assignment save ---
  async function saveAssignments() {
    const entries = Object.entries(assignEdits).filter(([_, v]) => v.owner || v.count_day)
    if (!entries.length) return flash('沒有變更')
    setSavingAssign(true)
    let ok = 0
    for (const [id, changes] of entries) {
      const update = {}
      if (changes.owner) update.owner = changes.owner
      if (changes.count_day) update.count_day = changes.count_day
      const { error } = await supabase.from('inventory_master').update(update).eq('id', id)
      if (!error) ok++
    }
    setSavingAssign(false)
    setAssignEdits({})
    flash(`✅ 已指派 ${ok} 筆`)
    loadAll()
  }

  // --- Batch operations ---
  function toggleSelect(id) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function selectAll() {
    if (selected.size === filtered.length) setSelected(new Set())
    else setSelected(new Set(filtered.map(i => i.id)))
  }

  async function applyBatch() {
    if (!selected.size) return flash('請先勾選品項')
    const update = {}
    if (batchOwner) update.owner = batchOwner
    if (batchDay) update.count_day = batchDay
    if (batchSafe !== '') update.safe_stock = Number(batchSafe)
    if (!Object.keys(update).length) return flash('請選擇要批量修改的項目')
    if (!confirm(`確定批量修改 ${selected.size} 筆品項？`)) return
    let ok = 0
    for (const id of selected) {
      const finalUpdate = { ...update }
      if (finalUpdate.safe_stock != null) {
        const item = items.find(i => i.id === id)
        finalUpdate.is_low = item ? (finalUpdate.safe_stock > 0 && (item.current_stock || 0) < finalUpdate.safe_stock) : false
      }
      const { error } = await supabase.from('inventory_master').update(finalUpdate).eq('id', id)
      if (!error) ok++
    }
    flash(`✅ 批量更新 ${ok} 筆`)
    setSelected(new Set()); setBatchOwner(''); setBatchDay(''); setBatchSafe('')
    loadAll()
  }

  function toggleCat(cat) {
    setCollapsed(prev => { const n = new Set(prev); n.has(cat) ? n.delete(cat) : n.add(cat); return n })
  }

  const empOptions = employees.filter(e => e.employee_id !== 'ADMIN')

  const tabs = [
    { id: 'overview', icon: <Package size={13} />, label: '品項總覽' },
    { id: 'safe', icon: <Settings size={13} />, label: '安全庫存' },
    { id: 'assign', icon: <Users size={13} />, label: '盤點指派' },
    { id: 'records', icon: <History size={13} />, label: '盤點紀錄' },
  ]

  if (loading) return <div>{[1, 2, 3].map(i => <div key={i} className="loading-shimmer" style={{ height: 80, marginBottom: 8 }} />)}</div>

  return (
    <div>
      {msg && <div style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', background: 'var(--gold)', color: '#000', padding: '10px 20px', borderRadius: 12, fontSize: 14, fontWeight: 700, zIndex: 999, boxShadow: '0 4px 20px rgba(0,0,0,.4)' }}>{msg}</div>}

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, overflowX: 'auto' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '7px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer',
            whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4,
            background: tab === t.id ? 'var(--gold-glow)' : 'transparent',
            color: tab === t.id ? 'var(--gold)' : 'var(--text-dim)',
            border: tab === t.id ? '1px solid var(--border-gold)' : '1px solid var(--border)',
          }}>{t.icon}{t.label}</button>
        ))}
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, marginBottom: 14 }}>
        <StatCard label="總品項" value={items.length} />
        <StatCard label="啟用中" value={totalEnabled} color="var(--gold)" />
        <StatCard label="低庫存" value={lowCount} color={lowCount > 0 ? 'var(--red)' : 'var(--green)'} />
        <StatCard label="已選取" value={selected.size} color="var(--gold)" />
      </div>

      {/* Search + Filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input placeholder="搜尋品項/分類" value={keyword} onChange={e => setKeyword(e.target.value)}
            style={{ width: '100%', paddingLeft: 30, fontSize: 12, padding: '8px 8px 8px 30px' }} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 14, overflowX: 'auto', flexWrap: 'wrap' }}>
        {[['all', '全部'], ['low', `低庫存(${lowCount})`], ['enabled', '啟用'], ['disabled', '停用'], ['noSafe', '未設安全值']].map(([v, l]) => (
          <button key={v} onClick={() => setFilter(v)} style={{
            padding: '5px 10px', borderRadius: 16, fontSize: 10, fontWeight: 600, cursor: 'pointer',
            background: filter === v ? 'var(--gold-glow)' : 'transparent',
            color: filter === v ? 'var(--gold)' : 'var(--text-dim)',
            border: filter === v ? '1px solid var(--border-gold)' : '1px solid var(--border)',
          }}>{l}</button>
        ))}
      </div>

      {/* ========= TAB: OVERVIEW ========= */}
      {tab === 'overview' && (
        <div>
          {Object.entries(byCat).map(([cat, catItems]) => (
            <div key={cat} style={{ marginBottom: 12 }}>
              <div onClick={() => toggleCat(cat)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)' }}>{cat} ({catItems.length})</span>
                {collapsed.has(cat) ? <ChevronDown size={16} color="var(--text-dim)" /> : <ChevronUp size={16} color="var(--text-dim)" />}
              </div>
              {!collapsed.has(cat) && catItems.map(item => (
                <div key={item.id} className="card" style={{ padding: 10, marginBottom: 4, borderColor: item.is_low ? 'rgba(196,77,77,.3)' : undefined }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{item.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                        {item.sub_category} · {item.unit} · {item.count_day} · {item.owner || '未指派'}
                        {item.is_low && <span style={{ color: 'var(--red)', marginLeft: 6, fontWeight: 700 }}>⚠低庫存</span>}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', minWidth: 70 }}>
                      <div style={{ fontSize: 18, fontFamily: 'var(--font-mono)', fontWeight: 700, color: item.is_low ? 'var(--red)' : 'var(--text)' }}>{item.current_stock ?? '—'}</div>
                      <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>安全:{item.safe_stock ?? '未設'}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}
          {filtered.length === 0 && <div className="card" style={{ textAlign: 'center', padding: 30, color: 'var(--text-dim)' }}>無符合條件的品項</div>}
        </div>
      )}

      {/* ========= TAB: SAFE STOCK SETTINGS ========= */}
      {tab === 'safe' && (
        <div>
          <div className="card" style={{ padding: 12, marginBottom: 12, background: 'var(--gold-glow)', borderColor: 'var(--border-gold)' }}>
            <div style={{ fontSize: 12, color: 'var(--gold)', fontWeight: 600 }}>💡 直接修改安全庫存值，改完點底部「儲存」一次送出</div>
          </div>

          {Object.entries(byCat).map(([cat, catItems]) => (
            <div key={cat} style={{ marginBottom: 12 }}>
              <div onClick={() => toggleCat(cat)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)' }}>{cat} ({catItems.length})</span>
                {collapsed.has(cat) ? <ChevronDown size={16} color="var(--text-dim)" /> : <ChevronUp size={16} color="var(--text-dim)" />}
              </div>
              {!collapsed.has(cat) && catItems.map(item => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px dashed var(--border)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>現有:{item.current_stock ?? '—'} {item.unit}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                    <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>安全值</span>
                    <input type="number" inputMode="numeric" min="0"
                      value={safeEdits[item.id] ?? item.safe_stock ?? ''}
                      onChange={e => setSafeEdits(p => ({ ...p, [item.id]: e.target.value }))}
                      style={{ width: 60, fontSize: 14, fontFamily: 'var(--font-mono)', fontWeight: 700, textAlign: 'center', padding: '6px 4px',
                        borderColor: safeEdits[item.id] != null && safeEdits[item.id] !== '' && Number(safeEdits[item.id]) !== (item.safe_stock || 0) ? 'var(--gold)' : undefined }}
                    />
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{item.unit}</span>
                  </div>
                </div>
              ))}
            </div>
          ))}

          <button className="btn-gold" onClick={saveSafeStocks} disabled={savingSafe}
            style={{ width: '100%', padding: 14, fontSize: 16, marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: savingSafe ? .5 : 1 }}>
            <Save size={18} /> {savingSafe ? '儲存中...' : `儲存安全庫存 (${Object.keys(safeEdits).length} 筆變更)`}
          </button>
        </div>
      )}

      {/* ========= TAB: ASSIGN ========= */}
      {tab === 'assign' && (
        <div>
          {/* Batch operation bar */}
          <div className="card" style={{ padding: 12, marginBottom: 12, borderColor: 'var(--border-gold)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gold)', marginBottom: 10 }}>批量操作（已勾選 {selected.size} 筆）</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              <button onClick={selectAll} style={miniBtn}>{selected.size === filtered.length ? '取消全選' : '全選'}</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 8 }}>
              <select value={batchOwner} onChange={e => setBatchOwner(e.target.value)} style={{ fontSize: 11, padding: '6px 4px' }}>
                <option value="">負責人...</option>
                {empOptions.map(e => <option key={e.employee_id} value={e.employee_id}>{e.name}</option>)}
              </select>
              <select value={batchDay} onChange={e => setBatchDay(e.target.value)} style={{ fontSize: 11, padding: '6px 4px' }}>
                <option value="">盤點日...</option>
                <option>週一</option><option>週二</option>
              </select>
              <input type="number" placeholder="安全值" value={batchSafe} onChange={e => setBatchSafe(e.target.value)}
                style={{ fontSize: 11, padding: '6px 4px', fontFamily: 'var(--font-mono)' }} />
            </div>
            <button className="btn-gold" onClick={applyBatch} style={{ width: '100%', padding: 10, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Send size={14} /> 批量套用
            </button>
          </div>

          {/* Item list with checkboxes and per-item assignment */}
          {Object.entries(byCat).map(([cat, catItems]) => (
            <div key={cat} style={{ marginBottom: 12 }}>
              <div onClick={() => toggleCat(cat)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)' }}>{cat} ({catItems.length})</span>
                {collapsed.has(cat) ? <ChevronDown size={16} color="var(--text-dim)" /> : <ChevronUp size={16} color="var(--text-dim)" />}
              </div>
              {!collapsed.has(cat) && catItems.map(item => {
                const edit = assignEdits[item.id] || {}
                return (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 0', borderBottom: '1px dashed var(--border)' }}>
                    <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggleSelect(item.id)}
                      style={{ width: 18, height: 18, accentColor: 'var(--gold)', flexShrink: 0, cursor: 'pointer' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{item.sub_category} · {item.unit}</div>
                    </div>
                    <select value={edit.owner || item.owner || ''} onChange={e => setAssignEdits(p => ({ ...p, [item.id]: { ...p[item.id], owner: e.target.value } }))}
                      style={{ width: 75, fontSize: 10, padding: '5px 2px', flexShrink: 0,
                        borderColor: edit.owner && edit.owner !== item.owner ? 'var(--gold)' : undefined }}>
                      <option value="">未指派</option>
                      {empOptions.map(e => <option key={e.employee_id} value={e.employee_id}>{e.name}</option>)}
                    </select>
                    <select value={edit.count_day || item.count_day || ''} onChange={e => setAssignEdits(p => ({ ...p, [item.id]: { ...p[item.id], count_day: e.target.value } }))}
                      style={{ width: 55, fontSize: 10, padding: '5px 2px', flexShrink: 0,
                        borderColor: edit.count_day && edit.count_day !== item.count_day ? 'var(--gold)' : undefined }}>
                      <option value="">—</option>
                      <option>週一</option><option>週二</option>
                    </select>
                  </div>
                )
              })}
            </div>
          ))}

          {Object.keys(assignEdits).length > 0 && (
            <button className="btn-gold" onClick={saveAssignments} disabled={savingAssign}
              style={{ width: '100%', padding: 14, fontSize: 16, marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: savingAssign ? .5 : 1 }}>
              <Save size={18} /> {savingAssign ? '儲存中...' : `儲存指派 (${Object.keys(assignEdits).length} 筆)`}
            </button>
          )}
        </div>
      )}

      {/* ========= TAB: RECORDS ========= */}
      {tab === 'records' && (
        <div>
          {records.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 30, color: 'var(--text-dim)' }}>無盤點紀錄</div>
          ) : records.map((r, i) => (
            <div key={r.id || i} className="card" style={{ padding: 10, marginBottom: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{r.item_name}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 8 }}>{r.staff_code}</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                    {r.before_stock}→{r.after_stock}
                  </span>
                  <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: r.diff > 0 ? 'var(--green)' : r.diff < 0 ? 'var(--red)' : 'var(--text-muted)' }}>
                    {r.diff > 0 ? '+' : ''}{r.diff}
                  </span>
                </div>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                {r.source} · {r.created_at?.slice(0, 16)}
                {r.note && <span> · {r.note}</span>}
                {r.is_low && <span style={{ color: 'var(--red)', fontWeight: 700 }}> ⚠低庫存</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, color }) {
  return (
    <div className="card" style={{ padding: 8, textAlign: 'center' }}>
      <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>{label}</div>
      <div style={{ fontSize: 18, fontFamily: 'var(--font-mono)', fontWeight: 700, color: color || 'var(--text)' }}>{value}</div>
    </div>
  )
}

const miniBtn = {
  padding: '5px 10px', borderRadius: 12, fontSize: 10, fontWeight: 600,
  cursor: 'pointer', background: 'var(--gold-glow)', color: 'var(--gold)',
  border: '1px solid var(--border-gold)',
}
