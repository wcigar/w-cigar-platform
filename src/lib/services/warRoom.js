// src/lib/services/warRoom.js
// 老闆戰情室（昨日/今日營運總覽）
import { supabase } from '../supabase'

const USE_MOCK = true

export async function getBossWarRoomDaily(date) {
  if (USE_MOCK) return buildMock()
  const { data, error } = await supabase.rpc('get_boss_war_room_daily', { p_date: date || new Date().toISOString().slice(0,10) })
  if (error) throw error
  return data
}

export async function getProductSalesRanking(date) {
  if (USE_MOCK) return buildMock().product_ranking
  const { data, error } = await supabase.rpc('get_product_sales_ranking', { p_date: date })
  if (error) throw error
  return data || []
}

export async function getAmbassadorRanking(date) {
  if (USE_MOCK) return buildMock().ambassador_ranking
  const { data, error } = await supabase.rpc('get_ambassador_ranking', { p_date: date })
  if (error) throw error
  return data || []
}

export async function getVenueRanking(date) {
  if (USE_MOCK) return buildMock().venue_ranking
  const { data, error } = await supabase.rpc('get_venue_sales_ranking', { p_date: date })
  if (error) throw error
  return data || []
}

function buildMock() {
  return {
    summary: {
      total_amount: 128500, total_qty: 42,
      cash: 68000, transfer: 36500, monthly_pending: 24000, unpaid: 0,
      replenishment_completion: 0.92,
      shipment_completion: 0.85,
      receipt_confirmation: 0.78,
      collection_completion: 0.6,
      exception_count: 3,
    },
    venue_ranking: [
      { venue_name: '君悅酒店', amount: 48200, qty: 14 },
      { venue_name: '文華東方', amount: 38000, qty: 11 },
      { venue_name: '寒舍艾美', amount: 24500, qty: 9 },
    ],
    ambassador_ranking: [
      { name: '王大明', amount: 52000, qty: 16 },
      { name: '陳小華', amount: 36500, qty: 12 },
    ],
    product_ranking: [
      { name: 'Cohiba Siglo VI', qty: 8, amount: 24000, category: 'cuban' },
      { name: 'Montecristo No.2', qty: 12, amount: 18000, category: 'cuban' },
      { name: 'Davidoff Nicaragua', qty: 6, amount: 9600, category: 'non_cuban' },
      { name: '保濕包', qty: 20, amount: 2000, category: 'accessory' },
    ],
    category_ranking: [
      { category: 'cuban', amount: 84000 },
      { category: 'non_cuban', amount: 28500 },
      { category: 'accessory', amount: 16000 },
    ],
    supply_stats: {
      pending_review: 3, approved_today: 2, shipped_today: 1, pending_ambassador_receipt: 4,
    },
    high_frequency_supplies: [
      { name: '雪松木', count: 18 }, { name: '瓦斯罐', count: 12 },
    ],
    exceptions: [
      { id: 'e1', category: 'receipt_qty_mismatch', title: '君悅: Cohiba 數量不符', severity: 'warning' },
      { id: 'e2', category: 'collection_short', title: '文華: 短收 NT$4,500', severity: 'critical' },
      { id: 'e3', category: 'high_risk_supply', title: '瓦斯罐異常申請 3 次', severity: 'warning' },
    ],
  }
}
