// src/pages/admin/Venues.jsx
// 店家後台：列表 + 新增/編輯（名稱/區/地址/狀態 + 綁定大使 multi-select）
// 與 venueSales.js 共用 venues service —— 改動會直接影響 KEY-in 頁的大使下拉。
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Pencil, X, Check, Search, Power, Users, MapPin, UserCheck } from 'lucide-react'
import {
  listVenues, upsertVenue, deactivateVenue, activateVenue, REGION_OPTIONS,
} from '../../lib/services/venues'
import { getAllAmbassadors } from '../../lib/services/venueSales'
import { SUPERVISORS } from '../../lib/services/supervisors'
import PageShell, { Card, Badge } from '../../components/PageShell'

export default function VenuesAdmin() {
  const navigate = useNavigate()
  const [venues, setVenues] = useState([])
  const [ambassadors, setAmbassadors] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState({ region: 'all', q: '', status: 'all' })
  const [editing, setEditing] = useState(null) // null | 'new' | venueObj
  const [busy, setBusy] = useState(false)

  async function reload() {
    setLoading(true)
    const [vs, ambs] = await Promise.all([listVenues(), getAllAmbassadors()])
    setVenues(vs)
    setAmbassadors(ambs)
    setLoading(false)
  }
  useEffect(() => { reload() }, [])

  const filtered = useMemo(() => {
    return venues.filter(v => {
      if (filter.region !== 'all' && v.region !== filter.region) return false
      if (filter.status === 'active' && v.is_active === false) return false
      if (filter.status === 'inactive' && v.is_active !== false) return false
      if (filter.q.trim()) {
        const q = filter.q.trim().toLowerCase()
        if (!v.name.toLowerCase().includes(q) && !v.id.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [venues, filter])

  const stats = useMemo(() => ({
    total: venues.length,
    bound: venues.filter(v => (v.assigned_ambassador_codes || []).length > 0).length,
    unbound: venues.filter(v => (v.assigned_ambassador_codes || []).length === 0 && v.is_active !== false).length,
    inactive: venues.filter(v => v.is_active === false).length,
  }), [venues])

  async function handleSave(payload) {
    setBusy(true)
    const res = await upsertVenue(payload)
    setBusy(false)
    if (res?.success === false) { alert('儲存失敗：' + (res.error || '')); return }
    setEditing(null)
    reload()
  }

  async function handleToggleActive(v) {
    if (v.is_active === false) {
      if (!window.confirm(`重新啟用「${v.name}」？`)) return
      await activateVenue(v.id)
    } else {
      if (!window.confirm(`停用「${v.name}」？停用後 KEY-in 頁不會出現此店。`)) return
      await deactivateVenue(v.id)
    }
    reload()
  }

  return (
    <PageShell title="店家管理" subtitle="ADMIN · VENUES">
      <SummaryRow stats={stats} />

      <Card style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 200px', position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: '#6a655c' }} />
          <input
            value={filter.q}
            onChange={e => setFilter(f => ({ ...f, q: e.target.value }))}
            placeholder="搜尋店家名稱 / id"
            style={inputStyle({ paddingLeft: 30 })}
          />
        </div>
        <select value={filter.region} onChange={e => setFilter(f => ({ ...f, region: e.target.value }))} style={inputStyle({ width: 'auto' })}>
          <option value="all">全部地區</option>
          {Object.entries(REGION_OPTIONS).map(([k, label]) => (
            <option key={k} value={k}>{label}</option>
          ))}
        </select>
        <select value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value }))} style={inputStyle({ width: 'auto' })}>
          <option value="all">全部狀態</option>
          <option value="active">啟用中</option>
          <option value="inactive">已停用</option>
        </select>
        <button onClick={() => setEditing('new')} style={primaryBtn()}>
          <Plus size={14} /> 新增店家
        </button>
      </Card>

      {loading ? (
        <Card>載入中…</Card>
      ) : filtered.length === 0 ? (
        <Card style={{ textAlign: 'center', color: '#6a655c', padding: 30 }}>沒有符合條件的店家</Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(v => (
            <VenueRow
              key={v.id}
              venue={v}
              ambassadors={ambassadors}
              onEdit={() => setEditing(v)}
              onToggleActive={() => handleToggleActive(v)}
            />
          ))}
        </div>
      )}

      {editing && (
        <VenueEditModal
          venue={editing === 'new' ? null : editing}
          ambassadors={ambassadors}
          busy={busy}
          onClose={() => setEditing(null)}
          onSave={handleSave}
        />
      )}
    </PageShell>
  )
}

