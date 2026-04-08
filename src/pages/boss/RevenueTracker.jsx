import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { format, endOfMonth, subMonths } from 'date-fns'

export default function RevenueTracker() {
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'))
  const [days, setDays] = useState([])
  const [stats, setStats] = useState({ revenue: 0, expense: 0 })
  const [loading, setLoading] = useState(true)
  const months = [0,1,2,3,4,5].map(i => format(subMonths(new Date(), i), 'yyyy-MM'))

  useEffect(() => { load() }, [month])

  async function load() {
    setLoading(true)
    const mEnd = format(endOfMonth(new Date(month + '-01')), 'yyyy-MM-dd')
    const [revR, expR] = await Promise.all([
      supabase.from('daily_revenue').select('*').gte('date', month + '-01').lte('date', mEnd).order('date', { ascending: false }),
      supabase.from('expenses').select('amount').gte('date', month + '-01').lte('date', mEnd),
    ])
    const revData = revR.data || []
    const expTotal = (expR.data || []).reduce((s, e) => s + (+e.amount || 0), 0)
    const revTotal = revData.reduce((s, r) => s + (+r.total || 0), 0)
    setStats({ revenue: revTotal, expense: expTotal })
    const daysInMonth = new Date(+month.split('-')[0], +month.split('-')[1], 0).getDate()
    const today = format(new Date(), 'yyyy-MM-dd')
    const dayList = []
    for (let d = daysInMonth; d >= 1; d--) {
      const date = month + '-' + String(d).padStart(2, '0')
      const rev = revData.find(r => r.date === date)
      dayList.push({ date, rev, isToday: date === today })
    }
    setDays(dayList)
    setLoading(false)
  }

  const profit = stats.revenue - stats.expense

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {months.map(m => (
          <button key={m} onClick={() => setMonth(m)} style={{ padding: '6px 14px', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', background: m === month ? 'var(--gold-glow)' : 'transparent', color: m === month ? 'var(--gold)' : 'var(--text-dim)', border: m === month ? '1px solid var(--border-gold)' : '1px solid var(--border)' }}>
            {+m.split('-')[1]}月
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
        <div className="card" style={{ textAlign: 'center', padding: 14 }}>
          <div style={{ fontSize: 14, color: 'var(--text-dim)' }}>月營收</div>
          <div style={{ fontSize: 24, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--gold)', marginTop: 4 }}>{"$"}{stats.revenue.toLocaleString()}</div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: 14 }}>
          <div style={{ fontSize: 14, color: 'var(--text-dim)' }}>月支出</div>
          <div style={{ fontSize: 24, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--red)', marginTop: 4 }}>{"$"}{stats.expense.toLocaleString()}</div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: 14 }}>
          <div style={{ fontSize: 14, color: 'var(--text-dim)' }}>毛利</div>
          <div style={{ fontSize: 24, fontFamily: 'var(--font-mono)', fontWeight: 700, color: profit >= 0 ? 'var(--green)' : 'var(--red)', marginTop: 4 }}>{"$"}{profit.toLocaleString()}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
        <div className="card" style={{ textAlign: 'center', padding: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>現金</div>
          <div style={{ fontSize: 16, fontFamily: 'var(--font-mono)', fontWeight: 600, marginTop: 2 }}>{"$"}{days.reduce((s,d) => s + (+d.rev?.cash_amount||0), 0).toLocaleString()}</div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>刷卡</div>
          <div style={{ fontSize: 16, fontFamily: 'var(--font-mono)', fontWeight: 600, marginTop: 2 }}>{"$"}{days.reduce((s,d) => s + (+d.rev?.card_amount||0), 0).toLocaleString()}</div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>轉帳/微信</div>
          <div style={{ fontSize: 16, fontFamily: 'var(--font-mono)', fontWeight: 600, marginTop: 2 }}>{"$"}{days.reduce((s,d) => s + (+d.rev?.transfer_amount||0) + (+d.rev?.wechat_amount||0), 0).toLocaleString()}</div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>支付寶</div>
          <div style={{ fontSize: 16, fontFamily: 'var(--font-mono)', fontWeight: 600, marginTop: 2 }}>{"$"}{days.reduce((s,d) => s + (+d.rev?.alipay_amount||0), 0).toLocaleString()}</div>
        </div>
      </div>

      {days.map(d => (
        <div key={d.date} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
          <div>
            <span style={{ fontSize: 14, color: d.isToday ? 'var(--gold)' : 'var(--text)' }}>{d.date.slice(5)} {d.isToday ? '(今天)' : ''}</span>
            {d.rev && <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
              {+d.rev.cash_amount > 0 && <span style={{ fontSize: 11, color: '#4da86c', background: 'rgba(77,168,108,.1)', padding: '2px 6px', borderRadius: 8 }}>{'💵'}{(+d.rev.cash_amount).toLocaleString()}</span>}
              {+d.rev.acpay_amount > 0 && <span style={{ fontSize: 11, color: '#4d8ac4', background: 'rgba(77,138,196,.1)', padding: '2px 6px', borderRadius: 8 }}>{'💳'}ACPAY {(+d.rev.acpay_amount).toLocaleString()}</span>}
              {+d.rev.teb_amount > 0 && <span style={{ fontSize: 11, color: '#8b6cc4', background: 'rgba(139,108,196,.1)', padding: '2px 6px', borderRadius: 8 }}>{'🏦'}企銀 {(+d.rev.teb_amount).toLocaleString()}</span>}
              {+d.rev.wechat_amount > 0 && <span style={{ fontSize: 11, color: '#07c160', background: 'rgba(7,193,96,.1)', padding: '2px 6px', borderRadius: 8 }}>{'💚'}微信 {(+d.rev.wechat_amount).toLocaleString()}</span>}
              {+d.rev.alipay_amount > 0 && <span style={{ fontSize: 11, color: '#1677ff', background: 'rgba(22,119,255,.1)', padding: '2px 6px', borderRadius: 8 }}>{'🔵'}支付寶 {(+d.rev.alipay_amount).toLocaleString()}</span>}
            </div>}
          </div>
          <div style={{ textAlign: 'right' }}>
            {d.rev ? (
              <div>
                <div style={{ fontSize: 17, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--gold)' }}>{"$"}{(+d.rev.total).toLocaleString()}</div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{d.rev.customer_count||0}組 · {d.rev.recorded_by}</div>
              </div>
            ) : (
              <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>點擊登記</span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
