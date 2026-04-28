import { useState, useEffect } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

export default function Login() {
  const { login } = useAuth()
  const [employees, setEmployees] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase.from('employees').select('id, name, title, is_admin').eq('enabled', true).order('name')
      .then(({ data }) => setEmployees(data || []))
  }, [])

  const handleLogin = async () => {
    if (!selectedId || !pin) return
    setLoading(true); setError('')
    try { await login(selectedId, pin) } catch (e) { setError(e.message) } finally { setLoading(false) }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 20 }}>
      <div className="wcb-card" style={{ padding: 36, maxWidth: 380, width: '100%' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ width: 120, height: 1, margin: '0 auto 20px', background: 'linear-gradient(90deg,transparent,rgba(196,163,90,.4),transparent)', position: 'relative' }}>
            <span style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', fontSize: 6, color: 'rgba(196,163,90,.5)', background: 'rgba(12,10,8,.96)', padding: '0 8px' }}>◆</span>
          </div>
          <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 48, fontWeight: 300, background: 'linear-gradient(180deg,#f0e8d8 30%,rgba(196,163,90,.7))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: 6 }}>W</div>
          <div style={{ fontFamily: 'Noto Serif TC,serif', fontSize: 11, color: 'rgba(196,163,90,.5)', letterSpacing: 6, marginTop: 8, fontWeight: 300 }}>紳 士 雪 茄 館</div>
          <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 10, fontStyle: 'italic', color: 'rgba(196,163,90,.2)', letterSpacing: 3, marginTop: 12 }}>Employee Portal</div>
        </div>

        {/* 選擇身份 */}
        <div style={{ marginBottom: 16 }}>
          <label className="wcb-label">選擇身份</label>
          <select className="wcb-select" value={selectedId} onChange={e => setSelectedId(e.target.value)}>
            <option value="">— 請選擇 —</option>
            {employees.map(emp => (
              <option key={emp.id} value={emp.id}>{emp.name}（{emp.id}）{emp.is_admin ? ' 👑' : ''}</option>
            ))}
          </select>
        </div>

        {/* 登入碼 */}
        <div style={{ marginBottom: 20 }}>
          <label className="wcb-label">登入碼</label>
          <input
            className="wcb-input"
            type="password"
            placeholder="••••"
            value={pin}
            onChange={e => setPin(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            maxLength={6}
            inputMode="numeric"
            pattern="[0-9]*"
            style={{ letterSpacing: 8, textAlign: 'center', fontFamily: 'JetBrains Mono,monospace', fontSize: 20 }}
          />
        </div>

        {/* 錯誤訊息 */}
        {error && <div style={{ color: 'rgba(190,70,60,.8)', fontSize: 13, textAlign: 'center', marginBottom: 12 }}>{error}</div>}

        {/* 登入按鈕 */}
        <button
          className="wcb-btn-gold"
          style={{ letterSpacing: 4, opacity: loading ? 0.6 : 1 }}
          onClick={handleLogin}
          disabled={loading}
        >
          {loading ? '驗證中...' : '登入系統'}
        </button>

        {/* 底部版權 */}
        <div style={{ fontFamily: 'Cormorant Garamond,serif', fontStyle: 'italic', color: 'rgba(196,163,90,.15)', fontSize: 11, marginTop: 24, textAlign: 'center', letterSpacing: 3 }}>
          W Cigar Bar · Premium Lounge
        </div>
      </div>
    </div>
  )
}
