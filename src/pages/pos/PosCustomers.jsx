/**
 * POS 客戶管理 — Customer Data Management
 * - 搜尋（姓名/電話/LINE/IG）
 * - 篩選（customer_type / membership_tier）
 * - 列表 + 詳情/編輯 Modal
 * - 新增客戶
 * - 整合既有 VIP 系統
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import {
  Search, UserPlus, ChevronLeft, ChevronRight, X, Save, Star,
  Phone, Mail, Calendar, MapPin, Crown, Tag, MessageCircle,
  Instagram, Hash, Loader2, AlertCircle, Users, Filter, Edit3, Eye
} from 'lucide-react'

/* ── 常量 ── */
const PAGE_SIZE = 30

const CUSTOMER_TYPES = [
  '全部', '一般客人', '會員', '老闆朋友', '員工', '廠商', '媒體', '包廂客人', '外帶', '其他'
]
const MEMBERSHIP_TIERS = [
  '全部', 'bronze', 'silver', 'gold', 'platinum', 'diamond'
]
const TIER_LABELS = {
  bronze: '銅牌', silver: '銀牌', gold: '金牌', platinum: '白金', diamond: '鑽石'
}
const TIER_COLORS = {
  bronze: '#cd7f32',
  silver: '#c0c0c0',
  gold: '#c9a84c',
  platinum: '#e5e4e2',
  diamond: '#b9f2ff',
}

