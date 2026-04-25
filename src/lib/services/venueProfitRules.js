// src/lib/services/venueProfitRules.js
// 場域抽成規則 service：localStorage MVP（USE_MOCK=true）
// 每家店 1 筆 active 規則 → 月底結算時參照
//
// localStorage key: 'wcigar_venue_profit_rules_v1'
//   結構：{ [venue_id]: { id, venue_id, rule_name, settlement_type, ... } }

import { supabase } from '../supabase'
import { listVenues } from './venues'

const USE_MOCK = true
const STORAGE_KEY = 'wcigar_venue_profit_rules_v1'

// 結算類型：
export const SETTLEMENT_TYPES = {
  consignment:        { label: '寄賣',    desc: '酒店出空間，公司供貨；賣多少抽多少' },
  revenue_share:      { label: '拆帳',    desc: '營業額按比例分公司/酒店' },
  wholesale:          { label: '批發',    desc: '酒店一次性買斷，後續無責' },
  fixed_margin:       { label: '固定毛利', desc: '酒店保留固定毛利%，其餘給公司' },
  monthly_settlement: { label: '月結',    desc: '每月對帳結算，T+30/T+45' },
  custom:             { label: '自訂',    desc: '其他特殊條款（用備註說明）' },
}

export const COMMISSION_BASIS = {
  gross_profit: { label: '公司毛利', desc: '大使抽成基準 = 公司毛利' },
  revenue:      { label: '營業額',   desc: '大使抽成基準 = 該店營業額' },
  net_profit:   { label: '淨利',     desc: '大使抽成基準 = 公司淨利（扣完所有成本）' },
}

export const SETTLEMENT_CYCLES = {
  daily:     { label: '日結' },
  weekly:    { label: '週結' },
  monthly:   { label: '月結' },
  quarterly: { label: '季結' },
}

// ---------- localStorage layer ----------

function readStore() {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') } catch { return {} }
}

function writeStore(map) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(map)) } catch {}
}

// ---------- Public API ----------

/**
 * 列出所有 active 規則（每店 1 筆）
 * 回傳：[{ id, venue_id, venue: {name, region}, rule_name, ... }]
 */
export async function listVenueProfitRules() {
  if (USE_MOCK) {
    const store = readStore()
    const venues = await listVenues()
    return venues
      .filter(v => v.is_active !== false)
      .map(v => {
        const rule = store[v.id]
        return rule
          ? { ...rule, venue: { id: v.id, name: v.name, region: v.region }, has_rule: true }
          : { id: null, venue_id: v.id, venue: { id: v.id, name: v.name, region: v.region }, has_rule: false, rule_name: '尚未設定', settlement_type: null }
      })
  }
  const { data, error } = await supabase
    .from('venue_profit_rules')
    .select('*, venue:venues(id, name, region)')
    .eq('is_active', true)
  if (error) throw error
  return data || []
}

export async function getVenueProfitRule(venueId) {
  if (USE_MOCK) {
    const store = readStore()
    return store[venueId] || null
  }
  const { data, error } = await supabase
    .from('venue_profit_rules')
    .select('*')
    .eq('venue_id', venueId)
    .eq('is_active', true)
    .maybeSingle()
  if (error) throw error
  return data
}

/**
 * 新增 / 更新規則
 * payload: { venue_id, rule_name, settlement_type, venue_share_rate, company_margin_rate,
 *            ambassador_commission_basis, ambassador_commission_rate, settlement_cycle, payment_terms_days, note }
 */
