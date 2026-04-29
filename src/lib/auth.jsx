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
