// ============================================================
// 全員打卡紀錄 (/admin/punch-all)
// 老闆檢視 + 修正每位員工的打卡紀錄；標示遲到/早退/手動補卡
// ============================================================
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { useNavigate } from 'react-router-dom'
import { format, endOfMonth, subMonths, addMonths } from 'date-fns'
import { ArrowLeft, ChevronLeft, ChevronRight, Edit3, Save, X, Download, Filter, Trash2, AlertTriangle } from 'lucide-react'
import { SHIFTS, LATE_GRACE_MIN } from '../../lib/constants'
import { toTaipei, taipeiHM } from '../../lib/timezone'

export default function PunchAll() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'))
  const [emps, setEmps] = useState([])
  const [punches, setPunches] = useState([])
  const [schedules, setSchedules] = useState([])
  const [filterEmp, setFilterEmp] = useState('ALL')
  const [filterType, setFilterType] = useState('ALL')
  const [filterAnomaly, setFilterAnomaly] = useState('ALL') // ALL | LATE | EARLY | INVALID | OVERRIDE
  const [editing, setEditing] = useState(null) // { id, date, time(HH:mm), reason }
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [month])

  async function load() {
    setLoading(true)
    const s = month + '-01'
    const e = format(endOfMonth(new Date(month + '-01')), 'yyyy-MM-dd')
    const [eR, pR, sR] = await Promise.all([
      supabase.from('employees').select('id, name, role, emp_type').eq('enabled', true).order('name'),
      supabase.from('punch_records').select('*').gte('date', s).lte('date', e).order('date', { ascending: false }).order('time', { ascending: false }),
      supabase.from('schedules').select('*').gte('date', s).lte('date', e),
    ])
    setEmps((eR.data || []).filter(x => x.id !== 'ADMIN'))
    setPunches(pR.data || [])
    setSchedules(sR.data || [])
    setLoading(false)
  }

  const empMap = useMemo(() => Object.fromEntries(emps.map(e => [e.id, e])), [emps])
  const schMap = useMemo(() => {
    const m = {}
    schedules.forEach(s => { m[`${s.employee_id}|${s.date}`] = s })
    return m
  }, [schedules])

  // 給單筆 punch 計算遲到/早退分鐘數
  function diagnose(r) {
    const emp = empMap[r.employee_id]
    const isPT = emp?.emp_type === 'PT'
    if (isPT) return { isLate: false, isEarly: false, lateMin: 0, earlyMin: 0, valid: r.is_valid !== false, override: !!r.manual_override, flexible: false }
    const s = schMap[`${r.employee_id}|${r.date}`]
    const v = s?.shift
    // 彈性班：不判遲到/早退
    if (v === '彈性班') return { isLate: false, isEarly: false, lateMin: 0, earlyMin: 0, valid: r.is_valid !== false, override: !!r.manual_override, flexible: true }
    const shift = (v === '早班' || v === '晚班' || v === '單人班') ? SHIFTS[v] : null
    let isLate = false, lateMin = 0, isEarly = false, earlyMin = 0
    if (shift && r.time) {
      const [h, m] = taipeiHM(r.time)
      let pm = h * 60 + m
      if (r.punch_type === '上班') {
        const sm = shift.startH * 60 + shift.startM + LATE_GRACE_MIN
        if (pm > sm) { isLate = true; lateMin = pm - sm }
      } else if (r.punch_type === '下班') {
        if (v === '晚班' && h < 12) pm += 1440
        const em = shift.endH * 60 + shift.endM
        if (pm < em) { isEarly = true; earlyMin = em - pm }
      }
    }
    return { isLate, lateMin, isEarly, earlyMin, valid: r.is_valid !== false, override: !!r.manual_override, flexible: false }
  }

  const enriched = useMemo(() => {
    return punches.map(r => ({ ...r, ...diagnose(r), empName: empMap[r.employee_id]?.name || r.name || r.employee_id, isPT: empMap[r.employee_id]?.emp_type === 'PT' }))
  }, [punches, empMap, schMap])

  const filtered = useMemo(() => {
    return enriched.filter(r => {
      if (filterEmp !== 'ALL' && r.employee_id !== filterEmp) return false
      if (filterType !== 'ALL' && r.punch_type !== filterType) return false
      if (filterAnomaly === 'LATE' && !r.isLate) return false
      if (filterAnomaly === 'EARLY' && !r.isEarly) return false
      if (filterAnomaly === 'INVALID' && r.valid) return false
      if (filterAnomaly === 'OVERRIDE' && !r.override) return false
      return true
    })
  }, [enriched, filterEmp, filterType, filterAnomaly])

  // Group by date for display
  const grouped = useMemo(() => {
    const g = {}
    filtered.forEach(r => { (g[r.date] = g[r.date] || []).push(r) })
    return Object.entries(g).sort((a, b) => b[0].localeCompare(a[0]))
  }, [filtered])

  function startEdit(r) {
    const [h, m] = taipeiHM(r.time)
    setEditing({
      id: r.id,
      date: r.date,
      time: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
      reason: r.override_reason || '',
      employee_id: r.employee_id,
      empName: r.empName,
      punch_type: r.punch_type,
    })
  }

  async function saveEdit() {
    if (!editing) return
    if (!editing.reason.trim()) { alert('請填寫修正原因'); return }
    setSaving(true)
    const newTimeIso = `${editing.date}T${editing.time}:00+08:00`
    const { error } = await supabase.from('punch_records').update({
      time: newTimeIso,
      date: editing.date,
      manual_override: true,
      override_by: user?.employee_id || 'ADMIN',
      override_at: new Date().toISOString(),
      override_reason: editing.reason.trim(),
      corrected_clock_in: editing.punch_type === '上班' ? newTimeIso : null,
      corrected_clock_out: editing.punch_type === '下班' ? newTimeIso : null,
    }).eq('id', editing.id)
    setSaving(false)
    if (error) { alert('儲存失敗: ' + error.message); return }
    setEditing(null)
    load()
  }

  async function deletePunch(r) {
    if (!confirm(`確定刪除 ${r.empName} ${r.date} ${r.punch_type}打卡 (${toTaipei(r.time)})？`)) return
    const { error } = await supabase.from('punch_records').delete().eq('id', r.id)
    if (error) return alert('刪除失敗: ' + error.message)
    load()
  }

  function exportCSV() {
    const headers = ['日期', '員工', '類型', '時間', 'GPS距離(m)', '有效', '遲到分鐘', '早退分鐘', '手動補卡', '修正原因', '修正人']
    const rows = filtered.map(r => [
      r.date,
      r.empName,
      r.punch_type,
      r.time ? toTaipei(r.time, true) : '',
      r.distance_m ?? '',
      r.valid ? '✓' : '✗',
      r.lateMin || '',
      r.earlyMin || '',
      r.override ? '✏️' : '',
      r.override_reason || '',
      r.override_by || '',
    ])
    const csv = '﻿' + [headers, ...rows].map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `全員打卡_${month}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  // 簡單統計
  const stats = useMemo(() => {
    const total = filtered.length
    const lateCount = filtered.filter(r => r.isLate).length
    const earlyCount = filtered.filter(r => r.isEarly).length
    const invalidCount = filtered.filter(r => !r.valid).length
    const overrideCount = filtered.filter(r => r.override).length
    return { total, lateCount, earlyCount, invalidCount, overrideCount }
  }, [filtered])

  return (
    <div className="page-container fade-in" style={{ paddingBottom: 80 }}>
      <button onClick={() => navigate(-1)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 12 }}>
        <ArrowLeft size={14} /> 返回
      </button>

      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: '#c9a84c', fontWeight: 600, margin: '0 0 4px' }}>全員打卡紀錄</h2>
      <p style={{ fontSize: 12, color: 'var(--text-dim)', margin: 0, marginBottom: 14 }}>檢視每位員工每天上下班打卡 · 老闆可修正時間（自動記錄稽核軌跡）· 紅色 = 遲到</p>

      {/* 月份切換 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, background: 'var(--black-card)', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)' }}>
        <button onClick={() => setMonth(format(subMonths(new Date(month + '-01'), 1), 'yyyy-MM'))} style={navBtn}><ChevronLeft size={16} /></button>
        <span style={{ fontSize: 16, fontWeight: 600, color: '#c9a84c', fontFamily: 'var(--font-mono)' }}>{month}</span>
        <button onClick={() => setMonth(format(addMonths(new Date(month + '-01'), 1), 'yyyy-MM'))} style={navBtn}><ChevronRight size={16} /></button>
      </div>

      {/* 統計卡片 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginBottom: 12 }}>
        <StatChip label="總筆數" value={stats.total} />
        <StatChip label="遲到" value={stats.lateCount} color="var(--red)" />
        <StatChip label="早退" value={stats.earlyCount} color="#f59e0b" />
        <StatChip label="無效" value={stats.invalidCount} color="#9ca3af" />
        <StatChip label="補卡" value={stats.overrideCount} color="var(--blue)" />
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: 10, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: 12, color: '#c9a84c' }}><Filter size={12} /> 篩選</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
          <select value={filterEmp} onChange={e => setFilterEmp(e.target.value)} style={inp}>
            <option value="ALL">全員</option>
            {emps.map(e => <option key={e.id} value={e.id}>{e.name}{e.emp_type === 'PT' ? '（PT）' : ''}</option>)}
          </select>
          <select value={filterType} onChange={e => setFilterType(e.target.value)} style={inp}>
            <option value="ALL">上班+下班</option>
            <option value="上班">只看上班</option>
            <option value="下班">只看下班</option>
          </select>
          <select value={filterAnomaly} onChange={e => setFilterAnomaly(e.target.value)} style={inp}>
            <option value="ALL">所有狀態</option>
            <option value="LATE">🔴 只看遲到</option>
            <option value="EARLY">🟡 只看早退</option>
            <option value="INVALID">⚠️ 只看無效</option>
            <option value="OVERRIDE">✏️ 只看補卡</option>
          </select>
        </div>
        <button onClick={exportCSV} style={{ marginTop: 8, width: '100%', padding: 8, background: 'rgba(196,163,90,.1)', border: '1px solid var(--border-gold)', borderRadius: 6, color: '#c9a84c', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Download size={12} /> 下載 CSV
        </button>
      </div>

      {loading ? <div className="loading-shimmer" style={{ height: 200 }} /> :
        grouped.length === 0 ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>本月無打卡紀錄</div> :
        grouped.map(([date, list]) => (
          <div key={date} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#c9a84c', marginBottom: 6, fontFamily: 'var(--font-mono)' }}>{date}（{new Date(date).toLocaleDateString('zh-TW', { weekday: 'short' })}）</div>
            {list.map(r => (
              <div key={r.id} className="card" style={{ padding: '10px 12px', marginBottom: 6, borderLeft: r.isLate ? '3px solid var(--red)' : r.isEarly ? '3px solid #f59e0b' : !r.valid ? '3px solid #9ca3af' : '3px solid transparent' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14, fontWeight: 600 }}>{r.empName}</span>
                      {r.isPT && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 8, background: 'rgba(196,163,90,.15)', color: '#c9a84c' }}>PT</span>}
                      {r.flexible && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 8, background: 'rgba(196,163,90,.15)', color: '#c9a84c' }}>彈性班</span>}
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: r.punch_type === '上班' ? 'rgba(100,170,100,.15)' : 'rgba(77,140,196,.15)', color: r.punch_type === '上班' ? 'rgba(100,170,100,.9)' : 'rgba(77,140,196,.9)' }}>{r.punch_type}</span>
                      <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: r.isLate ? 'var(--red)' : r.isEarly ? '#f59e0b' : 'var(--text)', fontWeight: r.isLate || r.isEarly ? 700 : 400 }}>{r.time ? toTaipei(r.time, true) : '—'}</span>
                      {r.isLate && <span style={{ fontSize: 11, color: 'var(--red)', fontWeight: 700 }}>🔴遲到 {r.lateMin}分</span>}
                      {r.isEarly && <span style={{ fontSize: 11, color: '#f59e0b', fontWeight: 700 }}>🟡早退 {r.earlyMin}分</span>}
                      {!r.valid && <span style={{ fontSize: 11, color: '#9ca3af' }}>⚠️無效({r.distance_m}m)</span>}
                      {r.override && <span style={{ fontSize: 11, color: 'var(--blue)' }}>✏️補卡</span>}
                    </div>
                    {r.override_reason && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>📝 {r.override_reason} · {r.override_by}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => startEdit(r)} style={iconBtn('#c9a84c')} title="修正時間"><Edit3 size={14} /></button>
                    <button onClick={() => deletePunch(r)} style={iconBtn('var(--red)')} title="刪除"><Trash2 size={14} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}

      {/* 編輯 Modal */}
      {editing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setEditing(null)}>
          <div style={{ background: 'var(--black-card)', border: '1px solid var(--border-gold)', borderRadius: 16, padding: 20, width: '100%', maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#c9a84c' }}>修正打卡時間</div>
              <button onClick={() => setEditing(null)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <div style={{ background: 'rgba(196,163,90,.05)', padding: 10, borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
              <div><b>{editing.empName}</b> · {editing.punch_type}</div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={lbl}>日期</label>
              <input type="date" value={editing.date} onChange={e => setEditing({ ...editing, date: e.target.value })} style={inp} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={lbl}>時間（24h，台灣時間）</label>
              <input type="time" value={editing.time} onChange={e => setEditing({ ...editing, time: e.target.value })} style={inp} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={lbl}>修正原因（必填）</label>
              <input value={editing.reason} onChange={e => setEditing({ ...editing, reason: e.target.value })} placeholder="例：系統當機補登、員工忘記打卡" style={inp} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setEditing(null)} style={{ flex: 1, padding: 10, background: 'var(--black)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', cursor: 'pointer' }}>取消</button>
              <button onClick={saveEdit} disabled={saving} style={{ flex: 1, padding: 10, background: '#c9a84c', color: '#000', border: 'none', borderRadius: 8, fontWeight: 700, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Save size={14} /> {saving ? '儲存中…' : '儲存修正'}
              </button>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8 }}>⚙️ 修正會自動標記為「手動補卡」並記錄你的帳號與時間</div>
          </div>
        </div>
      )}
    </div>
  )
}

const navBtn = { background: 'var(--black)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 10px', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center' }
const inp = { width: '100%', padding: '8px 10px', background: 'var(--black)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' }
const lbl = { display: 'block', fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }
const iconBtn = (color) => ({ background: 'transparent', border: `1px solid ${color}33`, color, padding: 6, borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center' })

function StatChip({ label, value, color = '#c9a84c' }) {
  return (
    <div style={{ background: 'var(--black-card)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 4px', textAlign: 'center' }}>
      <div style={{ fontSize: 16, fontWeight: 700, color, fontFamily: 'var(--font-mono)' }}>{value}</div>
      <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 2 }}>{label}</div>
    </div>
  )
}
