import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from './supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const saved = localStorage.getItem('w_cigar_user')
    if (saved) {
      try { setUser(JSON.parse(saved)) } catch {}
    }
    setLoading(false)
  }, [])

  const login = async (employeeId, pin) => {
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .eq('ID', employeeId)
      .eq('登入碼', pin)
      .eq('已啟用', true)
      .single()

    if (error || !data) throw new Error('帳號或密碼錯誤')
    const userData = {
      employee_id: data['ID'],
      name: data['姓名'],
      position: data['標題'],
      is_active: data['已啟用'],
      employee_type: data['員工類型'],
      is_admin: data['is_admin'],
      role: data['is_admin'] ? 'boss' : 'staff',
      salary_type: data['薪資類型'],
      salary_amount: data['薪資金額'],
      _raw: data,
    }
    setUser(userData)
    localStorage.setItem('w_cigar_user', JSON.stringify(userData))
    return userData
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem('w_cigar_user')
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
