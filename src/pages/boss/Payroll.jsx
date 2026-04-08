import { useState } from 'react'
import PayrollContent from './PayrollContent'
import PayrollExport from './PayrollExport'

const PAYROLL_PIN = '1986'

export default function Payroll() {
  const [locked, setLocked] = useState(true)
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const [view, setView] = useState('main')

  function handleUnlock() {
    if (pin === PAYROLL_PIN) { setLocked(false); setError(false) }
    else { setError(true); setPin('') }
  }

  if (locked) return (
    <div className="page-container fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div className="card" style={{ padding: 32, textAlign: 'center', maxWidth: 320, width: '100%' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--gold)', marginBottom: 6 }}>薪資管理</div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 20 }}>請輸入密碼以存取薪資資料</div>
        <input type="password" inputMode="numeric" maxLength={4} placeholder="請輸入密碼" value={pin} onChange={e => { setPin(e.target.value); setError(false) }} onKeyDown={e => e.key === 'Enter' && handleUnlock()} style={{ width: '100%', textAlign: 'center', fontSize: 24, letterSpacing: 12, fontFamily: 'var(--font-mono)', padding: '12px 8px', marginBottom: 12, borderColor: error ? 'var(--red)' : undefined }} />
        {error && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 10, fontWeight: 600 }}>密碼錯誤</div>}
        <button className="btn-gold" onClick={handleUnlock} style={{ width: '100%', padding: 14, fontSize: 16, fontWeight: 700 }}>解鎖</button>
      </div>
    </div>
  )

  return (
    <div className="page-container fade-in">
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        <button onClick={() => setView('main')} style={{ padding: '8px 16px', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: view === 'main' ? 'var(--gold-glow)' : 'transparent', color: view === 'main' ? 'var(--gold)' : 'var(--text-dim)', border: view === 'main' ? '1px solid var(--border-gold)' : '1px solid var(--border)' }}>薪資計算</button>
        <button onClick={() => setView('export')} style={{ padding: '8px 16px', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: view === 'export' ? 'var(--gold-glow)' : 'transparent', color: view === 'export' ? 'var(--gold)' : 'var(--text-dim)', border: view === 'export' ? '1px solid var(--border-gold)' : '1px solid var(--border)' }}>薪資匯出</button>
      </div>
      {view === 'main' && <PayrollContent />}
      {view === 'export' && <PayrollExport />}
    </div>
  )
}
