import { useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function AmbassadorLogin({ onLogin }) {
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin() {
    if (!code.trim() || !password.trim()) return
    setLoading(true)
    setError('')
    const { data, error: err } = await supabase.rpc('ambassador_login', { p_code: code.trim(), p_password: password })
    if (err) { setError('系統錯誤'); setLoading(false); return }
    if (!data?.success) { setError(data?.error || '登入失敗'); setLoading(false); return }
    onLogin(data)
  }

  const inputStyle = { width: '100%', padding: '14px 16px', background: '#1a1714', border: '1px solid #2a2520', borderRadius: 10, color: '#e8dcc8', fontSize: 16, boxSizing: 'border-box', outline: 'none' }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 360, textAlign: 'center' }}>
        <div style={{ marginBottom: 40 }}>
          <div style={{ fontSize: 48, fontWeight: 700, color: '#c9a84c', marginBottom: 8 }}>W</div>
          <div style={{ fontSize: 14, color: '#8a8278', letterSpacing: 3 }}>雪茄大使系統</div>
          <div style={{ fontSize: 11, color: '#5a554e', marginTop: 4 }}>CIGAR AMBASSADOR</div>
        </div>
        {error && <div style={{ background: '#e74c3c22', border: '1px solid #e74c3c44', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#e74c3c', fontSize: 13 }}>{error}</div>}
        <div style={{ marginBottom: 12 }}>
          <input value={code} onChange={e => setCode(e.target.value)} placeholder="大使代碼" style={inputStyle} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="密碼" style={inputStyle} onKeyDown={e => e.key === 'Enter' && handleLogin()} />
        </div>
        <button onClick={handleLogin} disabled={loading} style={{ width: '100%', padding: 14, borderRadius: 10, border: 'none', background: '#c9a84c', color: '#0a0a0a', fontSize: 16, fontWeight: 700, cursor: 'pointer', opacity: loading ? 0.6 : 1 }}>
          {loading ? '登入中...' : '登入系統'}
        </button>
      </div>
    </div>
  )
}
