import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react'
import { format, subDays, addDays, subMonths, endOfMonth } from 'date-fns'

export default function PunchHistory() {
  const { user } = useAuth()
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'))
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [month])

  async function load() {
    setLoading(true)
    const s = month + '-01', e = format(endOfMonth(new Date(month + '-01')), 'yyyy-MM-dd')
    const { data } = await supabase.from('punch_records').select('*')
      .eq('employee_id', user.employee_id)
      .gte('date', s).lte('date', e)
      .order('date', { ascending: false }).order('time', { ascending: false })
    setRecords(data || [])
    setLoading(false)
  }

  // Group by date
  const byDate = {}
  records.forEach(r => { if (!byDate[r.date]) byDate[r.date] = []; byDate[r.date].push(r) })

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <button style={nb} onClick={() => setMonth(format(subMonths(new Date(month + '-01'), 1), 'yyyy-MM'))}><ChevronLeft size={16} /></button>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--gold)', display: 'flex', alignItems: 'center', gap: 6 }}><Clock size={14} /> {month} 打卡紀錄</span>
        <button style={nb} onClick={() => { const d = new Date(month + '-01'); d.setMonth(d.getMonth() + 1); setMonth(format(d, 'yyyy-MM')) }}><ChevronRight size={16} /></button>
      </div>

      {loading ? <div className="loading-shimmer" style={{ height: 80 }} /> :
        Object.keys(byDate).length === 0 ? <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-dim)', fontSize: 13 }}>本月無打卡紀錄</div> :
          Object.entries(byDate).map(([date, recs]) => (
            <div key={date} className="card" style={{ padding: 12, marginBottom: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gold)', marginBottom: 6 }}>{date}</div>
              {recs.map(r => (
                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', borderBottom: '1px dotted var(--border)' }}>
                  <span>{r.punch_type} {r.time?.slice(11, 19)}</span>
                  <span style={{ color: r.is_valid ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>{r.distance_m}m {r.is_valid ? '✓' : '✗'}</span>
                </div>
              ))}
            </div>
          ))}
    </div>
  )
}

const nb = { background: 'var(--black-card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }
