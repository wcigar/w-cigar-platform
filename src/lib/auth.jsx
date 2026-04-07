import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from './supabase'

const AuthContext = createContext(null)
const EXPIRY_DAYS = 30

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const saved = localStorage.getItem('w_cigar_user')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        if (parsed._ts && Date.now() - parsed._ts > EXPIRY_DAYS * 86400000) {
          localStorage.removeItem('w_cigar_user')
        } else {
          setUser(parsed)
        }
      } catch {}
    }
    setLoading(false)
  }, [])

  const login = async (employeeId, pin) => {
    const { data, error } = await supabase.from('employees').select('*')
      .eq('id', employeeId).eq('login_code', pin).eq('enabled', true).single()
    if (error || !data) throw new Error('帳號或密碼錯誤')
    const userData = {
      employee_id: data.id, name: data.name, position: data.title,
      is_active: data.enabled, employee_type: data.emp_type,
      is_admin: data.is_admin, role: data.is_admin ? 'boss' : 'staff',
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
