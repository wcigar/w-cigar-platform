// src/pages/supervisor/SupervisorLogin.jsx
// 督導獨立登入頁。UI 不直接碰 supabase，呼叫 supervisorAuth service。
// 凌晨外勤手機優先，故大按鈕 + numeric keyboard + 對 4 位督導友善。
import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { loginSupervisor } from '../../lib/services/supervisorAuth'

export default function SupervisorLogin() {
  const navigate = useNavigate()
  const location = useLocation()
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin() {
    if (loading) return
    if (!code.trim() || !password.trim()) {
      setError('請輸入工號與密碼')
      return
    }
    setLoading(true)
    setError('')
    const res = await loginSupervisor(code, password)
    setLoading(false)
    if (!res.success) {
      setError(res.error || '登入失敗')
      return
    }
    const redirect = location.state?.from && location.state.from.startsWith('/supervisor/')
      ? location.state.from
      : '/supervisor/home'
    navigate(redirect, { replace: true })
  }

  const inputStyle = {
    width: '100%', padding: '16px 18px', background: '#1a1714',
    border: '1px solid #2a2520', borderRadius: 10, color: '#e8dcc8',
    fontSize: 17, boxSizing: 'border-box', outline: 'none',
    letterSpacing: 1,
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#0a0a0a', padding: 20,
    }}>
      <div style={{ width: '100%', maxWidth: 380, textAlign: 'center' }}>
        {/* Brand block */}
        <div style={{ marginBottom: 36 }}>
          <div style={{
            fontSize: 60, fontWeight: 700, color: '#c9a84c',
            lineHeight: 1, marginBottom: 14,
            textShadow: '0 0 24px rgba(201,168,76,0.25)',
          }}>W</div>
          <div style={{
            fontSize: 13, color: '#c9a84c', letterSpacing: 6,
            marginBottom: 8, fontWeight: 500,
          }}>W CIGAR BAR</div>
          <div style={{
            fontSize: 16, color: '#e8e0d0', letterSpacing: 3, marginBottom: 4,
            fontWeight: 500,
          }}>督導系統</div>
          <div style={{
            fontSize: 11, color: '#5a554e', letterSpacing: 4,
          }}>CIGAR SUPERVISOR</div>
        </div>

        <div style={{ fontSize: 12, color: '#8a8278', marginBottom: 18, letterSpacing: 1 }}>
          凌晨對帳 · 收款記錄 · 補貨追蹤
        </div>

        {error && (
          <div style={{
            background: 'rgba(231,76,60,0.12)',
            border: '1px solid rgba(231,76,60,0.35)',
            borderRadius: 8, padding: '10px 14px', marginBottom: 16,
            color: '#f87171', fontSize: 13,
          }}>
            {error}
          </div>
        )}

        <div style={{ marginBottom: 12 }}>
          <input
            type="text"
            inputMode="numeric"
            value={code}
            onChange={e => setCode(e.target.value)}
            placeholder="督導工號（例：8001）"
            style={inputStyle}
            autoComplete="username"
          />
        </div>
        <div style={{ marginBottom: 22 }}>
          <input
            type="password"
            inputMode="numeric"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="密碼"
            style={inputStyle}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            autoComplete="current-password"
          />
        </div>
        <button
          onClick={handleLogin}
          disabled={loading}
          style={{
            width: '100%', padding: 16, borderRadius: 10, border: 'none',
            background: 'linear-gradient(135deg, #c9a84c 0%, #8b6d2f 100%)',
            color: '#0a0a0a', fontSize: 17, fontWeight: 700, cursor: 'pointer',
            opacity: loading ? 0.6 : 1, letterSpacing: 3,
            boxShadow: '0 4px 16px rgba(201,168,76,0.25)',
          }}
        >
          {loading ? '驗證中...' : '登入系統'}
        </button>

        <div style={{ marginTop: 28, fontSize: 11, color: '#5a554e', lineHeight: 1.7 }}>
          登入問題請聯絡 Wilson<br />
          W Cigar Bar · 大安區
        </div>
      </div>
    </div>
  )
}
