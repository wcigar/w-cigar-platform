import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { DollarSign, Save, TrendingUp, Users } from 'lucide-react'
import { format, subMonths, eachDayOfInterval, startOfMonth, endOfMonth, subDays } from 'date-fns'

export default function RevenueTracker() {
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'))
  const [revenues, setRevenues] = useState([])
  const [expenses, setExpenses] = useState([])
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ cash: '', card: '', transfer: '', other: '', customers: '', note: '' })
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const months = Array.from({ length: 6 }, (_, i) => format(subMonths(new Date(), i), 'yyyy-MM'))

  useEffect(() => { load() }, [month])

  async function load() {
    setLoading(true)
    const s = month + '-01', e = format(endOfMonth(new Date(month + '-01')), 'yyyy-MM-dd')
    const [rR, xR] = await Promise.all([
      supabase.from('daily_revenue').select('*').gte('date', s).lte('date', e).order('date'),
      supabase.from('expenses').select('date, amount').gte('date', s).lte('date', e),
    ])
    setRevenues(rR.data || []); setExpenses(xR.data || [])
    setLoading(false)
  }

  function startEdit(date) {
    const existing = revenues.find(r => r.date === date)
    setForm({
      cash: existing?.cash_amount || '', card: existing?.card_amount || '',
      transfer: existing?.transfer_amount || '', other: existing?.other_amount || '',
      customers: existing?.customer_count || '', note: existing?.note || ''
    })
    setEditing(date)
  }

  async function saveRevenue() {
    if (!editing) return
    setSaving(true)
    const total = (+form.cash || 0) + (+form.card || 0) + (+form.transfer || 0) + (+form.other || 0)
    const existing = revenues.find(r => r.date === editing)
    const row = {
      date: editing, cash_amount: +form.cash || 0, card_amount: +form.card || 0,
      transfer_amount: +form.transfer || 0, other_amount: +form.other || 0,
      total, customer_count: +form.customers || 0, note: form.note, recorded_by: 'Wilson'
    }
    if (existing) await supabase.from('daily_revenue').update(row).eq('id', existing.id)
    else await supabase.from('daily_revenue').insert(row)
    setSaving(false); setEditing(null); load()
  }

  const monthTotal = revenues.reduce((s, r) => s + (+r.total || 0), 0)
  const monthCash = revenues.reduce((s, r) => s + (+r.cash_amount || 0), 0)
  const monthCard = revenues.reduce((s, r) => s + (+r.card_amount || 0), 0)
  const monthTransfer = revenues.reduce((s, r) => s + (+r.transfer_amount || 0), 0)
  const monthCustomers = revenues.reduce((s, r) => s + (+r.customer_count || 0), 0)
  const monthExpense = expenses.reduce((s, x) => s + (+x.amount || 0), 0)
  const profit = monthTotal - monthExpense
  const daysWithData = revenues.filter(r => +r.total > 0).length
  const avgDaily = daysWithData > 0 ? Math.round(monthTotal / daysWithData) : 0

  const days = useMemo(() => {
    const start = startOfMonth(new Date(month + '-01'))
    const end = new Date() < endOfMonth(start) ? subDays(new Date(), 0) : endOfMonth(start)
    return eachDayOfInterval({ start, end }).map(d => format(d, 'yyyy-MM-dd'))
  }, [month])

  if (loading) return <div>{[1,2,3].map(i => <div key={i} className="loading-shimmer" style={{ height: 60, marginBottom: 8 }} />)}</div>

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto' }}>
        {months.map(m => <button key={m} onClick={() => setMonth(m)} style={{ padding: '6px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap', cursor: 'pointer', background: m === month ? 'var(--gold-glow)' : 'transparent', color: m === month ? 'var(--gold)' : 'var(--text-dim)', border: m === month ? '1px solid var(--border-gold)' : '1px solid var(--border)' }}>{parseInt(m.slice(5))}\u6708</button>)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, marginBottom: 8 }}>
        <div className="card" style={{ padding: 10, textAlign: 'center', borderColor: 'var(--border-gold)' }}>
          <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>\u6708\u71df\u6536</div>
          <div style={{ fontSize: 20, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--gold)' }}>${monthTotal.toLocaleString()}</div>
        </div>
        <div className="card" style={{ padding: 10, textAlign: 'center' }}>
          <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>\u6708\u652f\u51fa</div>
          <div style={{ fontSize: 20, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--red)' }}>${monthExpense.toLocaleString()}</div>
        </div>
        <div className="card" style={{ padding: 10, textAlign: 'center' }}>
          <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>\u6bdb\u5229</div>
          <div style={{ fontSize: 20, fontFamily: 'var(--font-mono)', fontWeight: 700, color: profit >= 0 ? 'var(--green)' : 'var(--red)' }}>${profit.toLocaleString()}</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, marginBottom: 14 }}>
        <div className="card" style={{ padding: 6, textAlign: 'center' }}><div style={{ fontSize: 8, color: 'var(--text-dim)' }}>\u73fe\u91d1</div><div style={{ fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>${monthCash.toLocaleString()}</div></div>
        <div className="card" style={{ padding: 6, textAlign: 'center' }}><div style={{ fontSize: 8, color: 'var(--text-dim)' }}>\u5237\u5361</div><div style={{ fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>${monthCard.toLocaleString()}</div></div>
        <div className="card" style={{ padding: 6, textAlign: 'center' }}><div style={{ fontSize: 8, color: 'var(--text-dim)' }}>\u8f49\u5e33</div><div style={{ fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>${monthTransfer.toLocaleString()}</div></div>
        <div className="card" style={{ padding: 6, textAlign: 'center' }}><div style={{ fontSize: 8, color: 'var(--text-dim)' }}>\u65e5\u5747</div><div style={{ fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--gold)' }}>${avgDaily.toLocaleString()}</div></div>
      </div>

      {editing && (
        <div className="card" style={{ padding: 16, marginBottom: 14, borderColor: 'var(--border-gold)' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gold)', marginBottom: 10 }}>\ud83d\udcb0 {editing} \u71df\u6536\u767b\u8a18</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <div><div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 2 }}>\ud83d\udcb5 \u73fe\u91d1</div><input type="text" inputMode="numeric" pattern="[0-9]*" value={form.cash} onChange={e => setForm(p => ({...p, cash: e.target.value}))} placeholder="0" style={{ fontSize: 16, padding: 8, fontFamily: 'var(--font-mono)' }} /></div>
            <div><div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 2 }}>\ud83d\udcb3 \u5237\u5361</div><input type="text" inputMode="numeric" pattern="[0-9]*" value={form.card} onChange={e => setForm(p => ({...p, card: e.target.value}))} placeholder="0" style={{ fontSize: 16, padding: 8, fontFamily: 'var(--font-mono)' }} /></div>
            <div><div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 2 }}>\ud83c\udfe6 \u8f49\u5e33</div><input type="text" inputMode="numeric" pattern="[0-9]*" value={form.transfer} onChange={e => setForm(p => ({...p, transfer: e.target.value}))} placeholder="0" style={{ fontSize: 16, padding: 8, fontFamily: 'var(--font-mono)' }} /></div>
            <div><div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 2 }}>\ud83d\udc65 \u4eba\u6578</div><input type="text" inputMode="numeric" pattern="[0-9]*" value={form.customers} onChange={e => setForm(p => ({...p, customers: e.target.value}))} placeholder="0" style={{ fontSize: 16, padding: 8, fontFamily: 'var(--font-mono)' }} /></div>
          </div>
          <input placeholder="\u5099\u8a3b" value={form.note} onChange={e => setForm(p => ({...p, note: e.target.value}))} style={{ marginBottom: 10, fontSize: 13, padding: 8 }} />
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gold)', textAlign: 'right', marginBottom: 10 }}>\u5408\u8a08: ${((+form.cash||0)+(+form.card||0)+(+form.transfer||0)+(+form.other||0)).toLocaleString()}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-gold" onClick={saveRevenue} disabled={saving} style={{ flex: 1, padding: 12, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Save size={14} /> {saving ? '\u5132\u5b58\u4e2d...' : '\u5132\u5b58'}</button>
            <button className="btn-outline" onClick={() => setEditing(null)} style={{ flex: 1, padding: 12 }}>\u53d6\u6d88</button>
          </div>
        </div>
      )}

      {days.map(date => {
        const rev = revenues.find(r => r.date === date)
        const total = rev ? +rev.total : 0
        const isToday = date === format(new Date(), 'yyyy-MM-dd')
        return (
          <div key={date} className="card" style={{ padding: 12, marginBottom: 4, cursor: 'pointer', borderColor: isToday ? 'var(--border-gold)' : total > 0 ? 'rgba(77,168,108,.2)' : undefined, opacity: total > 0 ? 1 : 0.6 }} onClick={() => startEdit(date)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: isToday ? 'var(--gold)' : 'var(--text)' }}>{date.slice(5)} {isToday ? '(\u4eca\u5929)' : ''}</div>
                {total > 0 && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>\u73fe\u91d1${(+rev.cash_amount||0).toLocaleString()} \u5237\u5361${(+rev.card_amount||0).toLocaleString()} \u8f49\u5e33${(+rev.transfer_amount||0).toLocaleString()} {rev.customer_count ? '\u00b7 '+rev.customer_count+'\u4eba' : ''}</div>}
              </div>
              <div style={{ fontSize: total > 0 ? 18 : 14, fontFamily: 'var(--font-mono)', fontWeight: 700, color: total > 0 ? 'var(--gold)' : 'var(--text-muted)' }}>
                {total > 0 ? '$'+total.toLocaleString() : '\u9ede\u64ca\u767b\u8a18'}
              </div>
            </div>
          </div>
        )
      }).reverse()}
    </div>
  )
}
