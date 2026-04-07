import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { Package, Search, Plus, Minus, Save } from 'lucide-react'
import { format } from 'date-fns'

export default function StaffInventory() {
  const { user } = useAuth()
  const [items, setItems] = useState([])
  const [search, setSearch] = useState('')
  const [changes, setChanges] = useState({})
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadInventory() }, [])

  async function loadInventory() {
    setLoading(true)
    const { data } = await supabase
      .from('inventory')
      .select('*')
      .order('category')
      .order('name')
    setItems(data || [])
    setLoading(false)
  }

  function updateCount(id, delta) {
    setChanges(prev => {
      const current = prev[id] || 0
      return { ...prev, [id]: current + delta }
    })
  }

  async function saveChanges() {
    setSaving(true)
    const entries = Object.entries(changes).filter(([, v]) => v !== 0)
    for (const [id, delta] of entries) {
      const item = items.find(i => i.id === id)
      if (!item) continue
      await supabase.from('inventory').update({
        quantity: item.quantity + delta,
        last_checked: new Date().toISOString(),
        last_checked_by: user.employee_id,
      }).eq('id', id)
    }
    setChanges({})
    loadInventory()
    setSaving(false)
  }

  const filtered = items.filter(i =>
    i.name?.toLowerCase().includes(search.toLowerCase()) ||
    i.category?.toLowerCase().includes(search.toLowerCase())
  )

  const hasChanges = Object.values(changes).some(v => v !== 0)
  const categories = [...new Set(filtered.map(i => i.category))].filter(Boolean)

  if (loading) return <div className="page-container">{[1,2,3].map(i => <div key={i} className="loading-shimmer" style={{height:60,marginBottom:10}}/>)}</div>

  return (
    <div className="page-container fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div className="section-title" style={{ marginBottom: 0 }}>庫存盤點</div>
        {hasChanges && (
          <button className="btn-gold" style={{ padding: '8px 16px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }} onClick={saveChanges} disabled={saving}>
            <Save size={14} /> {saving ? '儲存中...' : '儲存'}
          </button>
        )}
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 16 }}>
        <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
        <input placeholder="搜尋品項..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 36 }} />
      </div>

      {items.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>
          <Package size={32} style={{ marginBottom: 8, opacity: 0.4 }} />
          <div>尚無庫存資料</div>
        </div>
      ) : (
        categories.map(cat => (
          <div key={cat} style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' }}>{cat}</div>
            {filtered.filter(i => i.category === cat).map(item => {
              const delta = changes[item.id] || 0
              const newQty = item.quantity + delta
              return (
                <div key={item.id} className="card" style={{ padding: 12, marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{item.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      庫存: {item.quantity} {item.unit || ''}
                      {delta !== 0 && <span style={{ color: delta > 0 ? 'var(--green)' : 'var(--red)', marginLeft: 6 }}>
                        → {newQty} ({delta > 0 ? '+' : ''}{delta})
                      </span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button style={countBtn} onClick={() => updateCount(item.id, -1)}>
                      <Minus size={14} />
                    </button>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 16, color: 'var(--text)', minWidth: 30, textAlign: 'center' }}>
                      {newQty}
                    </span>
                    <button style={countBtn} onClick={() => updateCount(item.id, 1)}>
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        ))
      )}
    </div>
  )
}

const countBtn = {
  width: 32, height: 32,
  borderRadius: 8,
  background: 'var(--black)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
}
