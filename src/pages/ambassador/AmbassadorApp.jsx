import { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import AmbassadorLogin from './AmbassadorLogin'
import AmbassadorLayout from '../../components/AmbassadorLayout'
import AmbassadorHome from './AmbassadorHome'
import AmbassadorPunch from './AmbassadorPunch'
import AmbassadorSales from './AmbassadorSales'

export default function AmbassadorApp() {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('amb_user')) } catch { return null }
  })

  function handleLogin(data) {
    const u = { id: data.id, name: data.name, role: data.role }
    setUser(u)
    localStorage.setItem('amb_user', JSON.stringify(u))
  }

  function handleLogout() {
    setUser(null)
    localStorage.removeItem('amb_user')
  }

  if (!user) return <AmbassadorLogin onLogin={handleLogin} />

  return (
    <AmbassadorLayout user={user} onLogout={handleLogout}>
      <Routes>
        <Route path="/" element={<AmbassadorHome user={user} />} />
        <Route path="/punch" element={<AmbassadorPunch user={user} />} />
        <Route path="/sales" element={<AmbassadorSales user={user} />} />
        <Route path="*" element={<Navigate to="/ambassador" replace />} />
      </Routes>
    </AmbassadorLayout>
  )
}
