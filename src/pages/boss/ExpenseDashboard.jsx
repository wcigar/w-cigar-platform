import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { BarChart3, TrendingUp, Plus, Trash2, Image } from 'lucide-react'
import { format, subMonths } from 'date-fns'

const COLORS = ['#c9a84c','#4da86c','#4d8ac4','#c44d4d','#f59e0b','#8b5cf6','#ec4899','#14b8a6','#f97316','#6366f1','#84cc16','#a855f7']

function PieChart({ data, size = 180 }) {
  if (!data.length) return null
  const total = data.reduce((s, d) => s + d.value, 0)
  if (total === 0) return null
  const cx = size / 2, cy = size / 2, r = size / 2 - 8
  let startAngle = -Math.PI / 2
  const slices = data.map((d, i) => {
    const angle = (d.value / total) * Math.PI * 2
    const endAngle = startAngle + angle
    const largeArc = angle > Math.PI ? 1 : 0
    const x1 = cx + r * Math.cos(startAngle), y1 = cy + r * Math.sin(startAngle)
    const x2 = cx + r * Math.cos(endAngle), y2 = cy + r * Math.sin(endAngle)
    const path = 'M ' + cx + ' ' + cy + ' L ' + x1 + ' ' + y1 + ' A ' + r + ' ' + r + ' 0 ' + largeArc + ' 1 ' + x2 + ' ' + y2 + ' Z'
    const midAngle = startAngle + angle / 2
    const lx = cx + r * 0.65 * Math.cos(midAngle), ly = cy + r * 0.65 * Math.sin(midAngle)
    startAngle = endAngle
    return { ...d, path, color: COLORS[i % COLORS.length], pct: Math.round(d.value / total * 100), lx, ly }
  })
  return (
    <svg viewBox={'0 0 ' + size + ' ' + size} style={{ width: '100%', maxWidth: size, height: size, display: 'block', margin: '0 auto' }}>
      {slices.map((s, i) => <path key={i} d={s.path} fill={s.color} stroke="var(--black-card)" strokeWidth="2" />)}
      {slices.filter(s => s.pct >= 8).map((s, i) => <text key={'t' + i} x={s.lx} y={s.ly} fill="#fff" fontSize="10" fontWeight="700" textAnchor="middle" dominantBaseline="middle">{s.pct}%</text>)}
    </svg>
  )
}

