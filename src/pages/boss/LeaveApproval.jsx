import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { CheckCircle2, XCircle, AlertCircle, Calendar, Users } from 'lucide-react'
import { format, subMonths, endOfMonth } from 'date-fns'

const TYPE_COLORS = {
  '事假': '#ffd700', '病假': '#ffb347', '特休': '#64c8ff',
  '調班': '#c896ff', '臨時請假': '#ff6b6b', '休假': '#e74c3c',
}

export default function LeaveApproval() {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'))
  const [rejectId, setRejectId] = useState(null)
  const [rejectReason, setRejectReason] = useState('')

  const months = Array.from({ length: 3 }, (_, i) => format(subMonths(new Date(), i), 'yyyy-MM'))
  const pending = requests.filter(r => r.status === '待審核' || r.status === 'pending')
  const processed = requests.filter(r => r.status !== '待審核' && r.status !== 'pending')

  useEffect(() => { load() }, [month])

  async function load() {
    setLoading(true)
    const s = month + '-01', e = format(endOfMonth(new Date(month + '-01')), 'yyyy-MM-dd')
    const { data } = await supabase.from('leave_requests').select('*').gte('date', s).lte('date', e).order('created_at', { ascending: false })
    setRequests(data || [])
    setLoading(false)
  }

  async function approve(id) {
    if (!confirm('核准此假單？')) return
    const req = requests.find(r => r.id === id)
    await supabase.from('leave_requests').update({ status: '已核准', reviewed_by: 'Wilson', reviewed_at: new Date().toISOString() }).eq('id', id)
    if (req) {
      await supabase.from('schedules').upsert({ employee_id: req.employee_id, date: req.date, shift: req.leave_type }, { onConflict: 'employee_id,date' })
    }
    load()
  }

  async function reject(id) {
    if (!rejectReason.trim()) return alert('請填寫駁回原因')
    await supabase.from('leave_requests').update({ status: '已駁回', reviewed_by: 'Wilson', reviewed_at: new Date().toISOString(), reject_reason: rejectReason }).eq('id', id)
    setRejectId(null); setRejectReason('')
    load()
  }
  const typeBadge = (type) => {
    const color = TYPE_COLORS[type] || '#8a8278'
    return <span style={{ background: color + '22', color, padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>{type}</span>
  }

  const statusBadge = (s) => {
    const m = { '待審核': { c: '#ff9800', t: '待審核' }, pending: { c: '#ff9800', t: '待審核' }, '已核准': { c: '#4caf50', t: '已核准' }, approved: { c: '#4caf50', t: '已核准' }, '已駁回': { c: '#e74c3c', t: '已駁回' }, rejected: { c: '#e74c3c', t: '已駁回' } }
    const v = m[s] || { c: '#8a8278', t: s }
    return <span style={{ color: v.c, fontWeight: 600, fontSize: 11 }}>{v.t}</span>
  }

  const renderCard = (r, showActions) => (
    <div key={r.id} style={{ background: '#1a1714', border: '1px solid ' + (showActions ? '#ff980044' : '#2a2520'), borderRadius: 10, padding: 14, marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 600, color: '#e8dcc8' }}>{r.employee_name}</span>
          {typeBadge(r.leave_type)}
        </div>
        {statusBadge(r.status)}
      </div>
      <div style={{ fontSize: 12, color: '#8a8278', display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
        <span>日期: {r.date}</span>
        {r.original_shift && <span>原班: {r.original_shift}</span>}
        {r.swap_to_date && <span>調往: {r.swap_to_date}</span>}
      </div>
      {r.reason && <div style={{ fontSize: 12, color: '#a09888', marginBottom: 6 }}>原因: {r.reason}</div>}
      {r.reject_reason && <div style={{ fontSize: 12, color: '#e74c3c' }}>駁回: {r.reject_reason}</div>}
      {showActions && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button onClick={() => approve(r.id)} style={{ flex: 1, padding: '8px', borderRadius: 6, border: 'none', background: '#4caf50', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <CheckCircle2 size={14} /> 核准
          </button>
          {rejectId === r.id ? (
            <div style={{ flex: 2, display: 'flex', gap: 4 }}>
              <input value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder='駁回原因...' style={{ flex: 1, padding: '6px 8px', background: '#0a0a0a', border: '1px solid #2a2520', borderRadius: 6, color: '#e8dcc8', fontSize: 12 }} />
              <button onClick={() => reject(r.id)} style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: '#e74c3c', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>確定</button>
              <button onClick={() => { setRejectId(null); setRejectReason('') }} style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #2a2520', background: 'none', color: '#8a8278', fontSize: 12, cursor: 'pointer' }}>取消</button>
            </div>
          ) : (
            <button onClick={() => setRejectId(r.id)} style={{ flex: 1, padding: '8px', borderRadius: 6, border: '1px solid #e74c3c44', background: 'transparent', color: '#e74c3c', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <XCircle size={14} /> 駁回
            </button>
          )}
        </div>
      )}
    </div>
  )
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto' }}>
        {months.map(m => <button key={m} onClick={() => setMonth(m)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid ' + (m === month ? '#c9a84c' : '#2a2520'), background: m === month ? '#c9a84c22' : 'transparent', color: m === month ? '#c9a84c' : '#8a8278', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>{m}</button>)}
      </div>

      {loading ? <div style={{ textAlign: 'center', padding: 30, color: '#8a8278' }}>載入中...</div> : (
        <>
          {pending.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#ff9800', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertCircle size={16} /> 待審核 ({pending.length})
              </div>
              {pending.map(r => renderCard(r, true))}
            </div>
          )}

          {pending.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: '#4caf50', fontSize: 13 }}>✔ 無待審核假單</div>}

          {processed.length > 0 && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#8a8278', marginBottom: 8 }}>已處理 ({processed.length})</div>
              {processed.map(r => renderCard(r, false))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