function SummaryRow({ stats }) {
  const cell = (label, value, color) => (
    <div style={{ flex: 1, minWidth: 90, padding: 10, background: '#1a1714', border: '1px solid #2a2520', borderRadius: 8, textAlign: 'center' }}>
      <div style={{ fontSize: 10, color: '#6a655c', letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600, color: color || '#e8e0d0', marginTop: 2 }}>{value}</div>
    </div>
  )
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
      {cell('店家總數', stats.total)}
      {cell('已綁大使', stats.bound, '#10b981')}
      {cell('未綁大使', stats.unbound, '#f59e0b')}
      {cell('已停用', stats.inactive, '#6a655c')}
    </div>
  )
}

function VenueRow({ venue, ambassadors, onEdit, onToggleActive }) {
  const codes = venue.assigned_ambassador_codes || []
  const boundList = codes.map(c => ambassadors.find(a => a.id === c)?.displayName || c)
  const inactive = venue.is_active === false
  return (
    <Card style={{ padding: 12, opacity: inactive ? 0.55 : 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ color: '#e8e0d0', fontSize: 15, fontWeight: 500 }}>{venue.name}</div>
            <Badge color={venue.region === 'taipei' ? '#3b82f6' : '#a855f7'}>
              {REGION_OPTIONS[venue.region] || venue.region}
            </Badge>
            {venue.source === 'custom' && <Badge color="#10b981">自訂</Badge>}
            {venue.has_self_sale && <Badge color="#f97316">店家自賣</Badge>}
            {venue.supervisor_id && (() => {
              const s = SUPERVISORS.find(x => x.id === venue.supervisor_id)
              return s ? <Badge color={s.color}><UserCheck size={9} style={{ verticalAlign: 'middle' }} /> {s.name}</Badge> : null
            })()}
            {inactive && <Badge color="#6a655c">已停用</Badge>}
          </div>
          {venue.address && (
            <div style={{ color: '#6a655c', fontSize: 11, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
              <MapPin size={11} /> {venue.address}
            </div>
          )}
          <div style={{ marginTop: 6, fontSize: 11, color: codes.length === 0 ? '#f59e0b' : '#8a8278', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Users size={11} />
            {codes.length === 0
              ? <span>尚未綁定大使（KEY-in 會顯示全部大使）</span>
              : <span>綁定 {codes.length} 位：{boundList.join(' / ')}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button onClick={onEdit} style={ghostBtn()}><Pencil size={13} /> 編輯</button>
          <button onClick={onToggleActive} style={ghostBtn(inactive ? '#10b981' : '#ef4444')}>
            <Power size={13} /> {inactive ? '啟用' : '停用'}
          </button>
        </div>
      </div>
    </Card>
  )
}

function VenueEditModal({ venue, ambassadors, busy, onClose, onSave }) {
  const [name, setName] = useState(venue?.name || '')
  const [region, setRegion] = useState(venue?.region || 'taipei')
  const [address, setAddress] = useState(venue?.address || '')
  const [isActive, setIsActive] = useState(venue?.is_active !== false)
  const [codes, setCodes] = useState(() => new Set(venue?.assigned_ambassador_codes || []))
  const [hasSelfSale, setHasSelfSale] = useState(venue?.has_self_sale === true)
  const [supervisorId, setSupervisorId] = useState(venue?.supervisor_id || '')
  const isNew = !venue

  function toggleCode(id) {
    setCodes(s => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function submit() {
    if (!name.trim()) return alert('請輸入店家名稱')
    await onSave({
      id: venue?.id,
      name: name.trim(),
      region,
      address: address.trim(),
      is_active: isActive,
      assigned_ambassador_codes: [...codes],
      has_self_sale: hasSelfSale,
      supervisor_id: supervisorId || null,
    })
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 999,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 20, overflowY: 'auto',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#15110f', border: '1px solid #2a2520', borderRadius: 12, width: '100%', maxWidth: 540,
        marginTop: 40, padding: 18,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ color: '#c9a84c', fontSize: 16, fontWeight: 600 }}>
            {isNew ? '新增店家' : `編輯：${venue.name}`}
          </div>
          <button onClick={onClose} style={ghostBtn()}><X size={14} /></button>
        </div>

        <Field label="店家名稱 *">
          <input value={name} onChange={e => setName(e.target.value)} style={inputStyle()} placeholder="例如：W 大安" />
        </Field>
        <Field label="地區 *">
          <select value={region} onChange={e => setRegion(e.target.value)} style={inputStyle()}>
            {Object.entries(REGION_OPTIONS).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
        </Field>
        <Field label="地址">
          <input value={address} onChange={e => setAddress(e.target.value)} style={inputStyle()} placeholder="（選填）" />
        </Field>
        <Field label="狀態">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: '#e8e0d0', fontSize: 13 }}>
            <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
            啟用中（取消勾選則停用，KEY-in 頁不會出現）
          </label>
        </Field>

        <Field label="店家自賣">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: '#e8e0d0', fontSize: 13 }}>
            <input type="checkbox" checked={hasSelfSale} onChange={e => setHasSelfSale(e.target.checked)} />
            此店有「店家少爺自賣」（場域定價會多一欄自賣抽成）
          </label>
          <div style={{ marginTop: 4, fontSize: 11, color: '#8a8278' }}>
            勾選後：場域定價頁會多一欄「店家自賣抽成」；督導結帳時會分兩段（大使賣 vs 店家自賣）
          </div>
        </Field>

        <Field label={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><UserCheck size={11} /> 指派督導（每月去這家店收帳的人）</span>}>
          <select value={supervisorId} onChange={e => setSupervisorId(e.target.value)} style={inputStyle()}>
            <option value="">— 未指派 —</option>
            {SUPERVISORS.map(s => (
              <option key={s.id} value={s.id}>{s.name}（{s.region === 'taipei' ? '台北' : '台中'}）</option>
            ))}
          </select>
        </Field>

        <div style={{ marginTop: 14, marginBottom: 6, fontSize: 12, color: '#8a8278', letterSpacing: 1 }}>
          綁定大使（KEY-in 頁此店的大使下拉只列出選中的；不選則顯示全部）
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 6, padding: 10, background: '#1a1714', border: '1px solid #2a2520', borderRadius: 8, maxHeight: 240, overflowY: 'auto' }}>
          {ambassadors.map(a => {
            const on = codes.has(a.id)
            return (
              <button key={a.id} onClick={() => toggleCode(a.id)} type="button"
                style={{
                  padding: '8px 6px', border: '1px solid ' + (on ? '#c9a84c' : '#2a2520'),
                  background: on ? '#c9a84c22' : 'transparent', borderRadius: 6,
                  color: on ? '#c9a84c' : '#8a8278', fontSize: 12, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                }}>
                {on && <Check size={11} />} {a.displayName}
              </button>
            )
          })}
        </div>
        <div style={{ marginTop: 6, fontSize: 11, color: '#6a655c' }}>
          已選 {codes.size} 位 · 點選方塊切換綁定
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          <button onClick={onClose} style={{ ...ghostBtn(), flex: 1 }}>取消</button>
          <button onClick={submit} disabled={busy} style={{ ...primaryBtn(), flex: 2, opacity: busy ? 0.5 : 1 }}>
            {busy ? '儲存中…' : '儲存'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: '#8a8278', marginBottom: 4, letterSpacing: 1 }}>{label}</div>
      {children}
    </div>
  )
}

function inputStyle(extra = {}) {
  return {
    width: '100%', padding: '8px 10px', background: '#1a1714',
    border: '1px solid #2a2520', borderRadius: 6, color: '#e8e0d0',
    fontSize: 13, outline: 'none', boxSizing: 'border-box', ...extra,
  }
}
function primaryBtn() {
  return {
    padding: '8px 14px', background: '#c9a84c', border: 'none', borderRadius: 6,
    color: '#0a0a0a', fontSize: 13, fontWeight: 600, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 4,
  }
}
function ghostBtn(color) {
  return {
    padding: '6px 10px', background: 'transparent',
    border: '1px solid ' + (color || '#2a2520'), borderRadius: 6,
    color: color || '#8a8278', fontSize: 12, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 4,
  }
}
