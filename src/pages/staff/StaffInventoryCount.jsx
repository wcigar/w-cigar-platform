// 員工盤點頁 — 列出 inventory_master.owner = 我 的品項、輸入實際數、自動寫 POS 庫存
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { Package, Search, Save, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { format } from 'date-fns'

export default function StaffInventoryCount() {
  const { user } = useAuth()
  const [items, setItems] = useState([])
  const [counts, setCounts] = useState({}) // { [item_id]: counted_stock }
  const [notes, setNotes] = useState({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('ALL')
  const today = format(new Date(), 'yyyy-MM-dd')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('inventory_master')
      .select('id, name, category, sub_category, current_stock, safe_stock, unit, is_low, last_count_date, image_url')
      .eq('owner', user.employee_id)
      .eq('enabled', true)
      .order('category')
      .order('name')
    if (error) { console.error(error); setLoading(false); return }
    // 載入今天已盤的紀錄、預填輸入欄
    const { data: doneToday } = await supabase
      .from('inventory_tasks')
      .select('item_id, counted_stock, note')
      .eq('employee_id', user.employee_id)
      .eq('task_date', today)
    const doneMap = {}; const noteMap = {}
    ;(doneToday || []).forEach(d => {
      doneMap[d.item_id] = d.counted_stock
      if (d.note) noteMap[d.item_id] = d.note
    })
    setItems(data || [])
    setCounts(doneMap)
    setNotes(noteMap)
    setLoading(false)
  }

  function setCount(id, val) {
    setCounts(p => ({ ...p, [id]: val === '' ? '' : Math.max(0, +val || 0) }))
  }

  async function submitAll() {
    const toSubmit = items.filter(it => counts[it.id] !== undefined && counts[it.id] !== '')
    if (toSubmit.length === 0) return alert('請至少輸入一個品項數量')
    if (!confirm(`確定送出 ${toSubmit.length} 筆盤點？\n會立即同步到 POS 庫存。`)) return
    setSubmitting(true)
    let success = 0, failed = []
    for (const it of toSubmit) {
      const counted = +counts[it.id]
      // 走 staff_count_inventory RPC：
      //   一次完成 inventory_tasks (審計) + stock_transactions (channel='count', direction='set')
      //   + trigger 自動同步 inventory_master.current_stock = counted
      //   + 跟 POS 結帳走同一張 stock_transactions、完整對帳
      const { data, error } = await supabase.rpc('staff_count_inventory', {
        p_employee_id: user.employee_id,
        p_inv_master_id: it.id,
        p_counted_stock: counted,
        p_note: notes[it.id] || null,
      })
      if (error) { failed.push(`${it.name}: ${error.message}`); continue }
      if (!data?.success) { failed.push(`${it.name}: ${data?.error || 'unknown'}`); continue }
      success++
    }
    setSubmitting(false)
    if (failed.length > 0) alert(`✅ 成功 ${success}、❌ 失敗 ${failed.length}：\n${failed.join('\n')}`)
    else alert(`✅ 已盤 ${success} 筆、POS 庫存同步完成`)
    load()
  }

  // category filter chips
  const categories = [...new Set(items.map(i => i.category).filter(Boolean))]
  const filtered = items.filter(it => {
    if (categoryFilter !== 'ALL' && it.category !== categoryFilter) return false
    if (search && !it.name?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })
  const doneCount = items.filter(it => counts[it.id] !== undefined && counts[it.id] !== '').length
  const lowItems = filtered.filter(it => it.is_low).length
  const grouped = {}
  filtered.forEach(it => { const c = it.category || '其他'; if (!grouped[c]) grouped[c] = []; grouped[c].push(it) })

  if (loading) return <div className="page-container">{[1,2,3,4].map(i => <div key={i} className="loading-shimmer" style={{ height: 80, marginBottom: 8 }} />)}</div>

  return (
    <div className="page-container fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Package size={20} color="var(--gold)" />
        <span className="section-title" style={{ marginBottom: 0 }}>📋 我的盤點 — {user.name}</span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 12 }}>
        輸入實際數量、送出後**立即同步到 POS 庫存**。差異會留紀錄。
      </div>

      {/* 進度 + 警示 */}
      <div className="card" style={{ padding: 14, marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>負責品項 / 已盤</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--gold)' }}>{doneCount} / {items.length}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: lowItems > 0 ? 'var(--red)' : 'var(--text-dim)' }}>低庫存警示</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: lowItems > 0 ? 'var(--red)' : 'var(--green)' }}>
            {lowItems > 0 && <AlertTriangle size={16} style={{ verticalAlign: -3, marginRight: 4 }} />}
            {lowItems}
          </div>
        </div>
      </div>

      {/* search + category */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center' }}>
        <Search size={14} color="var(--text-muted)" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋品名"
          style={{ flex: 1, padding: 8, fontSize: 13, background: 'var(--black-card)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }} />
      </div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, overflowX: 'auto', paddingBottom: 4 }}>
        <button onClick={() => setCategoryFilter('ALL')}
          style={{ padding: '6px 10px', borderRadius: 16, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer',
            background: categoryFilter === 'ALL' ? 'var(--gold-glow)' : 'transparent',
            color: categoryFilter === 'ALL' ? 'var(--gold)' : 'var(--text-dim)',
            border: categoryFilter === 'ALL' ? '1px solid var(--border-gold)' : '1px solid var(--border)' }}>
          全部 ({items.length})
        </button>
        {categories.map(c => {
          const n = items.filter(i => i.category === c).length
          return (
            <button key={c} onClick={() => setCategoryFilter(c)}
              style={{ padding: '6px 10px', borderRadius: 16, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer',
                background: categoryFilter === c ? 'var(--gold-glow)' : 'transparent',
                color: categoryFilter === c ? 'var(--gold)' : 'var(--text-dim)',
                border: categoryFilter === c ? '1px solid var(--border-gold)' : '1px solid var(--border)' }}>
              {c} ({n})
            </button>
          )
        })}
      </div>

      {/* 品項列表 */}
      {Object.entries(grouped).map(([cat, list]) => (
        <div key={cat} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gold)', marginBottom: 6, paddingBottom: 4, borderBottom: '1px solid var(--border)' }}>
            {cat} ({list.length})
          </div>
          {list.map(it => {
            const counted = counts[it.id]
            const diff = (counted !== undefined && counted !== '') ? +counted - (+it.current_stock || 0) : null
            const isDone = counted !== undefined && counted !== ''
            return (
              <div key={it.id} className="card" style={{ padding: 10, marginBottom: 6,
                borderColor: it.is_low ? 'rgba(196,77,77,.4)' : isDone ? 'rgba(77,168,108,.3)' : 'var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {it.image_url && <img src={it.image_url} alt="" style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover' }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      {it.name}
                      {it.is_low && <span style={{ marginLeft: 6, fontSize: 9, padding: '1px 5px', background: 'rgba(196,77,77,.2)', color: 'var(--red)', borderRadius: 3, fontWeight: 700 }}>⚠️ 低庫存</span>}
                      {isDone && <CheckCircle2 size={12} color="var(--green)" style={{ marginLeft: 6, verticalAlign: -2 }} />}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      系統 <b style={{ color: 'var(--text)' }}>{it.current_stock}</b> {it.unit} · 安全 {it.safe_stock}
                      {it.last_count_date && <span> · 上次盤 {it.last_count_date.slice(5)}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                    <input type="number" inputMode="decimal" min="0" step="0.1"
                      value={counted === undefined ? '' : counted}
                      onChange={e => setCount(it.id, e.target.value)}
                      placeholder={String(it.current_stock || 0)}
                      style={{ width: 80, fontSize: 14, padding: 6, textAlign: 'center', fontWeight: 700,
                        background: isDone ? 'rgba(77,168,108,.08)' : 'var(--black-card)',
                        border: `1px solid ${isDone ? 'rgba(77,168,108,.4)' : 'var(--border)'}`,
                        borderRadius: 6, color: isDone ? 'var(--green)' : 'var(--text)' }} />
                    {diff !== null && diff !== 0 && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: diff > 0 ? 'var(--green)' : 'var(--red)' }}>
                        {diff > 0 ? '+' : ''}{diff}
                      </span>
                    )}
                  </div>
                </div>
                {diff !== null && Math.abs(diff) > 0 && (
                  <input
                    value={notes[it.id] || ''}
                    onChange={e => setNotes(p => ({ ...p, [it.id]: e.target.value }))}
                    placeholder="差異原因（必填、如：賣出未扣 / 損耗 / 補貨未入）"
                    style={{ marginTop: 6, width: '100%', fontSize: 11, padding: 6, background: 'var(--black-card)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)' }}
                  />
                )}
              </div>
            )
          })}
        </div>
      ))}

      {filtered.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>
          {items.length === 0 ? '✅ 你目前沒有負責盤點的品項' : '無符合條件的品項'}
        </div>
      )}

      {/* 送出按鈕 */}
      {items.length > 0 && (
        <div style={{ position: 'sticky', bottom: 0, padding: '12px 0', background: 'linear-gradient(to top, var(--bg) 70%, transparent)', marginTop: 16 }}>
          <button onClick={submitAll} disabled={submitting || doneCount === 0}
            style={{ width: '100%', padding: 16, fontSize: 16, fontWeight: 700, borderRadius: 10, cursor: 'pointer',
              background: submitting || doneCount === 0 ? 'rgba(212,175,55,.3)' : 'linear-gradient(135deg, #c9a84c, #8b7a3e)',
              color: '#0a0a0a', border: 'none', letterSpacing: 2 }}>
            <Save size={16} style={{ verticalAlign: -3, marginRight: 6 }} />
            {submitting ? '上傳中...' : `送出 ${doneCount} 筆 → 同步 POS`}
          </button>
        </div>
      )}
    </div>
  )
}
