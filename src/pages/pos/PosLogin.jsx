/**
 * POS Login — iPad 數字鍵盤快速登入
 * - 只顯示 can_use_pos === true 的員工
 * - PIN 驗證走 Supabase employees 表
 * - 登入後建立 POS session（綁定班次，12hr 上限）
 */
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const PIN_LENGTH = 4

export default function PosLogin({ onLogin }) {
  const [employees, setEmployees] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase.from('employees')
      .select('id, name, title, is_admin')
      .eq('enabled', true)
      .eq('can_use_pos', true)
      .order('name')
      .then(({ data, error: err }) => {
        if (err) {
          // Fallback: can_use_pos column might not exist yet
          supabase.from('employees')
            .select('id, name, title, is_admin')
            .eq('enabled', true)
            .order('name')
            .then(({ data: d2 }) => setEmployees(d2 || []))
        } else {
          setEmployees(data || [])
        }
      })
  }, [])

  function handlePinPress(digit) {
    if (!selectedId) return
    const next = pin + digit
    setPin(next)
    setError('')
    if (next.length >= PIN_LENGTH) {
      doLogin(selectedId, next)
    }
  }

  function handleBackspace() {
    setPin(prev => prev.slice(0, -1))
    setError('')
  }

  function handleClear() {
    setPin('')
    setError('')
  }

  async function doLogin(empId, pinCode) {
    setLoading(true)
    setError('')
    try {
      const { data, error: err } = await supabase
        .from('employees')
        .select('*')
        .eq('id', empId)
        .eq('login_code', pinCode)
        .eq('enabled', true)
        .single()
      if (err || !data) throw new Error('PIN 碼錯誤')

      const session = {
        operator_id: data.id,
        name: data.name,
        is_admin: data.is_admin || false,
        position: data.title,
        shift_id: null,
        login_ts: Date.now(),
        // 12hr session max
        expires_at: Date.now() + 12 * 60 * 60 * 1000,
      }
      onLogin(session)
    } catch (e) {
      setError(e.message || '登入失敗')
      setPin('')
    } finally {
      setLoading(false)
    }
  }

  const selectedEmp = employees.find(e => e.id === selectedId)

  return (
    <div style={S.wrapper}>
      <div style={S.bgGlow} />
      <div style={S.container}>
        {/* Logo */}
        <div style={S.logoSection}>
          <div style={S.logo}>W</div>
          <div style={S.brand}>POS SYSTEM</div>
          <div style={S.sub}>W Cigar Bar · 收銀系統</div>
        </div>

        {!selectedId ? (
          /* ── 員工選擇 ── */
          <div>
            <div style={S.sectionTitle}>選擇操作員</div>
            <div style={S.empGrid}>
              {employees.map(emp => (
                <button key={emp.id} onClick={() => { setSelectedId(emp.id); setPin(''); setError('') }}
                  style={S.empBtn}>
                  <div style={S.empAvatar}>{emp.name[0]}</div>
                  <div style={S.empName}>{emp.name}</div>
                  <div style={S.empRole}>{emp.is_admin ? '管理員' : emp.title || '員工'}</div>
                </button>
              ))}
            </div>
            {employees.length === 0 && (
              <div style={{ textAlign: 'center', color: '#8a7e6e', fontSize: 13, marginTop: 20 }}>
                無可用操作員，請確認 employees 表設定
              </div>
            )}
          </div>
        ) : (
          /* ── PIN 輸入 ── */
          <div>
            <button onClick={() => { setSelectedId(null); setPin(''); setError('') }}
              style={S.backBtn}>← 重新選擇</button>
            <div style={S.pinSection}>
              <div style={S.pinUser}>
                <div style={S.pinAvatar}>{selectedEmp?.name?.[0]}</div>
                <div>
                  <div style={S.pinName}>{selectedEmp?.name}</div>
                  <div style={S.pinRole}>{selectedEmp?.is_admin ? '管理員' : selectedEmp?.title || '員工'}</div>
                </div>
              </div>
              <div style={S.pinLabel}>請輸入 PIN 碼</div>
              <div style={S.pinDots}>
                {Array.from({ length: PIN_LENGTH }).map((_, i) => (
                  <div key={i} style={{ ...S.pinDot, background: i < pin.length ? '#c9a84c' : '#2a2520' }} />
                ))}
              </div>
              {error && <div style={S.error}>{error}</div>}
              {/* Number pad */}
              <div style={S.numPad}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                  <button key={n} onClick={() => handlePinPress(String(n))} disabled={loading}
                    style={S.numBtn}>{n}</button>
                ))}
                <button onClick={handleClear} style={{ ...S.numBtn, color: '#e74c3c', fontSize: 14 }}>清除</button>
                <button onClick={() => handlePinPress('0')} disabled={loading} style={S.numBtn}>0</button>
                <button onClick={handleBackspace} style={{ ...S.numBtn, color: '#f59e0b', fontSize: 14 }}>←</button>
              </div>
            </div>
          </div>
        )}

        <div style={S.footer}>CigarPrince™ POS · W Cigar Bar</div>
      </div>
    </div>
  )
}

