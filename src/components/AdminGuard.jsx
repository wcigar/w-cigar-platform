// src/components/AdminGuard.jsx
// 非大使路由守衛：/admin/* 、/warehouse/*、/boss/*
// 依角色檢查 user.role 與 user._raw.role_ext
import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'

// scope: 'admin' | 'warehouse' | 'boss' | 'supervisor'
export default function AdminGuard({ scope, children }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/" replace />

  const roleExt = user?._raw?.role
  const isBoss = user.role === 'boss'

  const allowed = (() => {
    if (isBoss) return true
    if (scope === 'admin')      return user.role === 'staff'
    if (scope === 'warehouse')  return roleExt === 'warehouse'
    if (scope === 'supervisor') return roleExt === 'supervisor'
    if (scope === 'boss')       return false // only boss
    return false
  })()

  if (!allowed) return <Navigate to="/" replace />
  return children
}
