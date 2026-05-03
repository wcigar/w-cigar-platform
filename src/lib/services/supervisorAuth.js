// src/lib/services/supervisorAuth.js
//
// 督導獨立 auth service。UI 層禁止直接呼叫 supabase.rpc。
// MVP：沿用既有 supabase RPC `supervisor_login`(p_code, p_password)
// p_code = login_code (4 位數字), p_password (預設 1234)
//
// Session 存放於 localStorage key: 'WCB_SUPERVISOR'
// （依 Wilson brief 指定 key 名稱；用 localStorage 而非 sessionStorage
//  以支援督導凌晨外勤跨多家店家、避免關 tab 即清空。）
//
// Session shape:
//   { supervisor_id, login_code, name, role: 'supervisor',
//     login_at, expires_at }

import { supabase } from '../supabase'

const SESSION_KEY = 'WCB_SUPERVISOR'
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000 // 24h，5/10 凌晨外勤一晚足夠

// ============ Public API ============

export async function loginSupervisor(code, password) {
  const c = (code || '').trim()
  const p = (password || '').trim()
  if (!c || !p) return { success: false, error: '請輸入工號與密碼' }

  const { data, error } = await supabase.rpc('supervisor_login', {
    p_code: c,
    p_password: p,
  })

  if (error) {
    console.error('[supervisorAuth] RPC error:', error)
    return { success: false, error: '系統錯誤，稍後再試' }
  }
  if (!data?.success) {
    return { success: false, error: data?.error || '工號或密碼錯誤' }
  }

  const now = Date.now()
  const session = {
    supervisor_id: data.id,
    login_code: c,
    name: data.name,
    role: 'supervisor',
    login_at: new Date(now).toISOString(),
    expires_at: new Date(now + DEFAULT_TTL_MS).toISOString(),
  }

  writeSession(session)
  return { success: true, session }
}

export function logoutSupervisor() {
  try { localStorage.removeItem(SESSION_KEY) } catch {}
}

export function getSupervisorSession() {
  return readSession(SESSION_KEY)
}

export function isSupervisorAuthenticated() {
  return validateSupervisorSession().valid
}

export function validateSupervisorSession() {
  const s = getSupervisorSession()
  if (!s) return { valid: false, reason: 'missing' }
  if (s.role !== 'supervisor') return { valid: false, reason: 'role_mismatch' }
  if (!s.supervisor_id) return { valid: false, reason: 'no_id' }
  const exp = s.expires_at ? Date.parse(s.expires_at) : 0
  if (!exp || exp < Date.now()) {
    logoutSupervisor()
    return { valid: false, reason: 'expired' }
  }
  return { valid: true, session: s }
}

// ============ Internal ============

function readSession(key) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const obj = JSON.parse(raw)
    return (obj && typeof obj === 'object') ? obj : null
  } catch { return null }
}

function writeSession(session) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)) } catch {}
}