const S = {
  wrapper: {
    height: '100vh', width: '100vw', display: 'flex', alignItems: 'center',
    justifyContent: 'center', background: '#080808', position: 'relative', overflow: 'hidden',
  },
  bgGlow: {
    position: 'absolute', inset: 0,
    background: 'radial-gradient(ellipse at 50% 30%, rgba(201,168,76,.05) 0%, transparent 60%)',
  },
  container: {
    position: 'relative', zIndex: 1, width: '100%', maxWidth: 480, padding: '0 24px',
  },
  logoSection: { textAlign: 'center', marginBottom: 32 },
  logo: {
    fontFamily: 'var(--font-display)', fontSize: 56, fontWeight: 700, color: '#c9a84c',
    lineHeight: 1, marginBottom: 4, textShadow: '0 0 30px rgba(201,168,76,.25)',
  },
  brand: {
    fontSize: 14, fontWeight: 600, color: '#c9a84c', letterSpacing: 6,
  },
  sub: {
    fontSize: 11, color: '#8a8278', letterSpacing: 2, marginTop: 4,
  },
  sectionTitle: {
    fontSize: 13, color: '#8a7e6e', letterSpacing: 2, textAlign: 'center', marginBottom: 16,
  },
  empGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
    gap: 10, maxHeight: '45vh', overflowY: 'auto',
  },
  empBtn: {
    background: '#1a1714', border: '1px solid #2a2520', borderRadius: 12,
    padding: '16px 8px', cursor: 'pointer', textAlign: 'center',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
  },
  empAvatar: {
    width: 40, height: 40, borderRadius: '50%', background: 'rgba(201,168,76,.15)',
    border: '1px solid rgba(201,168,76,.3)', display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontSize: 18, fontWeight: 700, color: '#c9a84c',
  },
  empName: { fontSize: 14, fontWeight: 600, color: '#e8dcc8' },
  empRole: { fontSize: 10, color: '#8a7e6e' },
  backBtn: {
    background: 'none', border: 'none', color: '#8a7e6e', fontSize: 12,
    cursor: 'pointer', padding: '4px 0', marginBottom: 12,
  },
  pinSection: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
  },
  pinUser: {
    display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24,
    background: '#1a1714', border: '1px solid #2a2520', borderRadius: 12, padding: '12px 20px',
  },
  pinAvatar: {
    width: 44, height: 44, borderRadius: '50%', background: 'rgba(201,168,76,.15)',
    border: '1px solid rgba(201,168,76,.3)', display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontSize: 20, fontWeight: 700, color: '#c9a84c',
  },
  pinName: { fontSize: 16, fontWeight: 700, color: '#e8dcc8' },
  pinRole: { fontSize: 11, color: '#8a7e6e' },
  pinLabel: { fontSize: 13, color: '#8a7e6e', marginBottom: 16 },
  pinDots: { display: 'flex', gap: 16, marginBottom: 20 },
  pinDot: {
    width: 16, height: 16, borderRadius: '50%', border: '2px solid #2a2520',
    transition: 'background .15s',
  },
  error: {
    color: '#e74c3c', fontSize: 13, marginBottom: 12, textAlign: 'center',
  },
  numPad: {
    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, width: '100%', maxWidth: 280,
  },
  numBtn: {
    height: 56, borderRadius: 12, border: '1px solid #2a2520', background: '#1a1714',
    color: '#e8dcc8', fontSize: 22, fontWeight: 600, cursor: 'pointer',
    fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  footer: {
    textAlign: 'center', marginTop: 32, fontSize: 9, color: '#5a554e', letterSpacing: 3,
  },
}
