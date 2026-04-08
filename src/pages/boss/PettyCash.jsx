import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Wallet, Users, ChevronDown, ChevronUp, Image } from 'lucide-react'
import { format, subMonths, endOfMonth } from 'date-fns'

export default function PettyCash() {
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'))
  const [records, setRecords] = useState([])
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('overview')
  const [photoModal, setPhotoModal] = useState(null)
  const months = Array.from({ length: 6 }, (_, i) => format(subMonths(new Date(), i), 'yyyy-MM'))

  useEffect(() => { load() }, [month])

  async function load() {
    setLoading(true)
    const s = month + '-01', e = format(endOfMonth(new Date(month + '-01')), 'yyyy-MM-dd')
    const [pR, xR] = await Promise.all([
      supabase.from('petty_cash').select('*').gte('date', s).lte('date', e).order('date', { ascending: false }),
      supabase.from('expenses').select('*').gte('date', s).lte('date', e).order('date', { ascending: false }),
    ])
    setRecords(pR.data || []); setExpenses(xR.data || [])
    setLoading(false)
  }

  const totalIn = records.reduce((s, r) => s + (r.amount || 0), 0)
  const totalOut = expenses.reduce((s, r) => s + (r.amount || 0), 0)
  const balance = totalIn - totalOut
  const wilsonIn = records.filter(r => r.given_by === 'Wilson').reduce((s, r) => s + (r.amount || 0), 0)
  const shanIn = records.filter(r => r.given_by === '珊珊').reduce((s, r) => s + (r.amount || 0), 0)

  const byHandler = {}
  expenses.forEach(x => { const h = x.handler || '未知'; byHandler[h] = (byHandler[h] || 0) + (x.amount || 0) })
  const handlerList = Object.entries(byHandler).sort((a, b) => b[1] - a[1])

  const timeline = [
    ...records.map(r => ({ ...r, _type: 'in', _sort: r.created_at || r.date })),
    ...expenses.map(r => ({ ...r, _type: 'out', _sort: r.created_at || r.date })),
  ].sort((a, b) => b._sort > a._sort ? 1 : -1)

  if (loading) return <div>{[1,2,3].map(i => <div key={i} className="loading-shimmer" style={{ height: 60, marginBottom: 8 }} />)}</div>

  return (
    <div>
      {photoModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.9)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setPhotoModal(null)}>
          <div style={{ maxWidth: 500, width: '100%' }} onClick={e => e.stopPropagation()}>
            <img src={photoModal} alt="" style={{ width: '100%', borderRadius: 12, maxHeight: '80vh', objectFit: 'contain' }} />
            <button className="btn-outline" style={{ width: '100%', marginTop: 10 }} onClick={() => setPhotoModal(null)}>關閉</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto' }}>
        {months.map(m => <button key={m} onClick={() => setMonth(m)} style={{ padding: '6px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap', cursor: 'pointer', background: m === month ? 'var(--gold-glow)' : 'transparent', color: m === month ? 'var(--gold)' : 'var(--text-dim)', border: m === month ? '1px solid var(--border-gold)' : '1px solid var(--border)' }}>{parseInt(m.slice(5))}月</button>)}
      </div>

      <div className="card" style={{ padding: 14, marginBottom: 8, borderColor: 'var(--border-gold)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, textAlign: 'center' }}>
          <div><div style={{ fontSize: 9, color: 'var(--text-dim)' }}>共用零用金收入</div><div style={{ fontSize: 20, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--green)' }}>${totalIn.toLocaleString()}</div></div>
          <div><div style={{ fontSize: 9, color: 'var(--text-dim)' }}>全員總支出</div><div style={{ fontSize: 20, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--red)' }}>${totalOut.toLocaleString()}</div></div>
          <div><div style={{ fontSize: 9, color: 'var(--text-dim)' }}>餘額</div><div style={{ fontSize: 20, fontFamily: 'var(--font-mono)', fontWeight: 700, color: balance >= 0 ? 'var(--gold)' : 'var(--red)' }}>${balance.toLocaleString()}</div></div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 14 }}>
        <div className="card" style={{ padding: 8, textAlign: 'center' }}><div style={{ fontSize: 9, color: 'var(--text-dim)' }}>Wilson 給</div><div style={{ fontSize: 16, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--gold)' }}>${wilsonIn.toLocaleString()}</div></div>
        <div className="card" style={{ padding: 8, textAlign: 'center' }}><div style={{ fontSize: 9, color: 'var(--text-dim)' }}>珊珊 給</div><div style={{ fontSize: 16, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--gold)' }}>${shanIn.toLocaleString()}</div></div>
      </div>

      {handlerList.length > 0 && (
        <div className="card" style={{ padding: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}><Users size={14} /> 各員工支出明細</div>
          {handlerList.map(([name, amt]) => {
            const pct = totalOut > 0 ? Math.round(amt / totalOut * 100) : 0
            return (
              <div key={name} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 3 }}>
                  <span style={{ fontWeight: 600 }}>{name}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--red)' }}>${amt.toLocaleString()} <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>({pct}%)</span></span>
                </div>
                <div style={{ height: 6, background: 'var(--black)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: pct + '%', background: 'var(--red)', borderRadius: 3 }} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
        {[['overview','收支時間軸'],['in','撥付紀錄'],['out','支出紀錄']].map(([v,l]) => (
          <button key={v} onClick={() => setTab(v)} style={{ padding: '7px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: tab === v ? 'var(--gold-glow)' : 'transparent', color: tab === v ? 'var(--gold)' : 'var(--text-dim)', border: tab === v ? '1px solid var(--border-gold)' : '1px solid var(--border)' }}>{l}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <div>
          {timeline.length === 0 ? <div className="card" style={{ textAlign: 'center', padding: 30, color: 'var(--text-dim)' }}>本月無紀錄</div> :
            timeline.map((r, i) => r._type === 'in' ? (
              <div key={'i' + i} className="card" style={{ padding: 12, marginBottom: 6, borderColor: 'rgba(77,168,108,.2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div><div style={{ fontSize: 13, fontWeight: 600, color: 'var(--green)' }}>💰 撥付零用金</div><div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{r.date} · {r.given_by} · {r.method} · 經手：{r.received_by || r.employee_name} {r.signature_url && '✍️'}</div></div>
                  <span style={{ fontSize: 18, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--green)' }}>+${r.amount.toLocaleString()}</span>
                </div>
                {r.signature_url && <img src={r.signature_url} alt="" style={{ maxWidth: 160, height: 50, objectFit: 'contain', borderRadius: 6, border: '1px solid var(--border)', background: '#fff', marginTop: 6, cursor: 'pointer' }} onClick={() => setPhotoModal(r.signature_url)} />}
              </div>
            ) : (
              <div key={'o' + i} className="card" style={{ padding: 12, marginBottom: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>🧀 {r.item || r.category}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{r.date} · <strong>{r.handler}</strong> · {r.category} · {r.vendor || ''} · {r.payment}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {r.photo_url && <Image size={14} color="var(--gold)" style={{ cursor: 'pointer' }} onClick={() => setPhotoModal(r.photo_url)} />}
                    <span style={{ fontSize: 16, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--red)' }}>-${(r.amount || 0).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            ))
          }
          {timeline.length > 0 && (
            <div className="card" style={{ padding: 12, marginTop: 8, borderColor: 'var(--border-gold)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--gold)' }}>💰 目前餘額</span>
              <span style={{ fontSize: 22, fontFamily: 'var(--font-mono)', fontWeight: 700, color: balance >= 0 ? 'var(--gold)' : 'var(--red)' }}>${balance.toLocaleString()}</span>
            </div>
          )}
        </div>
      )}

      {tab === 'in' && (
        <div>
          {records.length === 0 ? <div className="card" style={{ textAlign: 'center', padding: 30, color: 'var(--text-dim)' }}>本月無撥付</div> :
            records.map(r => (
              <div key={r.id} className="card" style={{ padding: 12, marginBottom: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <div>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{r.given_by}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>{r.method} · 經手：{r.received_by || r.employee_name}</span>
                  </div>
                  <span style={{ fontSize: 18, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--green)' }}>+${r.amount.toLocaleString()}</span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{r.date} {r.note && ' · ' + r.note}</div>
                {r.signature_url && <img src={r.signature_url} alt="" style={{ maxWidth: 180, height: 55, objectFit: 'contain', borderRadius: 6, border: '1px solid var(--border)', background: '#fff', marginTop: 6, cursor: 'pointer' }} onClick={() => setPhotoModal(r.signature_url)} />}
              </div>
            ))}
        </div>
      )}

      {tab === 'out' && (
        <div>
          {expenses.length === 0 ? <div className="card" style={{ textAlign: 'center', padding: 30, color: 'var(--text-dim)' }}>本月無支出</div> :
            expenses.map(x => (
              <div key={x.id} className="card" style={{ padding: 12, marginBottom: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{x.item || x.category}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{x.date} · <strong style={{ color: 'var(--text)' }}>{x.handler}</strong> · {x.category} · {x.vendor || '無廠商'} · {x.payment}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {x.photo_url && <Image size={14} color="var(--gold)" style={{ cursor: 'pointer' }} onClick={() => setPhotoModal(x.photo_url)} />}
                    <span style={{ fontSize: 16, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--red)' }}>-${(x.amount || 0).toLocaleString()}</span>
                  </div>
                </div>
                {x.note && <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>📝 {x.note}</div>}
              </div>
            ))}
        </div>
      )}
    </div>
  )
}
