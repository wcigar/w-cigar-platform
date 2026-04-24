// src/components/AmbassadorGuard.jsx
// 路由守衛：未登入 → /ambassador/login；登入但 session 無效 → 清 + 重導
import { Navigate, useLocation } from 'react-router-dom'
import { validateAmbassadorSession, logoutAmbassador } from '../lib/services/ambassadorAuth'

export default function AmbassadorGuard({ children, inverse = false }) {
  const location = useLocation()
  const result = validateAmbassadorSession()

  // inverse: 已登入時，/ambassador/login 這類頁面要導走
  if (inverse) {
    if (result.valid) return <Navigate to="/ambassador/home" replace />
    return children
  }

  if (!result.valid) {
    if (result.reason === 'expired') logoutAmbassador()
    return <Navigate to="/ambassador/login" replace state={{ from: location.pathname }} />
  }

  return children
}
