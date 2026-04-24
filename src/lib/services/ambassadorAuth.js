// src/lib/services/ambassadorAuth.js
//
// 大使獨立 auth service。UI 層禁止直接呼叫 supabase.rpc。
// MVP：沿用既有 supabase RPC `ambassador_login`（p_code, p_password）
// 未來：可替換為正式 Supabase Auth + RLS，UI 不用改。
//
// Session 存放於 localStorage key: 'ambassador_session'
// 同時向後相容舊 key 'amb_user'（auto-migrate once）
//
// Session shape:
//   { ambassador_id, ambassador_code, name, phone,
//     default_venue_id, role: 'ambassador', login_at, expires_at }

import { supabase } from '../supabase'

const SESSION_KEY = 'ambassador_session'
const LEGACY_KEY = 'amb_user'
const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000 // 12h，外勤手機用

// ============ Public API ============

export async function loginAmbassador(identifier, pin) {
  const id = (identifier || '').trim()
  const p = (pin || '').trim()
  if (!id || !p) return { success: false, error: '請輸入代碼與 PIN' }

  const { data, error } = await supabase.rpc('ambassador_login', {
    p_code: id,
    p_password: p,
  })

  if (error) return { success: false, error: '系統錯誤，稍後再試' }
  if (!data?.success) return { success: false, error: data?.error || '登入失敗' }

  const now = Date.now()
  const session = {
    ambassador_id: data.ambassador_id || data.id,
    ambassador_code: data.ambassador_code || data.code || id,
    name: data.name,
    phone: data.phone || '',
    default_venue_id: data.default_venue_id || null,
    role: 'ambassador',
    login_at: new Date(now).toISOString(),
    expires_at: new Date(now + DEFAULT_TTL_MS).toISOString(),
  }

  writeSession(session)
  return { success: true, session }
}

export function logoutAmbassador() {
  try {
    localStorage.removeItem(SESSION_KEY)
    localStorage.removeItem(LEGACY_KEY) // 清舊 key
  } catch {}
}

export function getAmbassadorSession() {
  // 先讀新 key
  const s = readSession(SESSION_KEY)
  if (s) return s

  // 向後相容：舊 amb_user → 升級成新 session
  const legacy = readSession(LEGACY_KEY)
  if (legacy && legacy.id && legacy.role === 'ambassador') {
    const now = Date.now()
    const migrated = {
      ambassador_id: legacy.id,
      ambassador_code: legacy.code || '',
      name: legacy.name,
      phone: legacy.phone || '',
      default_venue_id: legacy.default_venue_id || null,
      role: 'ambassador',
      login_at: legacy.login_at || new Date(now).toISOString(),
      expires_at: new Date(now + DEFAULT_TTL_MS).toISOString(),
    }
    writeSession(migrated)
    try { localStorage.removeItem(LEGACY_KEY) } catch {}
    return migrated
  }
  return null
}

export function isAmbassadorAuthenticated() {
  return validateAmbassadorSession().valid
}

export function validateAmbassadorSession() {
  const s = getAmbassadorSession()
  if (!s) return { valid: false, reason: 'missing' }
  if (s.role !== 'ambassador') return { valid: false, reason: 'role_mismatch' }
  if (!s.ambassador_id) return { valid: false, reason: 'no_id' }
  const exp = s.expires_at ? Date.parse(s.expires_at) : 0
  if (!exp || exp < Date.now()) {
    logoutAmbassador()
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
