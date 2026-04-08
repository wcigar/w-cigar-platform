import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { FileText, Printer, Star } from 'lucide-react'
import { format, subMonths, endOfMonth } from 'date-fns'

export default function KPIReport() {
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'))
  const [emps, setEmps] = useState([])
  const [tasks, setTasks] = useState([])
  const [kpis, setKpis] = useState([])
  const [loading, setLoading] = useState(true)
  const months = Array.from({ length: 6 }, (_, i) => format(subMonths(new Date(), i), 'yyyy-MM'))

  useEffect(() => { load() }, [month])

  async function load() {
    setLoading(true)
    const start = month + '-01', end = format(endOfMonth(new Date(month + '-01')), 'yyyy-MM-dd')
    const [eR, tR, kR, pR, lR] = await Promise.all([
      supabase.from('employees').select('*').eq('enabled', true),
      supabase.from('task_status').select('*').gte('date', start).lte('date', end),
      supabase.from('kpi_evaluations').select('*').eq('month', month),
      supabase.from('punch_records').select('*').gte('date', start).lte('date', end),
      supabase.from('leave_requests').select('*').gte('date', start).lte('date', end),
    ])
    setEmps((eR.data || []).filter(e => !e.is_admin && e.id !== 'ADMIN'))
    setTasks(tR.data || [])
    setKpis(kR.data || [])
    setLoading(false)
  }

  function getMetrics(empId, empName) {
    const myTasks = tasks.filter(t => t.owner === empId)
    const done = myTasks.filter(t => t.completed).length
    const rate = myTasks.length ? Math.round(done / myTasks.length * 100) : 0
    const grabs = tasks.filter(t => t.owner === 'ALL' && t.completed && t.completed_by === empName).length
    const kpi = kpis.find(k => k.employee_id === empId)
    let grade = 'C'
    if (rate >= 95 && grabs >= 15) grade = 'A+'
    else if (rate >= 85 && grabs >= 8) grade = 'A'
    else if (rate >= 70 && grabs >= 3) grade = 'B'
    return { total: myTasks.length, done, rate, grabs, suggestedGrade: grade, bossGrade: kpi?.boss_grade || '-', comment: kpi?.boss_comment || '', locked: kpi?.lock_status === '已鎖定' }
  }

  function handlePrint() {
    const printArea = document.getElementById('kpi-print-area')
    if (!printArea) return
    const w = window.open('', '_blank')
    w.document.write('<html><head><title>W Cigar Bar KPI月報 ' + month + '</title>')
    w.document.write('<style>')
    w.document.write('body{font-family:sans-serif;padding:30px;color:#222;background:#fff}')
    w.document.write('h1{font-size:22px;border-bottom:2px solid #c9a84c;padding-bottom:8px;color:#333}')
    w.document.write('h2{font-size:16px;margin-top:24px;color:#c9a84c}')
    w.document.write('.card{border:1px solid #ddd;border-radius:10px;padding:16px;margin-bottom:12px;page-break-inside:avoid}')
    w.document.write('.grid{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;margin:10px 0}')
    w.document.write('.stat{text-align:center;padding:8px;background:#f8f8f8;border-radius:6px}')
    w.document.write('.stat .num{font-size:22px;font-weight:700;font-family:monospace}')
    w.document.write('.stat .lbl{font-size:10px;color:#999}')
    w.document.write('.green{color:#2d8b4e}.red{color:#c44d4d}.gold{color:#c9a84c}')
    w.document.write('.bar{height:8px;border-radius:4px;background:#eee;margin:6px 0}')
    w.document.write('.bar-fill{height:100%;border-radius:4px}')
    w.document.write('@media print{body{padding:15px}}')
    w.document.write('</style></head><body>')
    w.document.write(printArea.innerHTML)
    w.document.write('</body></html>')
    w.document.close()
    setTimeout(() => w.print(), 500)
  }

  if (loading) return <div>{[1,2,3].map(i => <div key={i} className="loading-shimmer" style={{ height: 80, marginBottom: 8 }} />)}</div>

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, overflowX: 'auto' }}>
        {months.map(m => (
          <button key={m} onClick={() => setMonth(m)} style={{ padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', cursor: 'pointer', background: m === month ? 'var(--gold-glow)' : 'transparent', color: m === month ? 'var(--gold)' : 'var(--text-dim)', border: m === month ? '1px solid var(--border-gold)' : '1px solid var(--border)' }}>{parseInt(m.slice(5))}月</button>
        ))}
      </div>

      <button className="btn-gold" onClick={handlePrint} style={{ width: '100%', padding: 14, fontSize: 15, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <Printer size={18} /> 列印 / 匯出 PDF
      </button>

      <div id="kpi-print-area">
        <div style={{ display: 'none' }}>
          <h1>W Cigar Bar — {month.slice(0,4)}年{parseInt(month.slice(5))}月 員工績效月報</h1>
          <p>報表產生時間：{format(new Date(), 'yyyy/MM/dd HH:mm')}</p>
        </div>

        {emps.map(emp => {
          const m = getMetrics(emp.id, emp.name)
          const gradeColor = m.bossGrade === 'A+' || m.bossGrade === 'A' ? 'var(--green)' : m.bossGrade === 'B' ? 'var(--gold)' : 'var(--red)'
          return (
            <div key={emp.id} className="card" style={{ padding: 16, marginBottom: 10, borderColor: m.locked ? 'rgba(77,168,108,.3)' : undefined }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{emp.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{emp.id} · {emp.title} · {emp.emp_type}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 32, fontFamily: 'var(--font-mono)', fontWeight: 700, color: gradeColor, lineHeight: 1 }}>{m.bossGrade}</div>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>建議:{m.suggestedGrade}</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, marginBottom: 12 }} className="grid">
                <div className="stat" style={{ padding: 8, background: 'var(--black)', borderRadius: 8, textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: 'var(--text-dim)' }} className="lbl">SOP達成</div>
                  <div style={{ fontSize: 20, fontFamily: 'var(--font-mono)', fontWeight: 700, color: m.rate >= 85 ? 'var(--green)' : m.rate >= 70 ? 'var(--gold)' : 'var(--red)' }} className="num">{m.rate}%</div>
                </div>
                <div className="stat" style={{ padding: 8, background: 'var(--black)', borderRadius: 8, textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: 'var(--text-dim)' }} className="lbl">完成/總數</div>
                  <div style={{ fontSize: 20, fontFamily: 'var(--font-mono)', fontWeight: 700 }} className="num">{m.done}/{m.total}</div>
                </div>
                <div className="stat" style={{ padding: 8, background: 'var(--black)', borderRadius: 8, textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: 'var(--text-dim)' }} className="lbl">搶單數</div>
                  <div style={{ fontSize: 20, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--gold)' }} className="num">{m.grabs}</div>
                </div>
                <div className="stat" style={{ padding: 8, background: 'var(--black)', borderRadius: 8, textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: 'var(--text-dim)' }} className="lbl">狀態</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: m.locked ? 'var(--green)' : '#f59e0b', marginTop: 4 }}>{m.locked ? '已鎖定' : '草稿'}</div>
                </div>
              </div>

              <div className="bar" style={{ height: 8, background: 'var(--black)', borderRadius: 4, overflow: 'hidden' }}>
                <div className="bar-fill" style={{ height: '100%', width: m.rate + '%', background: m.rate >= 85 ? 'var(--green)' : m.rate >= 70 ? 'var(--gold)' : 'var(--red)', borderRadius: 4 }} />
              </div>

              {m.comment && <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 8, padding: '6px 10px', background: 'var(--black)', borderRadius: 6 }}>💬 {m.comment}</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