export async function upsertVenueProfitRule(payload, actor) {
  if (!payload.venue_id) return { success: false, error: '請指定 venue_id' }
  if (USE_MOCK) {
    const store = readStore()
    const id = store[payload.venue_id]?.id || `vp_${payload.venue_id}_${Date.now().toString(36).slice(-4)}`
    store[payload.venue_id] = {
      id,
      venue_id: payload.venue_id,
      rule_name: String(payload.rule_name || '').trim() || `${payload.venue_id} ${payload.settlement_type || ''}`,
      settlement_type: payload.settlement_type || 'consignment',
      venue_share_type: payload.venue_share_type || 'percentage',
      venue_share_rate: Number(payload.venue_share_rate) || 0,
      company_margin_rate: Number(payload.company_margin_rate) || 0,
      ambassador_commission_basis: payload.ambassador_commission_basis || 'gross_profit',
      ambassador_commission_rate: Number(payload.ambassador_commission_rate) || 0,
      settlement_cycle: payload.settlement_cycle || 'monthly',
      payment_terms_days: Number(payload.payment_terms_days) || 30,
      note: payload.note || '',
      is_active: true,
      effective_from: payload.effective_from || new Date().toISOString().slice(0, 10),
      updated_at: new Date().toISOString(),
      updated_by_name: actor?.name || null,
    }
    writeStore(store)
    return { success: true, rule_id: id, rule: store[payload.venue_id] }
  }
  const { data, error } = await supabase.rpc('upsert_venue_profit_rule', {
    payload, p_actor_id: actor?.id,
  })
  if (error) throw error
  return data
}

/**
 * 停用某店的規則
 */
export async function deactivateVenueProfitRule(venueId) {
  if (USE_MOCK) {
    const store = readStore()
    if (store[venueId]) {
      store[venueId].is_active = false
      store[venueId].updated_at = new Date().toISOString()
      writeStore(store)
    }
    return { success: true }
  }
  const { data, error } = await supabase
    .from('venue_profit_rules').update({ is_active: false }).eq('venue_id', venueId)
  if (error) throw error
  return data
}

/**
 * 試算工具：給輸入的營業額/成本 → 用此規則算出公司毛利、場域分潤、大使抽成、公司淨利
 */
export function simulateProfit(rule, { revenue = 0, cost = 0 } = {}) {
  const r = Number(revenue) || 0
  const c = Number(cost) || 0
  const grossProfit = r - c
  let venueShare = 0
  switch (rule.settlement_type) {
    case 'consignment':
    case 'revenue_share':
      venueShare = Math.round(r * (Number(rule.venue_share_rate) || 0))
      break
    case 'wholesale':
      venueShare = 0  // 已買斷
      break
    case 'fixed_margin':
      venueShare = Math.max(0, grossProfit - Math.round(r * (Number(rule.company_margin_rate) || 0)))
      break
    case 'monthly_settlement':
      venueShare = Math.round(r * (Number(rule.venue_share_rate) || 0))
      break
    default:
      venueShare = 0
  }
  const companyGross = grossProfit - venueShare
  const basis = rule.ambassador_commission_basis
  const ambBase = basis === 'revenue' ? r
              : basis === 'net_profit' ? companyGross
              : /* gross_profit */ companyGross
  const ambCommission = Math.round(ambBase * (Number(rule.ambassador_commission_rate) || 0))
  const companyNet = companyGross - ambCommission
  return {
    revenue: r, cost: c, gross_profit: grossProfit,
    venue_share: venueShare, company_gross: companyGross,
    ambassador_commission_basis_amount: ambBase,
    ambassador_commission: ambCommission,
    company_net: companyNet,
  }
}

/**
 * 場域利潤總表（read-only，從每店規則 + sales 算出）
 * MVP：先 mock；正式 DB 用 view
 */
export async function getVenueProfitSummary() {
  if (USE_MOCK) {
    const rules = await listVenueProfitRules()
    return rules.filter(r => r.has_rule).map(r => {
      // mock 資料 — 實際應 join sales 算
      const mockRevenue = 100000 + Math.round(Math.random() * 400000)
      const mockCost = Math.round(mockRevenue * 0.4)
      const sim = simulateProfit(r, { revenue: mockRevenue, cost: mockCost })
      return {
        venue_id: r.venue_id, venue_name: r.venue?.name,
        ...sim,
        rule_name: r.rule_name,
      }
    })
  }
  const { data, error } = await supabase.from('venue_profit_summary_view').select('*')
  if (error) throw error
  return data || []
}

export function _clearProfitRulesStore() {
  if (typeof window !== 'undefined') localStorage.removeItem(STORAGE_KEY)
}
