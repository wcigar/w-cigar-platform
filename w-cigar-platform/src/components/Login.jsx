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
    supabase
      .from('僱員')
      .select('ID, 姓名')
      .eq('已啟用', true)
      .order('姓名')
      .then(({ data }) => setEmployees(data || []))
  }, [])

  const handleLogin = async () => {
    if (!selectedId || !pin) return
    setLoading(true)
    setError('')
    try {
      await login(selectedId, pin)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.wrapper}>
      <div style={styles.bgNoise} />
      <div style={styles.bgGradient} />
      <div style={styles.bgVignette} />

      <div style={styles.container} className="fade-in">
        <div style={styles.logoSection}>
          <div style={styles.logoMark}>W</div>
          <h1 style={styles.brandName}>W CIGAR BAR</h1>
          <div style={styles.brandSub}>紳士雪茄館 · 營運管理平台</div>
          <div style={styles.divider}>
            <span style={styles.dividerLine} />
            <span style={styles.dividerDiamond}>◆</span>
            <span style={styles.dividerLine} />
          </div>
        </div>

        <div style={styles.form}>
          <div style={styles.inputGroup}>
            <label style={styles.label}>選擇身份</label>
            <select
              style={styles.input}
              value={selectedId}
              onChange={e => setSelectedId(e.target.value)}
            >
              <option value="">— 請選擇 —</option>
              {employees.map(emp => (
                <option key={emp['ID']} value={emp['ID']}>
                  {emp['姓名']}（{emp['ID']}）
                </option>
              ))}
            </select>
          </div>
          <div style={styles.inputGroup}>
            <label style={styles.label}>登入碼</label>
            <input
              style={styles.input}
              type="password"
              placeholder="••••"
              value={pin}
              onChange={e => setPin(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              maxLength={6}
              inputMode="numeric"
            />
          </div>

          {error && <div style={styles.error}>{error}</div>}

          <button
            style={{ ...styles.loginBtn, opacity: loading ? 0.7 : 1 }}
            onClick={handleLogin}
            disabled={loading}
          >
            {loading ? '驗證中...' : '登入系統'}
          </button>
        </div>

        <div style={styles.footer}>
          CAPADURA · 雪茄紳士俱樂部
        </div>
      </div>
    </div>
  )
}

const styles = {
  wrapper: {
    height: '100vh', width: '100vw',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    position: 'relative', overflow: 'hidden', background: '#080808',
  },
  bgNoise: {
    position: 'absolute', inset: 0, opacity: 0.03,
    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
  },
  bgGradient: {
    position: 'absolute', inset: 0,
    background: 'radial-gradient(ellipse at 50% 30%, rgba(201,168,76,0.06) 0%, transparent 60%)',
  },
  bgVignette: {
    position: 'absolute', inset: 0,
    background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.6) 100%)',
  },
  container: { position: 'relative', zIndex: 1, width: '100%', maxWidth: 380, padding: '0 24px' },
  logoSection: { textAlign: 'center', marginBottom: 40 },
  logoMark: {
    fontFamily: 'var(--font-display)', fontSize: 72, fontWeight: 700,
    color: '#c9a84c', lineHeight: 1, marginBottom: 8,
    textShadow: '0 0 40px rgba(201,168,76,0.3)',
  },
  brandName: {
    fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 500,
    color: '#c9a84c', letterSpacing: 8, marginBottom: 8,
  },
  brandSub: { fontSize: 12, color: '#8a8278', letterSpacing: 3, marginBottom: 20 },
  divider: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 },
  dividerLine: { width: 60, height: 1, background: 'linear-gradient(90deg, transparent, rgba(201,168,76,0.3), transparent)', display: 'block' },
  dividerDiamond: { color: '#c9a84c', fontSize: 8, opacity: 0.6 },
  form: { display: 'flex', flexDirection: 'column', gap: 16 },
  inputGroup: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 11, color: '#8a8278', letterSpacing: 2, textTransform: 'uppercase', fontWeight: 500 },
  input: {
    background: 'rgba(26,26,26,0.8)', border: '1px solid rgba(201,168,76,0.15)',
    borderRadius: 10, padding: '14px 16px', fontSize: 16, color: '#e8e0d0',
    outline: 'none', fontFamily: 'var(--font-body)', transition: 'border-color 0.2s', width: '100%',
    WebkitAppearance: 'none', appearance: 'none',
  },
  error: { color: '#c44d4d', fontSize: 13, textAlign: 'center', padding: '8px 0' },
  loginBtn: {
    background: 'linear-gradient(135deg, #c9a84c, #8b7a3e)', color: '#0a0a0a',
    fontWeight: 700, padding: '16px', borderRadius: 10, fontSize: 15,
    letterSpacing: 2, cursor: 'pointer', border: 'none',
    fontFamily: 'var(--font-body)', marginTop: 8, transition: 'all 0.2s',
  },
  footer: { textAlign: 'center', marginTop: 40, fontSize: 10, color: '#5a554e', letterSpacing: 4 },
}
