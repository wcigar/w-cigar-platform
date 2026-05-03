// src/components/SupervisorGuard.jsx
// 督導路由守衛：未登入 → /supervisor/login；登入但 session 無效 → 清 + 重導
import { Navigate, useLocation } from 'react-router-dom'
import { validateSupervisorSession, logoutSupervisor } from '../lib/services/supervisorAuth'

export default function SupervisorGuard({ children, inverse = false }) {
  const location = useLocation()
  const result = validateSupervisorSession()

  // inverse: 已登入時，/supervisor/login 這類頁面要導走
  if (inverse) {
    if (result.valid) return <Navigate to="/supervisor/home" replace />
    return children
  }

  if (!result.valid) {
    if (result.reason === 'expired') logoutSupervisor()
    return <Navigate to="/supervisor/login" replace state={{ from: location.pathname }} />
  }

  return children
}
