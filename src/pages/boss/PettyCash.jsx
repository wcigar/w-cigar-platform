import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { Wallet, Send, Pen, Trash2, RotateCcw, History, Users, ChevronDown, ChevronUp } from 'lucide-react'
import { format, subMonths } from 'date-fns'

function SignatureCanvas({ onSave, onCancel }) {
  const canvasRef = useRef(null)
  const [drawing, setDrawing] = useState(false)
  const [hasDrawn, setHasDrawn] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const rect = canvas.parentElement.getBoundingClientRect()
    canvas.width = rect.width
    canvas.height = 200
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#333'
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [])

  function getPos(e) {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const touch = e.touches ? e.touches[0] : e
    return { x: touch.clientX - rect.left, y: touch.clientY - rect.top }
  }

  function startDraw(e) {
    e.preventDefault()
    setDrawing(true)
    setHasDrawn(true)
    const ctx = canvasRef.current.getContext('2d')
    const pos = getPos(e)
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
  }

  function draw(e) {
    if (!drawing) return
    e.preventDefault()
    const ctx = canvasRef.current.getContext('2d')
    const pos = getPos(e)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
  }

  function stopDraw(e) {
    if (e) e.preventDefault()
    setDrawing(false)
  }

  function clear() {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#333'
    ctx.lineWidth = 3
    setHasDrawn(false)
  }

  function save() {
    if (!hasDrawn) return alert('請先簽名')
    const dataUrl = canvasRef.current.toDataURL('image/png')
    onSave(dataUrl)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onCancel}>
      <div style={{ background: 'var(--black-card)', border: '1px solid var(--border-gold)', borderRadius: 20, padding: 20, width: '100%', maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--gold)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Pen size={18} /> 老闆簽名確認
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 12 }}>請在下方白色區域簽名，確認現金已交付</div>
        <div style={{ borderRadius: 12, overflow: 'hidden', border: '2px solid var(--border-gold)', marginBottom: 12, touchAction: 'none' }}>
          <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: 200, cursor: 'crosshair' }}
            onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
            onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-outline" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }} onClick={clear}><RotateCcw size={14} /> 清除</button>
          <button className="btn-outline" style={{ flex: 1 }} onClick={onCancel}>取消</button>
          <button className="btn-gold" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }} onClick={save}><Send size={14} /> 確認簽名</button>
        </div>
      </div>
    </div>
  )
}

