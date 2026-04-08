import InventoryTrend from './InventoryTrend'
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { Package, Save, Send, Search, TrendingUp, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Users, Settings, ClipboardList, History, ShoppingCart, Copy, Check } from 'lucide-react'
import { format } from 'date-fns'

const REASON_LABELS = { normal: '正常消耗', damage: '損耗報廢', restock: '進貨入庫', error: '盤點誤差', gift: '贈送客戶', other: '其他' }
const REASON_COLORS = { normal: 'var(--green)', damage: 'var(--red)', restock: 'var(--blue)', error: '#f59e0b', gift: 'var(--gold)', other: 'var(--text-muted)' }

export default function InventoryMgmt() {
  const [tab, setTab] = useState('overview')
  const [items, setItems] = useState([])
  const [employees, setEmployees] = useState([])
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [keyword, setKeyword] = useState('')
  const [msg, setMsg] = useState('')
  const [safeEdits, setSafeEdits] = useState({})
  const [savingSafe, setSavingSafe] = useState(false)
  const [assignEdits, setAssignEdits] = useState({})
  const [savingAssign, setSavingAssign] = useState(false)
  const [selected, setSelected] = useState(new Set())
  const [batchOwner, setBatchOwner] = useState('')
  const [batchDay, setBatchDay] = useState('')
  const [batchSafe, setBatchSafe] = useState('')
  const [collapsed, setCollapsed] = useState(new Set())
  const [copied, setCopied] = useState(false)
  const [purchaseEdits, setPurchaseEdits] = useState({})

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [itemRes, empRes, recRes] = await Promise.all([
      supabase.from('inventory_master').select('*').order('category').order('sub_category').order('name'),
      supabase.from('employees').select('*').eq('is_active', true).order('name'),
      supabase.from('inventory_records').select('*').order('time', { ascending: false }).limit(100),
    ])
    setItems(itemRes.data || [])
    setEmployees(empRes.data || [])
    setRecords(recRes.data || [])
    setLoading(false)
  }

  function flash(text) { setMsg(text); setTimeout(() => setMsg(''), 3000) }

  const filtered = useMemo(() => {
    let list = items
    if (filter === 'low') list = list.filter(i => i.is_low)
    if (filter === 'enabled') list = list.filter(i => i.enabled)
    if (filter === 'disabled') list = list.filter(i => !i.enabled)
    if (filter === 'noSafe') list = list.filter(i => !i.safe_stock && i.safe_stock !== 0)
    if (keyword) {
      const kw = keyword.toLowerCase()
      list = list.filter(i => i.name?.toLowerCase().includes(kw) || i.id?.toLowerCase().includes(kw) || i.category?.toLowerCase().includes(kw))
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

  // Purchase suggestions
  const purchaseItems = useMemo(() => {
    return items.filter(i => i.enabled && i.safe_stock > 0 && (i.current_stock || 0) < i.safe_stock)
      .map(i => ({
        ...i,
        need: (purchaseEdits[i.id] != null ? Number(purchaseEdits[i.id]) : (i.safe_stock * 2) - (i.current_stock || 0)),
        deficit: i.safe_stock - (i.current_stock || 0),
      }))
      .sort((a, b) => {
        const aR = (a.current_stock || 0) / a.safe_stock
        const bR = (b.current_stock || 0) / b.safe_stock
        return aR - bR
      })
  }, [items, purchaseEdits])

  const purchaseByCat = useMemo(() => {
    const map = {}
    purchaseItems.forEach(i => { const c = i.category || '未分類'; if (!map[c]) map[c] = []; map[c].push(i) })
    return map
  }, [purchaseItems])

  function generatePurchaseText() {
    const date = format(new Date(), 'yyyy/MM/dd')
    let text = 'W Cigar Bar 採購建議單\n日期：' + date + '\n\n'
    Object.entries(purchaseByCat).forEach(([cat, catItems]) => {
      text += '【' + cat + '】\n'
      catItems.forEach(i => {
        text += '  ' + i.name + '　' + i.need + i.unit + '（現有 ' + (i.current_stock || 0) + '，安全 ' + i.safe_stock + '）\n'
      })
      text += '\n'
    })
    text += '共 ' + purchaseItems.length + ' 項需採購'
    return text
  }

  function copyPurchaseList() {
    const text = generatePurchaseText()
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

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
    setSavingSafe(false); setSafeEdits({}); flash('✅ 已更新 ' + ok + ' 筆安全庫存'); loadAll()
  }

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
    setSavingAssign(false); setAssignEdits({}); flash('✅ 已指派 ' + ok + ' 筆'); loadAll()
  }

  function toggleSelect(id) { setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  function selectAll() { selected.size === filtered.length ? setSelected(new Set()) : setSelected(new Set(filtered.map(i => i.id))) }

  async function applyBatch() {
    if (!selected.size) return flash('請先勾選品項')
    const update = {}
    if (batchOwner) update.owner = batchOwner
    if (batchDay) update.count_day = batchDay
    if (batchSafe !== '') update.safe_stock = Number(batchSafe)
    if (!Object.keys(update).length) return flash('請選擇要批量修改的項目')
    if (!confirm('確定批量修改 ' + selected.size + ' 筆品項？')) return
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
    flash('✅ 批量更新 ' + ok + ' 筆'); setSelected(new Set()); setBatchOwner(''); setBatchDay(''); setBatchSafe(''); loadAll()
  }

  function toggleCat(cat) { setCollapsed(prev => { const n = new Set(prev); n.has(cat) ? n.delete(cat) : n.add(cat); return n }) }

  const empOptions = employees.filter(e => e.employee_id !== 'ADMIN')

  const tabs = [
    { id: 'overview', icon: <Package size={13} />, label: '品項總覽' },
    { id: 'safe', icon: <Settings size={13} />, label: '安全庫存' },
    { id: 'assign', icon: <Users size={13} />, label: '盤點指派' },
    { id: 'trend', icon: <TrendingUp size={13} />, label: '庫存走勢' },
    { id: 'purchase', icon: <ShoppingCart size={13} />, label: '採購建議(' + purchaseItems.length + ')' },
    { id: 'records', icon: <History size={13} />, label: '盤點紀錄' },
  ]

  if (loading) return <div>{[1, 2, 3].map(i => <div key={i} className="loading-shimmer" style={{ height: 80, marginBottom: 8 }} />)}</div>

  return (
    <div>
      {msg && <div style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', background: 'var(--gold)', color: '#000', padding: '10px 20px', borderRadius: 12, fontSize: 14, fontWeight: 700, zIndex: 999, boxShadow: '0 4px 20px rgba(0,0,0,.4)' }}>{msg}</div>}

      <div style={{ display: 'flex', gap: 4, marginBottom: 16, overflowX: 'auto' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: '7px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4, background: tab === t.id ? 'var(--gold-glow)' : 'transparent', color: tab === t.id ? 'var(--gold)' : 'var(--text-dim)', border: tab === t.id ? '1px solid var(--border-gold)' : '1px solid var(--border)' }}>{t.icon}{t.label}</button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, marginBottom: 14 }}>
        <StatCard label="總品項" value={items.length} />
        <StatCard label="啟用中" value={totalEnabled} color="var(--gold)" />
        <StatCard label="低庫存" value={lowCount} color={lowCount > 0 ? 'var(--red)' : 'var(--green)'} />
        <StatCard label="需採購" value={purchaseItems.length} color={purchaseItems.length > 0 ? 'var(--red)' : 'var(--green)'} />
      </div>

      {tab !== 'purchase' && tab !== 'records' && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input placeholder="搜尋品項/分類" value={keyword} onChange={e => setKeyword(e.target.value)} style={{ width: '100%', paddingLeft: 30, fontSize: 12, padding: '8px 8px 8px 30px' }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 14, overflowX: 'auto', flexWrap: 'wrap' }}>
            {[['all', '全部'], ['low', '低庫存(' + lowCount + ')'], ['enabled', '啟用'], ['disabled', '停用'], ['noSafe', '未設安全值']].map(([v, l]) => (
              <button key={v} onClick={() => setFilter(v)} style={{ padding: '5px 10px', borderRadius: 16, fontSize: 10, fontWeight: 600, cursor: 'pointer', background: filter === v ? 'var(--gold-glow)' : 'transparent', color: filter === v ? 'var(--gold)' : 'var(--text-dim)', border: filter === v ? '1px solid var(--border-gold)' : '1px solid var(--border)' }}>{l}</button>
            ))}
          </div>
        </>
      )}

      {/* OVERVIEW */}
      {tab === 'overview' && Object.entries(byCat).map(([cat, catItems]) => (
        <div key={cat} style={{ marginBottom: 12 }}>
          <div onClick={() => toggleCat(cat)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)' }}>{cat} ({catItems.length})</span>
            {collapsed.has(cat) ? <ChevronDown size={16} color="var(--text-dim)" /> : <ChevronUp size={16} color="var(--text-dim)" />}
          </div>
          {!collapsed.has(cat) && catItems.map(item => (
            <div key={item.id} className="card" style={{ padding: 10, marginBottom: 4, borderColor: item.is_low ? 'rgba(196,77,77,.3)' : undefined }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600 }}>{item.name}</div><div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{item.sub_category} · {item.unit} · {item.count_day} · {item.owner || '未指派'}{item.is_low && <span style={{ color: 'var(--red)', marginLeft: 6, fontWeight: 700 }}>⚠低庫存</span>}</div></div>
                <div style={{ textAlign: 'right', minWidth: 70 }}><div style={{ fontSize: 18, fontFamily: 'var(--font-mono)', fontWeight: 700, color: item.is_low ? 'var(--red)' : 'var(--text)' }}>{item.current_stock ?? '—'}</div><div style={{ fontSize: 9, color: 'var(--text-muted)' }}>安全:{item.safe_stock ?? '未設'}</div></div>
              </div>
            </div>
          ))}
        </div>
      ))}

      {/* SAFE STOCK */}
      {tab === 'safe' && (
        <div>
          <div className="card" style={{ padding: 12, marginBottom: 12, background: 'var(--gold-glow)', borderColor: 'var(--border-gold)' }}><div style={{ fontSize: 12, color: 'var(--gold)', fontWeight: 600 }}>💡 直接修改安全庫存值，改完點底部「儲存」</div></div>
          {Object.entries(byCat).map(([cat, catItems]) => (
            <div key={cat} style={{ marginBottom: 12 }}>
              <div onClick={() => toggleCat(cat)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', padding: '8px 0', borderBottom: '1px solid var(--border)' }}><span style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)' }}>{cat} ({catItems.length})</span>{collapsed.has(cat) ? <ChevronDown size={16} color="var(--text-dim)" /> : <ChevronUp size={16} color="var(--text-dim)" />}</div>
              {!collapsed.has(cat) && catItems.map(item => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px dashed var(--border)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div><div style={{ fontSize: 10, color: 'var(--text-muted)' }}>現有:{item.current_stock ?? '—'} {item.unit}</div></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                    <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>安全值</span>
                    <input type="tel" inputMode="numeric" pattern="[0-9]*" min="0" value={safeEdits[item.id] ?? item.safe_stock ?? ''} onChange={e => setSafeEdits(p => ({ ...p, [item.id]: e.target.value }))} style={{ width: 60, fontSize: 14, fontFamily: 'var(--font-mono)', fontWeight: 700, textAlign: 'center', padding: '6px 4px', borderColor: safeEdits[item.id] != null && Number(safeEdits[item.id]) !== (item.safe_stock || 0) ? 'var(--gold)' : undefined }} />
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{item.unit}</span>
                  </div>
                </div>
              ))}
            </div>
          ))}
          <button className="btn-gold" onClick={saveSafeStocks} disabled={savingSafe} style={{ width: '100%', padding: 14, fontSize: 16, marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: savingSafe ? .5 : 1 }}><Save size={18} /> {savingSafe ? '儲存中...' : '儲存安全庫存 (' + Object.keys(safeEdits).length + ' 筆)'}</button>
        </div>
      )}

      {/* ASSIGN */}
      {tab === 'assign' && (
        <div>
          <div className="card" style={{ padding: 12, marginBottom: 12, borderColor: 'var(--border-gold)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gold)', marginBottom: 10 }}>批量操作（已勾選 {selected.size} 筆）</div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}><button onClick={selectAll} style={miniBtn}>{selected.size === filtered.length ? '取消全選' : '全選'}</button></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 8 }}>
              <select value={batchOwner} onChange={e => setBatchOwner(e.target.value)} style={{ fontSize: 11, padding: '6px 4px' }}><option value="">負責人...</option>{empOptions.map(e => <option key={e.employee_id} value={e.employee_id}>{e.name}</option>)}</select>
              <select value={batchDay} onChange={e => setBatchDay(e.target.value)} style={{ fontSize: 11, padding: '6px 4px' }}><option value="">盤點日...</option><option>週一</option><option>週二</option></select>
              <input type="tel" inputMode="numeric" pattern="[0-9]*" placeholder="安全值" value={batchSafe} onChange={e => setBatchSafe(e.target.value)} style={{ fontSize: 11, padding: '6px 4px', fontFamily: 'var(--font-mono)' }} />
            </div>
            <button className="btn-gold" onClick={applyBatch} style={{ width: '100%', padding: 10, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Send size={14} /> 批量套用</button>
          </div>
          {Object.entries(byCat).map(([cat, catItems]) => (
            <div key={cat} style={{ marginBottom: 12 }}>
              <div onClick={() => toggleCat(cat)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', padding: '8px 0', borderBottom: '1px solid var(--border)' }}><span style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)' }}>{cat} ({catItems.length})</span>{collapsed.has(cat) ? <ChevronDown size={16} color="var(--text-dim)" /> : <ChevronUp size={16} color="var(--text-dim)" />}</div>
              {!collapsed.has(cat) && catItems.map(item => {
                const edit = assignEdits[item.id] || {}
                return (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 0', borderBottom: '1px dashed var(--border)' }}>
                    <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggleSelect(item.id)} style={{ width: 18, height: 18, accentColor: 'var(--gold)', flexShrink: 0, cursor: 'pointer' }} />
                    <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div><div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{item.sub_category} · {item.unit}</div></div>
                    <select value={edit.owner || item.owner || ''} onChange={e => setAssignEdits(p => ({ ...p, [item.id]: { ...p[item.id], owner: e.target.value } }))} style={{ width: 75, fontSize: 10, padding: '5px 2px', flexShrink: 0, borderColor: edit.owner && edit.owner !== item.owner ? 'var(--gold)' : undefined }}><option value="">未指派</option>{empOptions.map(e => <option key={e.employee_id} value={e.employee_id}>{e.name}</option>)}</select>
                    <select value={edit.count_day || item.count_day || ''} onChange={e => setAssignEdits(p => ({ ...p, [item.id]: { ...p[item.id], count_day: e.target.value } }))} style={{ width: 55, fontSize: 10, padding: '5px 2px', flexShrink: 0, borderColor: edit.count_day && edit.count_day !== item.count_day ? 'var(--gold)' : undefined }}><option value="">—</option><option>週一</option><option>週二</option></select>
                  </div>
                )
              })}
            </div>
          ))}
          {Object.keys(assignEdits).length > 0 && <button className="btn-gold" onClick={saveAssignments} disabled={savingAssign} style={{ width: '100%', padding: 14, fontSize: 16, marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: savingAssign ? .5 : 1 }}><Save size={18} /> {savingAssign ? '儲存中...' : '儲存指派 (' + Object.keys(assignEdits).length + ' 筆)'}</button>}
        </div>
      )}

      {tab === 'trend' && <InventoryTrend />}

      {/* PURCHASE SUGGESTIONS */}
      {tab === 'purchase' && (
        <div>
          {purchaseItems.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--green)', fontSize: 16, fontWeight: 600 }}>✅ 所有品項庫存充足，無需採購</div>
          ) : (
            <>
              <div className="card" style={{ padding: 12, marginBottom: 12, background: 'var(--gold-glow)', borderColor: 'var(--border-gold)' }}>
                <div style={{ fontSize: 12, color: 'var(--gold)', fontWeight: 600 }}>📋 系統根據安全庫存自動生成，建議量 = 安全值×2 - 現有量，可手動調整</div>
              </div>

              <button className="btn-gold" onClick={copyPurchaseList} style={{ width: '100%', padding: 14, fontSize: 15, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {copied ? <><Check size={18} /> 已複製！可貼到 LINE 發給供應商</> : <><Copy size={18} /> 一鍵複製採購清單</>}
              </button>

              {Object.entries(purchaseByCat).map(([cat, catItems]) => (
                <div key={cat} style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)', padding: '8px 0 6px', borderBottom: '1px solid var(--border)' }}>{cat} ({catItems.length})</div>
                  {catItems.map(item => {
                    const pct = item.safe_stock > 0 ? Math.round((item.current_stock || 0) / item.safe_stock * 100) : 0
                    return (
                      <div key={item.id} className="card" style={{ padding: 12, marginBottom: 4, borderColor: pct === 0 ? 'rgba(196,77,77,.4)' : 'rgba(245,158,11,.3)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>{item.name}</div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{item.sub_category} · {item.owner}</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 16, fontFamily: 'var(--font-mono)', fontWeight: 700, color: pct === 0 ? 'var(--red)' : '#f59e0b' }}>{item.current_stock || 0}<span style={{ fontSize: 11, color: 'var(--text-muted)' }}>/{item.safe_stock}</span></div>
                            <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{pct}%</div>
                          </div>
                        </div>
                        <div style={{ height: 4, background: 'var(--black)', borderRadius: 2, overflow: 'hidden', marginBottom: 8 }}>
                          <div style={{ height: '100%', width: Math.min(pct, 100) + '%', background: pct === 0 ? 'var(--red)' : pct < 50 ? '#f59e0b' : 'var(--green)', borderRadius: 2 }} />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 12, color: 'var(--text-dim)', flexShrink: 0 }}>建議採購：</span>
                          <input type="tel" inputMode="numeric" pattern="[0-9]*" min="0" value={purchaseEdits[item.id] ?? item.need} onChange={e => setPurchaseEdits(p => ({ ...p, [item.id]: e.target.value }))} style={{ width: 60, fontSize: 16, fontFamily: 'var(--font-mono)', fontWeight: 700, textAlign: 'center', padding: '4px', color: 'var(--gold)' }} />
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{item.unit}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}

              <button className="btn-gold" onClick={copyPurchaseList} style={{ width: '100%', padding: 14, fontSize: 15, marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {copied ? <><Check size={18} /> 已複製！</> : <><Copy size={18} /> 複製採購清單</>}
              </button>
            </>
          )}
        </div>
      )}

      {/* RECORDS */}
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
                  {r.reason_code && <span style={{ fontSize: 10, marginLeft: 6, padding: '2px 6px', borderRadius: 8, background: (REASON_COLORS[r.reason_code] || 'var(--text-muted)') + '18', color: REASON_COLORS[r.reason_code] || 'var(--text-muted)', fontWeight: 600 }}>{REASON_LABELS[r.reason_code] || r.reason_code}</span>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{r.before_stock}→{r.after_stock}</span>
                  <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: r.diff > 0 ? 'var(--green)' : r.diff < 0 ? 'var(--red)' : 'var(--text-muted)' }}>{r.diff > 0 ? '+' : ''}{r.diff}</span>
                </div>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                {r.source} · {r.time?.slice(0, 16)}
                {r.note && <span> · {r.note}</span>}
                {r.is_low && <span style={{ color: 'var(--red)', fontWeight: 700 }}> ⚠低庫存</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {filtered.length === 0 && tab !== 'purchase' && tab !== 'records' && <div className="card" style={{ textAlign: 'center', padding: 30, color: 'var(--text-dim)' }}>無符合條件的品項</div>}
    </div>
  )
}

function StatCard({ label, value, color }) {
  return <div className="card" style={{ padding: 8, textAlign: 'center' }}><div style={{ fontSize: 9, color: 'var(--text-dim)' }}>{label}</div><div style={{ fontSize: 18, fontFamily: 'var(--font-mono)', fontWeight: 700, color: color || 'var(--text)' }}>{value}</div></div>
}

const miniBtn = { padding: '5px 10px', borderRadius: 12, fontSize: 10, fontWeight: 600, cursor: 'pointer', background: 'var(--gold-glow)', color: 'var(--gold)', border: '1px solid var(--border-gold)' }
