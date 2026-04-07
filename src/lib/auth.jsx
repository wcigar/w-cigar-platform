import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from './supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const saved = localStorage.getItem('w_cigar_user')
    if (saved) { try { setUser(JSON.parse(saved)) } catch {} }
    setLoading(false)
  }, [])

  const login = async (employeeId, pin) => {
    const { data, error } = await supabase
      .from('employees').select('*')
      .eq('id', employeeId).eq('login_code', pin).eq('enabled', true).single()
    if (error || !data) throw new Error('帳號或密碼錯誤')
    const u = {
      employee_id: data.id, name: data.name, position: data.title,
      is_admin: data.is_admin, role: data.is_admin ? 'boss' : 'staff',
      emp_type: data.emp_type, _raw: data
    }
    setUser(u)
    localStorage.setItem('w_cigar_user', JSON.stringify(u))
    return u
  }

  const logout = () => { setUser(null); localStorage.removeItem('w_cigar_user') }

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