/* ── 主元件 ── */
export default function PosCustomers() {
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('全部')
  const [tierFilter, setTierFilter] = useState('全部')
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [selected, setSelected] = useState(null)   // view/edit customer
  const [editMode, setEditMode] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const searchRef = useRef(null)

  /* ── 讀取 ── */
  const fetchCustomers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let q = supabase
        .from('customers')
        .select('id,name,phone,email,customer_type,membership_tier,total_spent,visit_count,last_purchase,is_vip,vip_code,belongs_to,enabled,is_blacklist,notes,tags,birthday,gender,line_id,ig_handle,locker_number,credit_remaining,room_hours_remaining,assigned_staff,created_at', { count: 'exact' })
        .eq('enabled', true)
        .order('last_purchase', { ascending: false, nullsFirst: false })

      if (search.trim()) {
        const s = `%${search.trim()}%`
        q = q.or(`name.ilike.${s},phone.ilike.${s},line_id.ilike.${s},ig_handle.ilike.${s},vip_code.ilike.${s}`)
      }
      if (typeFilter !== '全部') q = q.eq('customer_type', typeFilter)
      if (tierFilter !== '全部') q = q.eq('membership_tier', tierFilter)

      q = q.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

      const { data, error: err, count } = await q
      if (err) throw err
      setCustomers(data || [])
      setTotal(count || 0)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [search, typeFilter, tierFilter, page])

  useEffect(() => { fetchCustomers() }, [fetchCustomers])

  // Reset page when filters change
  useEffect(() => { setPage(0) }, [search, typeFilter, tierFilter])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  /* ── 儲存編輯 ── */
  async function handleSave(formData) {
    setSaving(true)
    try {
      if (formData.id) {
        const { error: err } = await supabase.from('customers').update(formData).eq('id', formData.id)
        if (err) throw err
      } else {
        const { error: err } = await supabase.from('customers').insert(formData)
        if (err) throw err
      }
      setSelected(null)
      setShowAdd(false)
      setEditMode(false)
      fetchCustomers()
    } catch (e) {
      alert('儲存失敗: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  /* ── 格式化 ── */
  const fmtDate = (d) => {
    if (!d) return '—'
    const dt = new Date(d)
    return `${dt.getMonth() + 1}/${dt.getDate()}`
  }
  const fmtMoney = (n) => {
    if (!n) return '$0'
    return '$' + Number(n).toLocaleString()
  }

  /* ── UI ── */
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#0d0b09', color: '#e8dcc8' }}>
      {/* ── Toolbar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
        borderBottom: '1px solid #2a2520', flexShrink: 0,
        background: 'linear-gradient(180deg, #1a1714 0%, #12100d 100%)'
      }}>
        <Users size={16} color="#c9a84c" />
        <span style={{ fontSize: 13, fontWeight: 700, color: '#c9a84c', letterSpacing: 0.5, marginRight: 4 }}>
          客戶管理
        </span>
        <span style={{ fontSize: 11, color: '#6b5f52' }}>
          {total} 筆
        </span>

        {/* Search */}
        <div style={{ position: 'relative', flex: 1, minWidth: 120, maxWidth: 320, marginLeft: 8 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#6b5f52' }} />
          <input
            ref={searchRef}
            placeholder="搜尋姓名 / 電話 / LINE / IG…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%', fontSize: 13, padding: '7px 10px 7px 32px',
              background: '#0d0b09', border: '1px solid #2a2520', borderRadius: 8,
              color: '#e8dcc8', outline: 'none', letterSpacing: 0.3, transition: 'border-color .2s'
            }}
            onFocus={e => e.target.style.borderColor = '#c9a84c'}
            onBlur={e => e.target.style.borderColor = '#2a2520'}
          />
        </div>

        {/* Filter toggle */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '5px 10px', fontSize: 11, fontWeight: 600,
            color: (typeFilter !== '全部' || tierFilter !== '全部') ? '#c9a84c' : '#6b5f52',
            background: showFilters ? '#2a2520' : 'transparent',
            border: '1px solid #2a2520', borderRadius: 8, cursor: 'pointer',
            transition: 'all .2s'
          }}
        >
          <Filter size={12} /> 篩選
        </button>

        <div style={{ flex: '0 0 1' }} />

        {/* Add customer */}
        <button
          onClick={() => { setShowAdd(true); setEditMode(true) }}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '6px 14px', fontSize: 12, fontWeight: 600,
            color: '#000', background: '#c9a84c', border: 'none', borderRadius: 8, cursor: 'pointer',
            letterSpacing: 0.3, transition: 'all .2s'
          }}
        >
          <UserPlus size={13} /> 新增客戶
        </button>
      </div>

      {/* ── Filter bar ── */}
      {showFilters && (
        <div style={{
          display: 'flex', gap: 12, padding: '8px 12px', borderBottom: '1px solid #2a2520',
          background: '#12100d', flexWrap: 'wrap', alignItems: 'center'
        }}>          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: '#6b5f52' }}>類型:</span>
            <div style={{ display: 'flex', gap: 2, background: '#0d0b09', border: '1px solid #2a2520', borderRadius: 8, padding: 2 }}>
              {CUSTOMER_TYPES.map(t => (
                <button key={t} onClick={() => setTypeFilter(t)}
                  style={{
                    padding: '3px 8px', fontSize: 10, fontWeight: typeFilter === t ? 700 : 400,
                    color: typeFilter === t ? '#c9a84c' : '#6b5f52',
                    background: typeFilter === t ? '#2a2520' : 'transparent',
                    border: 'none', borderRadius: 6, cursor: 'pointer',
                    transition: 'all .2s', whiteSpace: 'nowrap'
                  }}>{t}</button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: '#6b5f52' }}>簧級:</span>
            <div style={{ display: 'flex', gap: 2, background: '#0d0b09', border: '1px solid #2a2520', borderRadius: 8, padding: 2 }}>
              {MEMBERSHIP_TIERS.map(t => (
                <button key={t} onClick={() => setTierFilter(t)}
                  style={{
                    padding: '3px 8px', fontSize: 10, fontWeight: tierFilter === t ? 700 : 400,
                    color: tierFilter === t ? (TIER_COLORS[t] || '#c9a84c') : '#6b5f52',
                    background: tierFilter === t ? '#2a2520' : 'transparent',
                    border: 'none', borderRadius: 6, cursor: 'pointer',
                    transition: 'all .2s', whiteSpace: 'nowrap'
                  }}>{t === '全部' ? '全部' : TIER_LABELS[t]}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Table ── */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, gap: 8, color: '#6b5f52' }}>
            <Loader2 size={18} className="spin" style={{ animation: 'spin 1s linear infinite' }} /> 載入中…
          </div>
        ) : error ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, gap: 8, color: '#e74c3c' }}>
            <AlertCircle size={16} /> {error}
          </div>
        ) : customers.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: '#6b5f52', fontSize: 13 }}>
            找不到符合條件的客戶
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #2a2520', position: 'sticky', top: 0, background: '#12100d', zIndex: 2 }}>
                {['姓名', '類型', '等級', '電話', '累計消費', '來訪次數', '最近消費', '歸屬', ''].map((h, i) => (
                  <th key={i} style={{
                    padding: '8px 10px', textAlign: 'left', color: '#6b5f52',
                    fontWeight: 600, fontSize: 10, letterSpacing: 0.5, whiteSpace: 'nowrap'
                  }}>{h }</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {customers.map(c => (
                <tr key={c.id}
                  onClick={() => { setSelected(c); setEditMode(false) }}
                  style={{
                    borderBottom: '1px solid #1a1714', cursor: 'pointer',
                    transition: 'background .15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(201,168,76,.05)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {c.is_vip && <Star size={11} color="#c9a84c" fill="#c9a84c" />}
                    {c.is_blacklist && <span style={{ color: '#e74c3c', fontSize: 10 }}>⛔</span>}
                    <span style={{ color: '#e8dcc8', fontWeight: 500 }}>{c.name || '—'}</span>
                  </td>
                  <td style={{ padding: '8px 10px', color: '#8a7e6e', fontSize: 11 }}>{c.customer_type || '—'}</td>
                  <td style={{ padding: '8px 10px' }}>
                    {c.membership_tier ? (
                      <span style={{
                        fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
                        background: `${TIER_COLORS[c.membership_tier] || '#6b5f52'}20`,
                        color: TIER_COLORS[c.membership_tier] || '#6b5f52'
                      }}>{TIER_LABELS[c.membership_tier] || c.membership_tier}</span>
                    ) : '—'}
                  </td>
                  <td style={{ padding: '8px 10px', color: '#8a7e6e', fontSize: 11 }}>{c.phone || '—'}</td>
                  <td style={{ padding: '8px 10px', color: '#c9a84c', fontWeight: 600, fontSize: 11 }}>{fmtMoney(c.total_spent)}</td>
                  <td style={{ padding: '8px 10px', color: '#8a7e6e', fontSize: 11 }}>{c.visit_count || 0}次</td>
                  <td style={{ padding: '8px 10px', color: '#8a7e6e', fontSize: 11 }}>{fmtDate(c.last_purchase)}</td>
                  <td style={{ padding: '8px 10px', color: '#6b5f52', fontSize: 11 }}>{c.belongs_to || '—'}</td>
                  <td style={{ padding: '8px 4px' }}>
                    <button onClick={e => { e.stopPropagation(); setSelected(c); setEditMode(true) }}
                      style={{ background: 'none', border: 'none', color: '#6b5f52', cursor: 'pointer', padding: 4 }}>
                      <Edit3 size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
          padding: '6px 12px', borderTop: '1px solid #2a2520', background: '#12100d', flexShrink: 0
        }}>
          <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
            style={{ background: 'none', border: 'none', color: page === 0 ? '#2a2520' : '#8a7e6e', cursor: page === 0 ? 'default' : 'pointer', padding: 4 }}>
            <ChevronLeft size={16} />
          </button>
          <span style={{ fontSize: 11, color: '#6b5f52' }}>
            {page + 1} / {totalPages}
          </span>
          <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}
            style={{ background: 'none', border: 'none', color: page >= totalPages - 1 ? '#2a2520' : '#8a7e6e', cursor: page >= totalPages - 1 ? 'default' : 'pointer', padding: 4 }}>
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      {/* ── Detail / Edit Modal ── */}
      {(selected || showAdd) && (
        <CustomerModal
          customer={showAdd ? null : selected}
          editMode={editMode}
          saving={saving}
          onSave={handleSave}
          onClose={() => { setSelected(null); setShowAdd(false); setEditMode(false) }}
          onToggleEdit={() => setEditMode(!editMode)}
        />
      )}

      {/* spin animation */}
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

/* ── Customer Modal ── */
function CustomerModal({ customer, editMode, saving, onSave, onClose, onToggleEdit }) {
  const isNew = !customer
  const [form, setForm] = useState(() => customer ? { ...customer } : {
    name: '', phone: '', email: '', customer_type: '一般客人',
    membership_tier: null, is_vip: false, gender: '',
    birthday: '', belongs_to: '', notes: '', tags: '',
    line_id: '', ig_handle: '', locker_number: '',
    credit_remaining: 0, room_hours_remaining: 0, assigned_staff: '',
    enabled: true
  })

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.name?.trim()) { alert('請輸入客戶姓名'); return }
    const payload = { ...form }
    // Clean up
    if (!payload.birthday) delete payload.birthday
    if (!payload.membership_tier) payload.membership_tier = null
    if (isNew) {
      delete payload.id
      delete payload.created_at
    }
    onSave(payload)
  }

  const inputStyle = (disabled) => ({
    width: '100%', fontSize: 13, padding: '8px 10px',
    background: disabled ? '#12100d' : '#0d0b09',
    border: `1px solid ${disabled ? '#1a1714' : '#2a2520'}`,
    borderRadius: 8, color: disabled ? '#6b5f52' : '#e8dcc8',
    outline: 'none', transition: 'border-color .2s'
  })

  const labelStyle = { fontSize: 10, color: '#6b5f52', fontWeight: 600, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4, letterSpacing: 0.5 }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,.85)', zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    }} onClick={onClose}>
      <div style={{
        background: '#1a1714', border: '1px solid rgba(201,168,76,.2)',
        borderRadius: 16, width: '95%', maxWidth: 600, maxHeight: '90vh',
        overflow: 'auto', position: 'relative'
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid #2a2520',
          position: 'sticky', top: 0, background: '#1a1714', zIndex: 1
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isNew ? <UserPlus size={16} color="#c9a84c" /> : <Users size={16} color="#c9a84c" />}
            <span style={{ fontSize: 15, fontWeight: 700, color: '#c9a84c' }}>
              {isNew ? '新增客戶' : (editMode ? '編輯客戶' : '客戶詳情')}
            </span>
            {customer?.is_vip && (
              <span style={{ fontSize: 10, background: 'rgba(201,168,76,.15)', color: '#c9a84c', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>
                VIP {customer.vip_code || ''}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {!isNew && (
              <button onClick={onToggleEdit} style={{
                background: 'none', border: '1px solid #2a2520', borderRadius: 6,
                padding: '4px 10px', fontSize: 11, color: editMode ? '#c9a84c' : '#8a7e6e',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4
              }}>
                {editMode ? <Eye size={12} /> : <Edit3 size={12} />}
                {editMode ? '檢視' : '編輯'}
              </button>
            )}
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6b5f52', cursor: 'pointer', padding: 4 }}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* Name */}
            <div>
              <label style={labelStyle}><Users size={10} /> 姓名 *</label>
              <input value={form.name || ''} disabled={!editMode} onChange={e => set('name', e.target.value)}
                style={inputStyle(!editMode)} placeholder="客戶姓名" />
            </div>
            {/* Phone */}
            <div>
              <label style={labelStyle}><Phone size={10} /> 電話</label>
              <input value={form.phone || ''} disabled={!editMode} onChange={e => set('phone', e.target.value)}
                style={inputStyle(!editMode)} placeholder="0912-345-678" />
            </div>
            {/* Email */}
            <div>
              <label style={labelStyle}><Mail size={10} /> Email</label>
              <input value={form.email || ''} disabled={!editMode} onChange={e => set('email', e.target.value)}
                style={inputStyle(!editMode)} placeholder="email@example.com" />
            </div>
            {/* Birthday */}
            <div>
              <label style={labelStyle}><Calendar size={10} /> 生日</label>
              <input type="date" value={form.birthday || ''} disabled={!editMode} onChange={e => set('birthday', e.target.value)}
                style={{ ...inputStyle(!editMode), colorScheme: 'dark' }} />
            </div>
            {/* Gender */}
            <div>
              <label style={labelStyle}>性別</label>
              <select value={form.gender || ''} disabled={!editMode} onChange={e => set('gender', e.target.value)}
                style={inputStyle(!editMode)}>
                <option value="">未填</option>
                <option value="male">男</option>
                <option value="female">女</option>
                <option value="other">其他</option>
              </select>
            </div>
            {/* Customer type */}
            <div>
              <label style={labelStyle}><Tag size={10} /> 客戶類型</label>
              <select value={form.customer_type || '一般客人'} disabled={!editMode} onChange={e => set('customer_type', e.target.value)}
                style={inputStyle(!editMode)}>
                {CUSTOMER_TYPES.filter(t => t !== '全部').map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            {/* Membership tier */}
            <div>
              <label style={labelStyle}><Crown size={10} /> 會員等級</label>
              <select value={form.membership_tier || ''} disabled={!editMode} onChange={e => set('membership_tier', e.target.value || null)}
                style={inputStyle(!editMode)}>
                <option value="">無</option>
                {MEMBERSHIP_TIERS.filter(t => t !== '全部').map(t => <option key={t} value={t}>{TIER_LABELS[t]}</option>)}
              </select>
            </div>
            {/* VIP */}
            <div>
              <label style={labelStyle}><Star size={10} /> VIP</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#e8dcc8', cursor: editMode ? 'pointer' : 'default' }}>
                  <input type="checkbox" checked={form.is_vip || false} disabled={!editMode}
                    onChange={e => set('is_vip', e.target.checked)} style={{ accentColor: '#c9a84c' }} />
                  VIP 客戶
                </label>
                {form.is_vip && (
                  <input value={form.vip_code || ''} disabled={!editMode} onChange={e => set('vip_code', e.target.value)}
                    style={{ ...inputStyle(!editMode), width: 120 }} placeholder="VIP Code" />
                )}
              </div>
            </div>
            {/* Belongs to */}
            <div>
              <label style={labelStyle}><MapPin size={10} /> 歸屬</label>
              <input value={form.belongs_to || ''} disabled={!editMode} onChange={e => set('belongs_to', e.target.value)}
                style={inputStyle(!editMode)} placeholder="歸屬門市/人員" />
            </div>
            {/* Assigned staff */}
            <div>
              <label style={labelStyle}>負責人員</label>
              <input value={form.assigned_staff || ''} disabled={!editMode} onChange={e => set('assigned_staff', e.target.value)}
                style={inputStyle(!editMode)} placeholder="指定服務人員" />
            </div>
            {/* LINE */}
            <div>
              <label style={labelStyle}><MessageCircle size={10} /> LINE ID</label>
              <input value={form.line_id || ''} disabled={!editMode} onChange={e => set('line_id', e.target.value)}
                style={inputStyle(!editMode)} placeholder="LINE ID" />
            </div>
            {/* IG */}
            <div>
              <label style={labelStyle}><Instagram size={10} /> Instagram</label>
              <input value={form.ig_handle || ''} disabled={!editMode} onChange={e => set('ig_handle', e.target.value)}
                style={inputStyle(!editMode)} placeholder="@handle" />
            </div>
            {/* Locker */}
            <div>
              <label style={labelStyle}><Hash size={10} /> 置物櫃</label>
              <input value={form.locker_number || ''} disabled={!editMode} onChange={e => set('locker_number', e.target.value)}
                style={inputStyle(!editMode)} placeholder="櫛號" />
            </div>
            {/* Credit remaining */}
            <div>
              <label style={labelStyle}>儲值餘額</label>
              <input type="number" value={form.credit_remaining || 0} disabled={!editMode}
                onChange={e => set('credit_remaining', Number(e.target.value))}
                style={inputStyle(!editMode)} />
            </div>
            {/* Room hours */}
            <div>
              <label style={labelStyle}>包廂剩餘時數</label>
              <input type="number" value={form.room_hours_remaining || 0} disabled={!editMode}
                onChange={e => set('room_hours_remaining', Number(e.target.value))}
                style={inputStyle(!editMode)} />
            </div>
          </div>

          {/* Notes - full width */}
          <div style={{ marginTop: 16 }}>
            <label style={labelStyle}>備註</label>
            <textarea value={form.notes || ''} disabled={!editMode} onChange={e => set('notes', e.target.value)}
              rows={3} style={{ ...inputStyle(!editMode), resize: 'vertical', fontFamily: 'inherit' }}
              placeholder="客戶備註…" />
          </div>

          {/* Read-only stats */}
          {!isNew && (
            <div style={{
              marginTop: 16, padding: 12, background: '#0d0b09', borderRadius: 10,
              border: '1px solid #1a1714', display: 'flex', gap: 20, flexWrap: 'wrap'
            }}>
              <div>
                <div style={{ fontSize: 9, color: '#6b5f52', letterSpacing: 0.5 }}>累計消費</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#c9a84c' }}>{fmtMoney(form.total_spent)}</div>
              </div>
              <div>
                <div style={{ fontSize: 9, color: '#6b5f52', letterSpacing: 0.5 }}>來訪次數</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#e8dcc8' }}>{form.visit_count || 0}</div>
              </div>
              <div>
                <div style={{ fontSize: 9, color: '#6b5f52', letterSpacing: 0.5 }}>最近消費</div>
                <div style={{ fontSize: 14, color: '#8a7e6e' }}>{form.last_purchase ? new Date(form.last_purchase).toLocaleDateString('zh-TW') : '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 9, color: '#6b5f52', letterSpacing: 0.5 }}>加入日期</div>
                <div style={{ fontSize: 14, color: '#8a7e6e' }}>{form.created_at ? new Date(form.created_at).toLocaleDateString('zh-TW') : '—'}</div>
              </div>
            </div>
          )}

          {/* Save button */}
          {editMode && (
            <button type="submit" disabled={saving}
              style={{
                marginTop: 20, width: '100%', padding: 12, borderRadius: 10,
                border: 'none', background: saving ? '#6b5f52' : '#c9a84c',
                color: '#000', fontSize: 14, fontWeight: 700, cursor: saving ? 'wait' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                transition: 'all .2s'
              }}>
              {saving ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={16} />}
              {saving ? '儲存中…' : (isNew ? '新增客戶' : '儲存變更')}
            </button>
          )}
        </form>
      </div>
    </div>
  )
}
