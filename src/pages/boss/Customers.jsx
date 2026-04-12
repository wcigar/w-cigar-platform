import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Users, Search, X, Plus, Edit3, ChevronDown, ChevronUp, User } from 'lucide-react'

const TIER_BADGE = {
  '尊榮會員': { icon: '👑', bg: 'rgba(155,89,182,.15)', color: '#9b59b6', border: '#9b59b6' },
  '進階會員': { icon: '⭐', bg: 'rgba(201,168,76,.15)', color: '#c9a84c', border: '#c9a84c' },
  '紳士俱樂部': { icon: '🎩', bg: 'rgba(149,165,166,.15)', color: '#95a5a6', border: '#95a5a6' },
  '非會員': { icon: '', bg: 'transparent', color: '#666', border: '#333' },
}
const TIERS = ['非會員', '紳士俱樂部', '進階會員', '尊榮會員']
const CUSTOMER_TYPES = ['Wilson老闆-友', '珊珊友', '會員', 'VIP', '酒店', '酒吧', '酒專', '其他']
const BELONGS_TO = ['老闆', '老闆娘', '店內']

export default function CustomersMgmt() {
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tierFilter, setTierFilter] = useState('all')
  const [editing, setEditing] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadCustomers() }, [])

  async function loadCustomers() {
    setLoading(true)
    const { data } = await supabase.from('customers').select('*').eq('enabled', true).order('total_spent', { ascending: false })
    setCustomers(data || [])
    setLoading(false)
  }

  async function saveCustomer(form) {
    setSaving(true)
    try {
      if (form.id) {
        const { error } = await supabase.from('customers').update({
          name: form.name, phone: form.phone, customer_type: form.customer_type,
          belongs_to: form.belongs_to, membership_tier: form.membership_tier,
          tax_id: form.tax_id, notes: form.notes,
        }).eq('id', form.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('customers').insert({
          name: form.name, phone: form.phone, customer_type: form.customer_type,
          belongs_to: form.belongs_to, membership_tier: form.membership_tier || '非會員',
          tax_id: form.tax_id, notes: form.notes, enabled: true, total_spent: 0,
        })
        if (error) throw error
      }
      setEditing(null); loadCustomers()
    } catch (e) { alert('儲存失敗: ' + e.message) }
    finally { setSaving(false) }
  }

  const filtered = customers.filter(c => {
    if (tierFilter !== 'all' && c.membership_tier !== tierFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return (c.name || '').toLowerCase().includes(q) || (c.phone || '').toLowerCase().includes(q)
    }
    return true
  })

  const stats = { total: customers.length }
  TIERS.forEach(t => { stats[t] = customers.filter(c => c.membership_tier === t).length })

  return (
    <div style={{ padding: 20, color: '#e8dcc8', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#c9a84c', display: 'flex', alignItems: 'center', gap: 10 }}><Users size={22} /> 會員管理</div>
        <button onClick={() => setEditing({ name: '', phone: '', customer_type: '會員', belongs_to: '店內', membership_tier: '非會員', tax_id: '', notes: '' })}
          style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#c9a84c', color: '#000', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}><Plus size={16} /> 新增客戶</button>
      </div>

      {/* Search + filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#8a7e6e' }} />
          <input placeholder="搜尋姓名 / 電話…" value={search} onChange={e => setSearch(e.target.value)} style={{ width: '100%', fontSize: 13, padding: '8px 10px 8px 32px', background: '#1a1714', border: '1px solid #2a2520', borderRadius: 8, color: '#e8dcc8', boxSizing: 'border-box' }} />
        </div>
        {['all', '尊榮會員', '進階會員', '紳士俱樂部', '非會員'].map(t => (
          <button key={t} onClick={() => setTierFilter(t)} style={{ padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: tierFilter === t ? 'rgba(201,168,76,.15)' : '#1a1714', color: tierFilter === t ? '#c9a84c' : '#8a7e6e', border: tierFilter === t ? '1px solid rgba(201,168,76,.3)' : '1px solid #2a2520' }}>
            {t === 'all' ? '全部' : (TIER_BADGE[t]?.icon || '') + ' ' + t.replace('會員', '').replace('俱樂部', '')}
          </button>
        ))}
      </div>

      {/* Stats */}
      <div style={{ fontSize: 12, color: '#8a7e6e', marginBottom: 16 }}>
        {stats.total}人 · <span style={{ color: '#9b59b6' }}>尊榮{stats['尊榮會員']}</span> · <span style={{ color: '#c9a84c' }}>進階{stats['進階會員']}</span> · <span style={{ color: '#95a5a6' }}>紳士{stats['紳士俱樂部']}</span>
      </div>

      {/* Edit modal */}
      {editing && <EditModal form={editing} saving={saving} onSave={saveCustomer} onClose={() => setEditing(null)} />}

      {/* Customer list */}
      {loading ? <div style={{ textAlign: 'center', padding: 40, color: '#8a7e6e' }}>載入中…</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(c => {
            const badge = TIER_BADGE[c.membership_tier] || TIER_BADGE['非會員']
            const isExpanded = expanded === c.id
            return (
              <div key={c.id} style={{ background: '#1a1714', border: `1px solid ${badge.border}30`, borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', cursor: 'pointer' }} onClick={() => setExpanded(isExpanded ? null : c.id)}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: badge.bg, border: `1px solid ${badge.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><User size={16} color={badge.color} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#e8dcc8' }}>{c.name}</span>
                      {c.membership_tier !== '非會員' && <span style={{ fontSize: 10, fontWeight: 600, color: badge.color, background: badge.bg, border: `1px solid ${badge.border}`, borderRadius: 8, padding: '1px 6px' }}>{badge.icon} {c.membership_tier.replace('會員', '').replace('俱樂部', '')}</span>}
                    </div>
                    <div style={{ fontSize: 11, color: '#8a7e6e', marginTop: 2 }}>
                      累計${(c.total_spent || 0).toLocaleString()}{c.customer_type ? ` · ${c.customer_type}` : ''}{c.belongs_to ? ` · ${c.belongs_to}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <button onClick={e => { e.stopPropagation(); setEditing({ ...c }) }} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #2a2520', background: '#0d0b09', color: '#8a7e6e', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}><Edit3 size={12} /> 編輯</button>
                    {isExpanded ? <ChevronUp size={16} color="#8a7e6e" /> : <ChevronDown size={16} color="#8a7e6e" />}
                  </div>
                </div>
                {isExpanded && (
                  <div style={{ padding: '0 14px 14px', borderTop: '1px solid #2a2520' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, paddingTop: 12, fontSize: 12 }}>
                      <div><span style={{ color: '#8a7e6e' }}>電話</span><div style={{ color: '#e8dcc8', fontWeight: 600 }}>{c.phone || '—'}</div></div>
                      <div><span style={{ color: '#8a7e6e' }}>類型</span><div style={{ color: '#e8dcc8', fontWeight: 600 }}>{c.customer_type || '—'}</div></div>
                      <div><span style={{ color: '#8a7e6e' }}>歸屬</span><div style={{ color: '#c9a84c', fontWeight: 600 }}>{c.belongs_to || '—'}</div></div>
                      <div><span style={{ color: '#8a7e6e' }}>等級</span><div style={{ color: badge.color, fontWeight: 600 }}>{c.membership_tier}</div></div>
                      <div><span style={{ color: '#8a7e6e' }}>累計消費</span><div style={{ color: '#c9a84c', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>${(c.total_spent || 0).toLocaleString()}</div></div>
                      <div><span style={{ color: '#8a7e6e' }}>統編</span><div style={{ color: '#e8dcc8' }}>{c.tax_id || '—'}</div></div>
                      {c.last_visit && <div><span style={{ color: '#8a7e6e' }}>最後消費</span><div style={{ color: '#e8dcc8' }}>{new Date(c.last_visit).toLocaleDateString('zh-TW')}</div></div>}
                      {c.notes && <div style={{ gridColumn: '1/3' }}><span style={{ color: '#8a7e6e' }}>備註</span><div style={{ color: '#e8dcc8', marginTop: 2 }}>{c.notes}</div></div>}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          {!filtered.length && <div style={{ textAlign: 'center', padding: 40, color: '#8a7e6e' }}>沒有符合條件的客戶</div>}
        </div>
      )}
    </div>
  )
}

function EditModal({ form: initial, saving, onSave, onClose }) {
  const [form, setForm] = useState(initial)
  const f = (k, v) => setForm(prev => ({ ...prev, [k]: v }))
  const isNew = !form.id

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,.8)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ background: '#1a1714', border: '1px solid rgba(201,168,76,.3)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 440, maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 18, fontWeight: 700, color: '#c9a84c' }}>{isNew ? '新增客戶' : '編輯客戶'}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#8a7e6e', cursor: 'pointer' }}><X size={20} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="姓名 *" value={form.name} onChange={v => f('name', v)} />
          <Field label="電話" value={form.phone} onChange={v => f('phone', v)} />
          <div>
            <div style={{ fontSize: 11, color: '#c9a84c', fontWeight: 600, marginBottom: 4 }}>類型</div>
            <select value={form.customer_type || ''} onChange={e => f('customer_type', e.target.value)} style={{ width: '100%', fontSize: 13, padding: '8px 10px', background: '#0d0b09', border: '1px solid #2a2520', borderRadius: 8, color: '#e8dcc8' }}>
              <option value="">— 選擇 —</option>
              {CUSTOMER_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#c9a84c', fontWeight: 600, marginBottom: 4 }}>業績歸屬</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {BELONGS_TO.map(b => (
                <button key={b} onClick={() => f('belongs_to', b)} style={{ flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: form.belongs_to === b ? 'rgba(201,168,76,.15)' : '#0d0b09', color: form.belongs_to === b ? '#c9a84c' : '#8a7e6e', border: form.belongs_to === b ? '1px solid rgba(201,168,76,.3)' : '1px solid #2a2520' }}>{b}</button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#c9a84c', fontWeight: 600, marginBottom: 4 }}>會員等級</div>
            <select value={form.membership_tier || '非會員'} onChange={e => f('membership_tier', e.target.value)} style={{ width: '100%', fontSize: 13, padding: '8px 10px', background: '#0d0b09', border: '1px solid #2a2520', borderRadius: 8, color: '#e8dcc8' }}>
              {TIERS.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <Field label="統編" value={form.tax_id} onChange={v => f('tax_id', v)} />
          <div>
            <div style={{ fontSize: 11, color: '#c9a84c', fontWeight: 600, marginBottom: 4 }}>備註</div>
            <textarea value={form.notes || ''} onChange={e => f('notes', e.target.value)} rows={3} style={{ width: '100%', fontSize: 13, padding: '8px 10px', background: '#0d0b09', border: '1px solid #2a2520', borderRadius: 8, color: '#e8dcc8', resize: 'vertical', boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button onClick={onClose} style={{ flex: 1, padding: 12, borderRadius: 10, border: '1px solid #2a2520', background: '#0d0b09', color: '#8a7e6e', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>取消</button>
            <button onClick={() => { if (!form.name?.trim()) return alert('姓名必填'); onSave(form) }} disabled={saving} style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#c9a84c', color: '#000', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: saving ? .5 : 1 }}>{saving ? '儲存中…' : '儲存'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: '#c9a84c', fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <input value={value || ''} onChange={e => onChange(e.target.value)} style={{ width: '100%', fontSize: 13, padding: '8px 10px', background: '#0d0b09', border: '1px solid #2a2520', borderRadius: 8, color: '#e8dcc8', boxSizing: 'border-box' }} />
    </div>
  )
}