export default function PettyCash() {
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'))
  const [emps, setEmps] = useState([])
  const [records, setRecords] = useState([])
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('give')
  const [form, setForm] = useState({ employee_id: '', amount: '', method: '現金', given_by: 'Wilson', note: '' })
  const [showSign, setShowSign] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [expandedEmp, setExpandedEmp] = useState(null)
  const months = Array.from({ length: 6 }, (_, i) => format(subMonths(new Date(), i), 'yyyy-MM'))
  const today = format(new Date(), 'yyyy-MM-dd')

  useEffect(() => { load() }, [month])

  async function load() {
    setLoading(true)
    const s = month + '-01', e = month + '-31'
    const [eR, pR, xR] = await Promise.all([
      supabase.from('employees').select('*').eq('enabled', true).order('name'),
      supabase.from('petty_cash').select('*').gte('date', s).lte('date', e).order('date', { ascending: false }),
      supabase.from('expenses').select('*').gte('date', s).lte('date', e).order('date', { ascending: false }),
    ])
    setEmps((eR.data || []).filter(x => !x.is_admin && x.id !== 'ADMIN'))
    setRecords(pR.data || [])
    setExpenses(xR.data || [])
    setLoading(false)
  }

  function getEmpBalance(empId) {
    const cashIn = records.filter(r => r.employee_id === empId).reduce((s, r) => s + (r.amount || 0), 0)
    const spent = expenses.filter(r => r.submitted_by === empId).reduce((s, r) => s + (r.amount || 0), 0)
    return { cashIn, spent, balance: cashIn - spent }
  }

  async function submitCash(signatureDataUrl) {
    if (!form.employee_id || !form.amount || +form.amount <= 0) return alert('請選擇員工和金額')
    setSubmitting(true)

    let sigUrl = ''
    if (signatureDataUrl && form.method === '現金') {
      const blob = await (await fetch(signatureDataUrl)).blob()
      const path = 'signatures/' + today + '/' + form.employee_id + '_' + Date.now() + '.png'
      const { error } = await supabase.storage.from('photos').upload(path, blob)
      if (!error) { const { data } = supabase.storage.from('photos').getPublicUrl(path); sigUrl = data.publicUrl }
    }

    const emp = emps.find(x => x.id === form.employee_id)
    await supabase.from('petty_cash').insert({
      date: today, employee_id: form.employee_id, employee_name: emp?.name || form.employee_id,
      amount: +form.amount, method: form.method, given_by: form.given_by,
      signature_url: sigUrl, note: form.note
    })

    setSubmitting(false)
    setShowSign(false)
    alert('零用金 $' + (+form.amount).toLocaleString() + ' 已撥付給 ' + (emp?.name || form.employee_id))
    setForm({ employee_id: '', amount: '', method: '現金', given_by: 'Wilson', note: '' })
    load()
  }

  function handleGive() {
    if (!form.employee_id || !form.amount || +form.amount <= 0) return alert('請選擇員工和金額')
    if (form.method === '現金') { setShowSign(true) }
    else { submitCash(null) }
  }

  const totalGiven = records.reduce((s, r) => s + (r.amount || 0), 0)
  const wilsonGiven = records.filter(r => r.given_by === 'Wilson').reduce((s, r) => s + (r.amount || 0), 0)
  const shanGiven = records.filter(r => r.given_by === '珊珊').reduce((s, r) => s + (r.amount || 0), 0)
  const totalSpent = expenses.reduce((s, r) => s + (r.amount || 0), 0)

  if (loading) return <div>{[1,2,3].map(i => <div key={i} className="loading-shimmer" style={{ height: 60, marginBottom: 8 }} />)}</div>

  return (
    <div>
      {showSign && <SignatureCanvas onSave={sig => submitCash(sig)} onCancel={() => setShowSign(false)} />}

      <div style={{ display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto' }}>
        {months.map(m => <button key={m} onClick={() => setMonth(m)} style={{ padding: '6px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap', cursor: 'pointer', background: m === month ? 'var(--gold-glow)' : 'transparent', color: m === month ? 'var(--gold)' : 'var(--text-dim)', border: m === month ? '1px solid var(--border-gold)' : '1px solid var(--border)' }}>{parseInt(m.slice(5))}月</button>)}
      </div>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 6, marginBottom: 6 }}>
        <div className="card" style={{ padding: 10, textAlign: 'center' }}><div style={{ fontSize: 9, color: 'var(--text-dim)' }}>本月撥付</div><div style={{ fontSize: 18, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--gold)' }}>${totalGiven.toLocaleString()}</div></div>
        <div className="card" style={{ padding: 10, textAlign: 'center' }}><div style={{ fontSize: 9, color: 'var(--text-dim)' }}>本月支出</div><div style={{ fontSize: 18, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--red)' }}>${totalSpent.toLocaleString()}</div></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 6, marginBottom: 14 }}>
        <div className="card" style={{ padding: 8, textAlign: 'center' }}><div style={{ fontSize: 9, color: 'var(--text-dim)' }}>Wilson 撥付</div><div style={{ fontSize: 15, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--gold)' }}>${wilsonGiven.toLocaleString()}</div></div>
        <div className="card" style={{ padding: 8, textAlign: 'center' }}><div style={{ fontSize: 9, color: 'var(--text-dim)' }}>珊珊 撥付</div><div style={{ fontSize: 15, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--gold)' }}>${shanGiven.toLocaleString()}</div></div>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
        {[['give','撥付零用金'],['balance','員工餘額'],['history','撥付紀錄']].map(([v,l]) => (
          <button key={v} onClick={() => setTab(v)} style={{ padding: '7px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: tab === v ? 'var(--gold-glow)' : 'transparent', color: tab === v ? 'var(--gold)' : 'var(--text-dim)', border: tab === v ? '1px solid var(--border-gold)' : '1px solid var(--border)' }}>{l}</button>
        ))}
      </div>

      {/* GIVE */}
      {tab === 'give' && (
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gold)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}><Wallet size={16} /> 撥付零用金</div>

          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>員工 *</div>
          <select value={form.employee_id} onChange={e => setForm(p => ({ ...p, employee_id: e.target.value }))} style={{ marginBottom: 10, fontSize: 14, padding: 10 }}>
            <option value="">選擇員工</option>
            {emps.map(e => { const b = getEmpBalance(e.id); return <option key={e.id} value={e.id}>{e.name} （餘額 ${b.balance.toLocaleString()}）</option> })}
          </select>

          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>金額 *</div>
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 20, color: 'var(--gold)', fontWeight: 700 }}>$</span>
            <input type="number" inputMode="numeric" placeholder="金額" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
              style={{ width: '100%', paddingLeft: 34, fontSize: 24, fontFamily: 'var(--font-mono)', fontWeight: 700, padding: '12px 12px 12px 34px' }} />
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>方式</div>
              <div style={{ display: 'flex', gap: 4 }}>
                {['現金', '匯款'].map(m => (
                  <button key={m} onClick={() => setForm(p => ({ ...p, method: m }))} style={{
                    flex: 1, padding: '8px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    background: form.method === m ? (m === '現金' ? 'rgba(201,168,76,.12)' : 'rgba(77,138,196,.12)') : 'transparent',
                    color: form.method === m ? (m === '現金' ? 'var(--gold)' : 'var(--blue)') : 'var(--text-dim)',
                    border: form.method === m ? (m === '現金' ? '1px solid var(--border-gold)' : '1px solid rgba(77,138,196,.3)') : '1px solid var(--border)',
                  }}>{m === '現金' ? '💵 現金' : '🏦 匯款'}</button>
                ))}
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>撥付人</div>
              <div style={{ display: 'flex', gap: 4 }}>
                {['Wilson', '珊珊'].map(g => (
                  <button key={g} onClick={() => setForm(p => ({ ...p, given_by: g }))} style={{
                    flex: 1, padding: '8px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    background: form.given_by === g ? 'var(--gold-glow)' : 'transparent',
                    color: form.given_by === g ? 'var(--gold)' : 'var(--text-dim)',
                    border: form.given_by === g ? '1px solid var(--border-gold)' : '1px solid var(--border)',
                  }}>{g}</button>
                ))}
              </div>
            </div>
          </div>

          {form.method === '現金' && <div style={{ fontSize: 11, color: '#f59e0b', marginBottom: 8, padding: '6px 10px', background: 'rgba(245,158,11,.06)', borderRadius: 8, border: '1px solid rgba(245,158,11,.2)' }}>⚠️ 現金交付需要老闆簽名確認</div>}

          <input placeholder="備註（選填）" value={form.note} onChange={e => setForm(p => ({ ...p, note: e.target.value }))} style={{ marginBottom: 12, fontSize: 13, padding: 10 }} />

          <button className="btn-gold" onClick={handleGive} disabled={submitting} style={{ width: '100%', padding: 14, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: submitting ? .5 : 1 }}>
            <Send size={18} /> {submitting ? '處理中...' : form.method === '現金' ? '簽名並撥付' : '確認匯款撥付'}
          </button>
        </div>
      )}

      {/* BALANCE */}
      {tab === 'balance' && (
        <div>
          {emps.map(emp => {
            const b = getEmpBalance(emp.id)
            const isExp = expandedEmp === emp.id
            const empCash = records.filter(r => r.employee_id === emp.id)
            const empExp = expenses.filter(r => r.submitted_by === emp.id)
            return (
              <div key={emp.id} className="card" style={{ padding: 14, marginBottom: 8, borderColor: b.balance < 0 ? 'rgba(196,77,77,.3)' : undefined }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setExpandedEmp(isExp ? null : emp.id)}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{emp.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>收 ${b.cashIn.toLocaleString()} · 支 ${b.spent.toLocaleString()}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>餘額</div>
                      <div style={{ fontSize: 20, fontFamily: 'var(--font-mono)', fontWeight: 700, color: b.balance >= 0 ? 'var(--green)' : 'var(--red)' }}>${b.balance.toLocaleString()}</div>
                    </div>
                    {isExp ? <ChevronUp size={16} color="var(--text-muted)" /> : <ChevronDown size={16} color="var(--text-muted)" />}
                  </div>
                </div>

                {isExp && (
                  <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                    {empCash.length > 0 && <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)', marginBottom: 4 }}>💰 零用金收入</div>}
                    {empCash.map(r => (
                      <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 11, borderBottom: '1px dotted var(--border)' }}>
                        <span>{r.date} · {r.given_by} · {r.method} {r.signature_url && '✍️'}</span>
                        <span style={{ color: 'var(--green)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>+${r.amount.toLocaleString()}</span>
                      </div>
                    ))}
                    {empExp.length > 0 && <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)', marginTop: 8, marginBottom: 4 }}>🧾 支出明細</div>}
                    {empExp.map(r => (
                      <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 11, borderBottom: '1px dotted var(--border)' }}>
                        <span>{r.date} · {r.category} · {r.item || ''}</span>
                        <span style={{ color: 'var(--red)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>-${(r.amount || 0).toLocaleString()}</span>
                      </div>
                    ))}
                    {empCash.length === 0 && empExp.length === 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', padding: 10 }}>本月無紀錄</div>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* HISTORY */}
      {tab === 'history' && (
        <div>
          {records.length === 0 ? <div className="card" style={{ textAlign: 'center', padding: 30, color: 'var(--text-dim)' }}>本月無撥付紀錄</div> :
            records.map(r => (
              <div key={r.id} className="card" style={{ padding: 12, marginBottom: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <div>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{r.employee_name}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>{r.given_by} · {r.method}</span>
                  </div>
                  <span style={{ fontSize: 18, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--gold)' }}>+${r.amount.toLocaleString()}</span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{r.date} {r.note && ' · ' + r.note}</div>
                {r.signature_url && (
                  <div style={{ marginTop: 6 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 2 }}>✍️ 簽名</div>
                    <img src={r.signature_url} alt="簽名" style={{ maxWidth: 200, height: 60, objectFit: 'contain', borderRadius: 6, border: '1px solid var(--border)', background: '#fff' }} />
                  </div>
                )}
              </div>
            ))}
        </div>
      )}
    </div>
  )
}
