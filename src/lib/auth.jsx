import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from './supabase'

const AuthContext = createContext(null)
const EXPIRY_DAYS = 30

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem('w_cigar_user')
    if (stored) {
      const parsed = JSON.parse(stored)
      const ts = parsed._ts || 0
      if (Date.now() - ts < EXPIRY_DAYS*24*60*60*1000) {
        setUser(parsed)
        // 背景刷新：從 DB 抓最新 employee 資料更新 user object（emp_type / title / enabled 等可能異動）
        if (parsed.employee_id) {
          supabase.from('employees')
            .select('id, name, title, enabled, emp_type, is_admin')
            .eq('id', parsed.employee_id).maybeSingle()
            .then(({ data }) => {
              if (!data) return
              // 帳號已停用（離職結案/被停權）→ 強制登出，斷掉殘留 session
              if (data.enabled === false) { localStorage.removeItem('w_cigar_user'); setUser(null); return }
              const refreshed = {
                ...parsed,
                name: data.name, position: data.title, is_active: data.enabled,
                employee_type: data.emp_type, is_admin: data.is_admin,
                role: data.is_admin ? 'boss' : 'staff',
                _ts: Date.now()
              }
              const changed = parsed.employee_type !== data.emp_type ||
                              parsed.is_active !== data.enabled ||
                              parsed.position !== data.title
              if (changed) {
                setUser(refreshed)
                localStorage.setItem('w_cigar_user', JSON.stringify(refreshed))
              }
            })
        }
      } else {
        localStorage.removeItem('w_cigar_user')
      }
    }
    setLoading(false)
  }, [])

  const login = async (employeeId, pin) => {
    const { data, error } = await supabase.rpc('staff_login', { p_code: pin })
    if (error) throw new Error(error.message)
    if (!data?.success) throw new Error(data?.error || '帳號或密碼錯誤')
    if (data.id !== employeeId) throw new Error('帳號或密碼錯誤')
    // 發 HR session token（後台 PII/證件存取用；失敗不擋登入）
    let hrToken = null
    try {
      const { data: sess } = await supabase.rpc('staff_session_start', { p_code: pin })
      if (sess?.success) hrToken = sess.token
    } catch (e) { /* 不擋登入 */ }
    const userData = {
      employee_id: data.id, name: data.name, position: data.title,
      is_active: data.enabled, employee_type: data.emp_type,
      is_admin: data.is_admin, role: data.is_admin ? 'boss' : 'staff',
      hr_token: hrToken,
      _raw: data, _ts: Date.now()
    }
    setUser(userData)
    localStorage.setItem('w_cigar_user', JSON.stringify(userData))
    return userData
  }

  const logout = () => { setUser(null); localStorage.removeItem('w_cigar_user') }

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
