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
    <div style={S.wrapper}>
      <div style={S.bgGradient}/><div style={S.bgVignette}/>
      <div style={S.container} className="fade-in">
        <div style={S.logoSection}>
          <div style={S.logoMark}>W</div>
          <h1 style={S.brandName}>W CIGAR BAR</h1>
          <div style={S.brandSub}>紳士雪茄館 · 營運管理平台</div>
          <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:12,marginTop:16}}>
            <span style={{width:60,height:1,background:'linear-gradient(90deg,transparent,rgba(201,168,76,.3),transparent)',display:'block'}}/>
            <span style={{color:'#c9a84c',fontSize:8,opacity:.6}}>◆</span>
            <span style={{width:60,height:1,background:'linear-gradient(90deg,transparent,rgba(201,168,76,.3),transparent)',display:'block'}}/>
          </div>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:16}}>
          <div style={{display:'flex',flexDirection:'column',gap:6}}>
            <label style={S.label}>選擇身份</label>
            <select style={S.input} value={selectedId} onChange={e => setSelectedId(e.target.value)}>
              <option value="">— 請選擇 —</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.name}（{emp.id}）{emp.is_admin ? ' 👑' : ''}</option>
              ))}
            </select>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:6}}>
            <label style={S.label}>登入碼</label>
            <input style={S.input} type="password" placeholder="••••" value={pin}
              onChange={e => setPin(e.target.value)} onKeyDown={e => e.key==='Enter' && handleLogin()}
              maxLength={6} inputMode="numeric"/>
          </div>
          {error && <div style={{color:'#c44d4d',fontSize:13,textAlign:'center'}}>{error}</div>}
          <button style={{...S.loginBtn, opacity: loading?.7:1}} onClick={handleLogin} disabled={loading}>
            {loading ? '驗證中...' : '登入系統'}
          </button>
        </div>
        <div style={{textAlign:'center',marginTop:40,fontSize:10,color:'#5a554e',letterSpacing:4}}>CAPADURA · 雪茄紳士俱樂部</div>
      </div>
    </div>
  )
}
const S = {
  wrapper:{height:'100vh',width:'100vw',display:'flex',alignItems:'center',justifyContent:'center',position:'relative',overflow:'hidden',background:'#080808'},
  bgGradient:{position:'absolute',inset:0,background:'radial-gradient(ellipse at 50% 30%, rgba(201,168,76,.06) 0%, transparent 60%)'},
  bgVignette:{position:'absolute',inset:0,background:'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,.6) 100%)'},
  container:{position:'relative',zIndex:1,width:'100%',maxWidth:380,padding:'0 24px'},
  logoSection:{textAlign:'center',marginBottom:40},
  logoMark:{fontFamily:'var(--font-display)',fontSize:72,fontWeight:700,color:'#c9a84c',lineHeight:1,marginBottom:8,textShadow:'0 0 40px rgba(201,168,76,.3)'},
  brandName:{fontFamily:'var(--font-display)',fontSize:18,fontWeight:500,color:'#c9a84c',letterSpacing:8,marginBottom:8},
  brandSub:{fontSize:12,color:'#8a8278',letterSpacing:3},
  label:{fontSize:11,color:'#8a8278',letterSpacing:2,fontWeight:500},
  input:{background:'rgba(26,26,26,.8)',border:'1px solid rgba(201,168,76,.15)',borderRadius:10,padding:'14px 16px',fontSize:16,color:'#e8e0d0',outline:'none',fontFamily:'var(--font-body)',width:'100%',WebkitAppearance:'none',appearance:'none'},
  loginBtn:{background:'linear-gradient(135deg, #c9a84c, #8b7a3e)',color:'#0a0a0a',fontWeight:700,padding:16,borderRadius:10,fontSize:15,letterSpacing:2,cursor:'pointer',border:'none',fontFamily:'var(--font-body)',marginTop:8},
}
