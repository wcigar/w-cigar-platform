// src/pages/ambassador/AmbassadorLogin.jsx
// 雪茄大使獨立登入頁。UI 不直接碰 supabase，呼叫 ambassadorAuth service。
import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { loginAmbassador } from '../../lib/services/ambassadorAuth'

export default function AmbassadorLogin() {
  const navigate = useNavigate()
  const location = useLocation()
  const [identifier, setIdentifier] = useState('')
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin() {
    if (loading) return
    if (!identifier.trim() || !pin.trim()) {
      setError('請輸入代碼/手機與 PIN')
      return
    }
    setLoading(true)
    setError('')
    const res = await loginAmbassador(identifier, pin)
    setLoading(false)
    if (!res.success) {
      setError(res.error || '登入失敗')
      return
    }
    const redirect = location.state?.from && location.state.from.startsWith('/ambassador/')
      ? location.state.from
      : '/ambassador/home'
    navigate(redirect, { replace: true })
  }

  const inputStyle = {
    width: '100%', padding: '14px 16px', background: '#1a1714',
    border: '1px solid #2a2520', borderRadius: 10, color: '#e8dcc8',
    fontSize: 16, boxSizing: 'border-box', outline: 'none',
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 360, textAlign: 'center' }}>
        <div style={{ marginBottom: 40 }}>
          <div style={{ fontSize: 56, fontWeight: 700, color: '#c9a84c', lineHeight: 1, marginBottom: 12 }}>W</div>
          <div style={{ fontSize: 13, color: '#c9a84c', letterSpacing: 6, marginBottom: 8, fontWeight: 500 }}>W CIGAR BAR</div>
          <div style={{ fontSize: 15, color: '#e8e0d0', letterSpacing: 2, marginBottom: 4 }}>雪茄大使系統</div>
          <div style={{ fontSize: 11, color: '#5a554e', letterSpacing: 3 }}>CIGAR AMBASSADOR</div>
        </div>

        <div style={{ fontSize: 12, color: '#8a8278', marginBottom: 18 }}>
          請輸入大使代碼或手機號碼登入
        </div>

        {error && (
          <div style={{ background: 'rgba(231,76,60,0.12)', border: '1px solid rgba(231,76,60,0.35)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#f87171', fontSize: 13 }}>
            {error}
          </div>
        )}

        <div style={{ marginBottom: 12 }}>
          <input
            value={identifier}
            onChange={e => setIdentifier(e.target.value)}
            placeholder="大使代碼 / 手機號碼"
            style={inputStyle}
            autoComplete="username"
          />
        </div>
        <div style={{ marginBottom: 20 }}>
          <input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={e => setPin(e.target.value)}
            placeholder="PIN 碼"
            style={inputStyle}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            autoComplete="current-password"
          />
        </div>
        <button
          onClick={handleLogin}
          disabled={loading}
          style={{
            width: '100%', padding: 14, borderRadius: 10, border: 'none',
            background: 'linear-gradient(135deg, #c9a84c 0%, #8b6d2f 100%)',
            color: '#0a0a0a', fontSize: 16, fontWeight: 700, cursor: 'pointer',
            opacity: loading ? 0.6 : 1, letterSpacing: 2,
          }}
        >
          {loading ? '驗證中...' : '登入系統'}
        </button>

        <div style={{ marginTop: 32, fontSize: 11, color: '#5a554e' }}>
          登入問題請聯絡總部 · W Cigar Bar · 大安區
        </div>
      </div>
    </div>
  )
}