export default function ExpenseDashboard() {
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'))
  const [expenses, setExpenses] = useState([])
  const [allExpenses, setAllExpenses] = useState([])
  const [categories, setCategories] = useState([])
  const [vendors, setVendors] = useState([])
  const [tab, setTab] = useState('overview')
  const [photoModal, setPhotoModal] = useState(null)
  const [newCat, setNewCat] = useState({ name: '', icon: '📁' })
  const [newVendor, setNewVendor] = useState({ name: '', category: '', contact: '' })
  const [loading, setLoading] = useState(true)
  const months = Array.from({ length: 6 }, (_, i) => format(subMonths(new Date(), i), 'yyyy-MM'))

  useEffect(() => { load() }, [month])

  async function load() {
    setLoading(true)
    const s = month + '-01', e = month + '-31'
    const sixAgo = format(subMonths(new Date(), 5), 'yyyy-MM-01')
    const [xR, aR, cR, vR] = await Promise.all([
      supabase.from('expenses').select('*').gte('date', s).lte('date', e).order('date', { ascending: false }),
      supabase.from('expenses').select('date, category, amount').gte('date', sixAgo).order('date'),
      supabase.from('expense_categories').select('*').order('sort_order'),
      supabase.from('expense_vendors').select('*').order('name'),
    ])
    setExpenses(xR.data || []); setAllExpenses(aR.data || [])
    setCategories(cR.data || []); setVendors(vR.data || [])
    setLoading(false)
  }

  const total = expenses.reduce((s, x) => s + (x.amount || 0), 0)
  const byCat = useMemo(() => {
    const map = {}
    expenses.forEach(x => { const c = x.category || '未分類'; map[c] = (map[c] || 0) + (x.amount || 0) })
    return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }))
  }, [expenses])

  const byVendor = useMemo(() => {
    const map = {}
    expenses.forEach(x => { if (x.vendor) map[x.vendor] = (map[x.vendor] || 0) + (x.amount || 0) })
    return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }))
  }, [expenses])

  const byHandler = useMemo(() => {
    const map = {}
    expenses.forEach(x => { const h = x.handler || '未知'; map[h] = (map[h] || 0) + (x.amount || 0) })
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [expenses])

  const monthTrend = useMemo(() => {
    const map = {}
    allExpenses.forEach(x => { const m = x.date?.slice(0, 7); if (m) map[m] = (map[m] || 0) + (x.amount || 0) })
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]))
  }, [allExpenses])

  async function addCategory() {
    if (!newCat.name) return
    await supabase.from('expense_categories').insert({ name: newCat.name, icon: newCat.icon || '📁', sort_order: categories.length + 1, enabled: true })
    setNewCat({ name: '', icon: '📁' }); load()
  }
  async function toggleCat(id, en) { await supabase.from('expense_categories').update({ enabled: en }).eq('id', id); load() }
  async function deleteCat(id) { if (!confirm('刪除？')) return; await supabase.from('expense_categories').delete().eq('id', id); load() }
  async function addVendorFn() {
    if (!newVendor.name) return
    await supabase.from('expense_vendors').insert({ name: newVendor.name, category: newVendor.category, contact: newVendor.contact, enabled: true })
    setNewVendor({ name: '', category: '', contact: '' }); load()
  }
  async function deleteVendor(id) { if (!confirm('刪除？')) return; await supabase.from('expense_vendors').delete().eq('id', id); load() }

  if (loading) return <div>{[1,2,3].map(i => <div key={i} className="loading-shimmer" style={{ height: 60, marginBottom: 8 }} />)}</div>

  return (
    <div>
      {photoModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.9)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setPhotoModal(null)}>
          <div style={{ maxWidth: 500, width: '100%' }} onClick={e => e.stopPropagation()}>
            <img src={photoModal} alt="" style={{ width: '100%', borderRadius: 12, maxHeight: '80vh', objectFit: 'contain' }} />
            <button className="btn-outline" style={{ width: '100%', marginTop: 10 }} onClick={() => setPhotoModal(null)}>關閉</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto' }}>
        {months.map(m => <button key={m} onClick={() => setMonth(m)} style={{ padding: '6px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap', cursor: 'pointer', background: m === month ? 'var(--gold-glow)' : 'transparent', color: m === month ? 'var(--gold)' : 'var(--text-dim)', border: m === month ? '1px solid var(--border-gold)' : '1px solid var(--border)' }}>{parseInt(m.slice(5))}月</button>)}
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 14, overflowX: 'auto' }}>
        {[['overview','支出總覽'],['list','明細'],['trend','趨勢'],['cats','分類管理'],['vendors','廠商管理']].map(([v,l]) => (
          <button key={v} onClick={() => setTab(v)} style={{ padding: '7px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', background: tab === v ? 'var(--gold-glow)' : 'transparent', color: tab === v ? 'var(--gold)' : 'var(--text-dim)', border: tab === v ? '1px solid var(--border-gold)' : '1px solid var(--border)' }}>{l}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <div>
          <div className="card" style={{ padding: 14, marginBottom: 14, textAlign: 'center', borderColor: 'var(--border-gold)' }}>
            <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{parseInt(month.slice(5))}月總支出</div>
            <div style={{ fontSize: 32, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--red)' }}>${total.toLocaleString()}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{expenses.length} 筆</div>
          </div>
          {byCat.length > 0 && (
            <div className="card" style={{ padding: 14, marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}><BarChart3 size={14} /> 分類佔比</div>
              <PieChart data={byCat} />
              <div style={{ marginTop: 10 }}>
                {byCat.map((c, i) => (
                  <div key={c.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px dotted var(--border)', fontSize: 12 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: COLORS[i % COLORS.length], flexShrink: 0 }} />{c.name}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>${c.value.toLocaleString()} <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>({total > 0 ? Math.round(c.value / total * 100) : 0}%)</span></span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {byVendor.length > 0 && (
            <div className="card" style={{ padding: 14, marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)', marginBottom: 8 }}>廠商支出排行</div>
              {byVendor.slice(0, 8).map((v, i) => {
                const pct = total > 0 ? Math.round(v.value / total * 100) : 0
                return (<div key={v.name} style={{ marginBottom: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}><span>{i + 1}. {v.name}</span><span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>${v.value.toLocaleString()}</span></div>
                  <div style={{ height: 6, background: 'var(--black)', borderRadius: 3, overflow: 'hidden' }}><div style={{ height: '100%', width: pct + '%', background: COLORS[i % COLORS.length], borderRadius: 3 }} /></div>
                </div>)
              })}
            </div>
          )}
          {byHandler.length > 0 && (
            <div className="card" style={{ padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)', marginBottom: 8 }}>經手人統計</div>
              {byHandler.map(([name, amt]) => (
                <div key={name} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px dotted var(--border)', fontSize: 12 }}>
                  <span>{name}</span><span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--red)' }}>${amt.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'list' && (
        <div>
          {expenses.length === 0 ? <div className="card" style={{ textAlign: 'center', padding: 30, color: 'var(--text-dim)' }}>本月無支出</div> :
            expenses.map(x => (
              <div key={x.id} className="card" style={{ padding: 12, marginBottom: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600 }}>{x.item || x.category}</div><div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{x.date} · {x.category} · {x.vendor || '無廠商'} · <strong>{x.handler}</strong> · {x.payment}</div></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {x.photo_url && <Image size={14} color="var(--gold)" style={{ cursor: 'pointer' }} onClick={() => setPhotoModal(x.photo_url)} />}
                    <span style={{ fontSize: 16, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--red)' }}>-${(x.amount || 0).toLocaleString()}</span>
                  </div>
                </div>
                {x.note && <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>📝 {x.note}</div>}
              </div>
            ))}
        </div>
      )}

      {tab === 'trend' && (
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}><TrendingUp size={14} /> 近 6 月支出趨勢</div>
          {monthTrend.length === 0 ? <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-dim)', fontSize: 12 }}>無資料</div> : (() => {
            const maxV = Math.max(...monthTrend.map(([_, v]) => v), 1)
            return monthTrend.map(([m, v]) => (
              <div key={m} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: m === month ? 'var(--gold)' : 'var(--text-dim)', width: 35, flexShrink: 0, fontWeight: m === month ? 700 : 400 }}>{parseInt(m.slice(5))}月</span>
                <div style={{ flex: 1, height: 22, background: 'var(--black)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: (v / maxV * 100) + '%', background: m === month ? 'var(--red)' : 'var(--gold)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 6 }}>
                    {v / maxV > 0.3 && <span style={{ fontSize: 10, color: '#fff', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>${v.toLocaleString()}</span>}
                  </div>
                </div>
                {v / maxV <= 0.3 && <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)', width: 60, textAlign: 'right' }}>${v.toLocaleString()}</span>}
              </div>
            ))
          })()}
        </div>
      )}

      {tab === 'cats' && (
        <div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            <input placeholder="icon" value={newCat.icon} onChange={e => setNewCat(p => ({ ...p, icon: e.target.value }))} style={{ width: 50, fontSize: 18, textAlign: 'center', padding: 6 }} />
            <input placeholder="分類名稱" value={newCat.name} onChange={e => setNewCat(p => ({ ...p, name: e.target.value }))} style={{ flex: 1, fontSize: 13, padding: 8 }} />
            <button className="btn-gold" onClick={addCategory} style={{ padding: '8px 14px', fontSize: 12 }}><Plus size={14} /></button>
          </div>
          {categories.map(c => (
            <div key={c.id} className="card" style={{ padding: 10, marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: c.enabled ? 1 : .5 }}>
              <span style={{ fontSize: 13 }}>{c.icon} {c.name}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => toggleCat(c.id, !c.enabled)} style={{ background: 'none', border: 'none', color: c.enabled ? 'var(--red)' : 'var(--green)', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>{c.enabled ? '停用' : '啟用'}</button>
                <button onClick={() => deleteCat(c.id)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer' }}><Trash2 size={12} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'vendors' && (
        <div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
            <input placeholder="廠商名稱" value={newVendor.name} onChange={e => setNewVendor(p => ({ ...p, name: e.target.value }))} style={{ flex: 2, minWidth: 100, fontSize: 13, padding: 8 }} />
            <select value={newVendor.category} onChange={e => setNewVendor(p => ({ ...p, category: e.target.value }))} style={{ flex: 1, fontSize: 12, padding: 8 }}>
              <option value="">分類</option>
              {categories.filter(c => c.enabled).map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
            <input placeholder="聯絡方式" value={newVendor.contact} onChange={e => setNewVendor(p => ({ ...p, contact: e.target.value }))} style={{ flex: 1, minWidth: 80, fontSize: 13, padding: 8 }} />
            <button className="btn-gold" onClick={addVendorFn} style={{ padding: '8px 14px', fontSize: 12 }}><Plus size={14} /></button>
          </div>
          {vendors.map(v => (
            <div key={v.id} className="card" style={{ padding: 10, marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div><div style={{ fontSize: 13, fontWeight: 600 }}>{v.name}</div><div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{v.category} · {v.contact}</div></div>
              <button onClick={() => deleteVendor(v.id)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer' }}><Trash2 size={12} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
