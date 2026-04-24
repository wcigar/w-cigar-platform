// src/lib/services/venueSales.js
// HQ/Staff 酒店銷售 key-in
// Matrix 模板對齊用戶 Excel「2026雪茄銷量.xlsx」sheet「2026 4月台北」與「2026 4月台中」
// MVP 使用 mock，USE_MOCK=false 前需部署 hq_submit_venue_sales_matrix RPC
import { supabase } from '../supabase'
import { newIdempotencyKey } from './idempotency'

const USE_MOCK = true
const TEMPLATE_VERSION = '2026-04'

// ============================================================
// List / Fetch
// ============================================================

export async function listVenueSales({ date } = {}) {
  if (USE_MOCK) {
    if (date) return mockSales.filter(s => s.sale_date === date)
    return mockSales
  }
  const { data, error } = await supabase
    .from('venue_sales_daily')
    .select('*, venue:venues(name), ambassador:ambassadors(name)')
    .eq('sale_date', date || todayISO())
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function getVenues() {
  if (USE_MOCK) {
    return [...TAIPEI_VENUE_TEMPLATE, ...TAICHUNG_VENUE_TEMPLATE].map(v => ({
      id: v.id, name: v.name, type: 'hotel', region: v.region,
    }))
  }
  const { data, error } = await supabase
    .from('venues').select('id, name, type, supervisor_id, region')
    .eq('is_active', true).order('name')
  if (error) throw error
  return data || []
}

export async function getAmbassadors() {
  if (USE_MOCK) {
    return AMBASSADOR_OPTIONS.map(a => ({
      id: a.id, ambassador_code: a.id.toUpperCase(),
      name: a.displayName, default_venue_id: null,
    }))
  }
  const { data, error } = await supabase
    .from('ambassadors').select('id, ambassador_code, name, default_venue_id')
    .eq('is_active', true).order('name')
  if (error) throw error
  return data || []
}

export async function getProductsForVenueSales() {
  if (USE_MOCK) return mockProducts
  const { data, error } = await supabase
    .from('inventory_master').select('id, name, category, unit_price, cost_price')
    .eq('is_active', true).order('category').order('name')
  if (error) throw error
  return data || []
}

// ============================================================
// 進階明細模式 submit（舊版，單筆逐項）
// ============================================================

export async function submitVenueSales(payload) {
  const withKey = { ...payload, idempotency_key: payload.idempotency_key || newIdempotencyKey() }
  if (USE_MOCK) {
    const saleId = `mock-${Date.now()}`
    const venue = [...TAIPEI_VENUE_TEMPLATE, ...TAICHUNG_VENUE_TEMPLATE].find(v => v.id === withKey.venue_id)
      || mockVenuesSimple.find(v => v.id === withKey.venue_id)
    const amb = AMBASSADOR_OPTIONS.find(a => a.id === withKey.ambassador_id)
    const p = withKey.payment || {}
    mockSales.unshift({
      id: saleId,
      sale_date: withKey.sale_date,
      venue_name: venue?.name || '—',
      ambassador_name: amb?.displayName || '—',
      total_amount: withKey.items.reduce((sum, it) => sum + (it.subtotal || 0), 0),
      cash_amount: p.cash_amount || 0,
      transfer_amount: p.bank_transfer_amount || 0,
      monthly_amount: p.monthly_settlement_amount || 0,
      unpaid_amount: p.unpaid_amount || 0,
      payment_status: p.payment_status || 'paid',
      note: withKey.note || null,
      created_at: new Date().toISOString(),
      source: 'detailed_entry',
    })
    return { success: true, sale_id: saleId, mock: true }
  }
  const { data, error } = await supabase.rpc('hq_submit_venue_sales', {
    payload: withKey, p_idempotency_key: withKey.idempotency_key, p_actor_id: withKey.created_by,
  })
  if (error) throw error
  return data
}

// ============================================================
// 快速矩陣模式
// ============================================================

export const REGIONS = {
  taipei: '台北',
  taichung: '台中',
}

// ---------- 2026-04 台北模板（22 家）----------
const TAIPEI_VENUE_TEMPLATE = [
  { id: 'westin',           name: '威士登',      region: 'taipei',
    products: [
      { key: 'capadura_888_898',  name: 'Capadura 888/898 Robusto', price: 1000, category: 'non_cuban_cigar' },
      { key: 'capadura_toro',     name: 'Capadura TORO',    price: 1000, category: 'non_cuban_cigar' },
      { key: 'capadura_torpedo',  name: 'Capadura Torpedo', price: 1000, category: 'non_cuban_cigar' },
      { key: 'romeo',             name: '羅密歐',            price: 1500, category: 'cuban_cigar' },
      { key: 'mixed_2000',        name: '三T/D4/蒙特/寬丘',  price: 2000, category: 'cuban_cigar' },
      { key: 'robusto',           name: '羅布圖',            price: 2500, category: 'cuban_cigar' },
      { key: 'siglo6_tube',       name: '六號鋁管',          price: 2800, category: 'cuban_cigar' },
    ],
  },
  { id: 'royal',            name: '皇家',        region: 'taipei',
    products: [
      { key: 'capadura_888_898',  name: 'Capadura 888/898 Robusto', price: 1000, category: 'non_cuban_cigar' },
      { key: 'capadura_toro',     name: 'Capadura TORO',    price: 1000, category: 'non_cuban_cigar' },
      { key: 'capadura_torpedo',  name: 'Capadura Torpedo', price: 1000, category: 'non_cuban_cigar' },
      { key: 'romeo',             name: '羅密歐',            price: 1500, category: 'cuban_cigar' },
      { key: 'mixed_2000',        name: '三T/D4/蒙特/寬丘',  price: 2000, category: 'cuban_cigar' },
      { key: 'robusto',           name: '羅布圖',            price: 2500, category: 'cuban_cigar' },
      { key: 'siglo6_tube',       name: '六號鋁管',          price: 2800, category: 'cuban_cigar' },
    ],
  },
  { id: 'hongxin',          name: '鴻欣',        region: 'taipei',
    products: [
      { key: 'capadura_888_898',  name: 'Capadura 888/898 Robusto', price: 1000, category: 'non_cuban_cigar' },
      { key: 'capadura_toro',     name: 'Capadura TORO',    price: 1000, category: 'non_cuban_cigar' },
      { key: 'capadura_torpedo',  name: 'Capadura Torpedo', price: 1000, category: 'non_cuban_cigar' },
      { key: 'romeo',             name: '羅密歐',            price: 1500, category: 'cuban_cigar' },
      { key: 'mixed_2000',        name: '三T/D4/蒙特/寬丘',  price: 2000, category: 'cuban_cigar' },
      { key: 'robusto',           name: '羅布圖',            price: 2500, category: 'cuban_cigar' },
      { key: 'siglo6_tube_mentor',name: '六號鋁管/導師',     price: 2800, category: 'cuban_cigar' },
    ],
  },
  { id: 'focus',            name: 'Focus',       region: 'taipei', note: 'Excel 原表有標示無古巴雪茄',
    products: [
      { key: 'capadura_888_898',  name: 'Capadura 888/898 Robusto', price: 1000, category: 'non_cuban_cigar' },
      { key: 'capadura_toro',     name: 'Capadura TORO',    price: 1000, category: 'non_cuban_cigar' },
      { key: 'capadura_torpedo',  name: 'Capadura Torpedo', price: 1000, category: 'non_cuban_cigar' },
      { key: 'romeo',             name: '羅密歐',            price: 1500, category: 'cuban_cigar' },
      { key: 'mixed_2000',        name: '三T/D4/蒙特/寬丘',  price: 2000, category: 'cuban_cigar' },
      { key: 'robusto',           name: '羅布圖',            price: 2500, category: 'cuban_cigar' },
      { key: 'siglo6_tube',       name: '六號鋁管',          price: 2800, category: 'cuban_cigar' },
    ],
  },
  { id: 'haosheng',         name: '豪昇',        region: 'taipei',
    products: [
      { key: 'capadura_888_898',  name: 'Capadura 888/898 Robusto', price: 1000, category: 'non_cuban_cigar' },
      { key: 'capadura_toro',     name: 'Capadura TORO',    price: 1000, category: 'non_cuban_cigar' },
      { key: 'capadura_torpedo',  name: 'Capadura Torpedo', price: 1000, category: 'non_cuban_cigar' },
      { key: 'romeo',             name: '羅密歐',            price: 1500, category: 'cuban_cigar' },
      { key: 'mixed_2000',        name: '三T/D4/蒙特/寬丘',  price: 2000, category: 'cuban_cigar' },
      { key: 'robusto',           name: '羅布圖',            price: 2500, category: 'cuban_cigar' },
      { key: 'siglo6_tube',       name: '六號鋁管',          price: 2800, category: 'cuban_cigar' },
    ],
  },
  { id: 'weijing',          name: '威晶',        region: 'taipei',
    products: [
      { key: 'capadura_888_898',  name: 'Capadura 888/898 Robusto', price: 1000, category: 'non_cuban_cigar' },
      { key: 'capadura_toro',     name: 'Capadura TORO',    price: 1000, category: 'non_cuban_cigar' },
      { key: 'capadura_torpedo',  name: 'Capadura Torpedo', price: 1000, category: 'non_cuban_cigar' },
      { key: 'romeo',             name: '羅密歐',            price: 1500, category: 'cuban_cigar' },
      { key: 'mixed_2000',        name: '三T/D4/蒙特/寬丘',  price: 2000, category: 'cuban_cigar' },
      { key: 'robusto',           name: '羅布圖',            price: 2500, category: 'cuban_cigar' },
      { key: 'siglo6_tube',       name: '六號鋁管',          price: 2800, category: 'cuban_cigar' },
    ],
  },
  { id: 'haowei',           name: '豪威',        region: 'taipei',
    products: [
      { key: 'capadura_888_898',  name: 'Capadura 888/898 Robusto', price: 1000, category: 'non_cuban_cigar' },
      { key: 'capadura_toro',     name: 'Capadura TORO',    price: 1000, category: 'non_cuban_cigar' },
      { key: 'capadura_torpedo',  name: 'Capadura Torpedo', price: 1000, category: 'non_cuban_cigar' },
      { key: 'romeo',             name: '羅密歐',            price: 1500, category: 'cuban_cigar' },
      { key: 'mixed_2000',        name: '三T/D4/蒙特/寬丘',  price: 2000, category: 'cuban_cigar' },
      { key: 'robusto',           name: '羅布圖',            price: 2500, category: 'cuban_cigar' },
      { key: 'siglo6_tube',       name: '六號鋁管',          price: 2800, category: 'cuban_cigar' },
    ],
  },
  { id: 'ziteng',           name: '紫藤',        region: 'taipei',
    products: [
      { key: 'capadura_888_898',  name: 'Capadura 888/898 Robusto', price: 1000, category: 'non_cuban_cigar' },
      { key: 'capadura_toro',     name: 'Capadura TORO',    price: 1000, category: 'non_cuban_cigar' },
      { key: 'capadura_torpedo',  name: 'Capadura Torpedo', price: 1000, category: 'non_cuban_cigar' },
      { key: 'romeo',             name: '羅密歐',            price: 1500, category: 'cuban_cigar' },
      { key: 'mixed_2000',        name: '三T/D4/蒙特/寬丘',  price: 2000, category: 'cuban_cigar' },
      { key: 'robusto',           name: '羅布圖',            price: 2500, category: 'cuban_cigar' },
      { key: 'siglo6_tube',       name: '六號鋁管',          price: 2800, category: 'cuban_cigar' },
    ],
  },
  { id: 'zongcai',          name: '總裁',        region: 'taipei',
    products: [
      { key: 'capadura',          name: 'capadura',         price: 1100, category: 'non_cuban_cigar' },
      { key: 'romeo',             name: '羅密歐',            price: 1500, category: 'cuban_cigar' },
      { key: 'mixed_2000',        name: '三T/D4/蒙特/寬丘',  price: 2000, category: 'cuban_cigar' },
      { key: 'robusto',           name: '羅布圖',            price: 2500, category: 'cuban_cigar' },
      { key: 'siglo6_tube',       name: '六號鋁管',          price: 2800, category: 'cuban_cigar' },
    ],
  },
  { id: 'zhongguocheng',    name: '中國城',      region: 'taipei',
    products: [
      { key: 'capadura',          name: 'capadura',         price: 1100, category: 'non_cuban_cigar' },
      { key: 'romeo',             name: '羅密歐',            price: 1500, category: 'cuban_cigar' },
      { key: 'mixed_2000',        name: '三T/D4/蒙特/寬丘',  price: 2000, category: 'cuban_cigar' },
      { key: 'robusto',           name: '羅布圖',            price: 2500, category: 'cuban_cigar' },
      { key: 'siglo6_tube',       name: '六號鋁管',          price: 2800, category: 'cuban_cigar' },
    ],
  },
  { id: 'xiangge',          name: '香閣',        region: 'taipei',
    products: [
      { key: 'jinxiong',          name: '金熊',              price: 1000, category: 'non_cuban_cigar' },
      { key: 'romeo',             name: '羅密歐',            price: 1500, category: 'cuban_cigar' },
      { key: 'mixed_2000',        name: '三T/D4/蒙特/寬丘',  price: 2000, category: 'cuban_cigar' },
      { key: 'robusto',           name: '羅布圖',            price: 2500, category: 'cuban_cigar' },
      { key: 'siglo6_tube_mentor',name: '六號鋁管/導師',     price: 2800, category: 'cuban_cigar' },
    ],
  },
  { id: 'baida',            name: '百達',        region: 'taipei',
    products: [
      { key: 'jinxiong',          name: '金熊',              price: 1000, category: 'non_cuban_cigar' },
      { key: 'romeo',             name: '羅密歐',            price: 1500, category: 'cuban_cigar' },
      { key: 'mixed_2000',        name: '三T/D4/蒙特/寬丘',  price: 2000, category: 'cuban_cigar' },
      { key: 'robusto',           name: '羅布圖',            price: 2500, category: 'cuban_cigar' },
      { key: 'siglo6_tube_mentor',name: '六號鋁管/導師',     price: 2800, category: 'cuban_cigar' },
    ],
  },
  { id: 'trans',            name: '特蘭斯',      region: 'taipei',
    products: [
      { key: 'jinxiong',          name: '金熊',              price: 1000, category: 'non_cuban_cigar' },
      { key: 'romeo',             name: '羅密歐',            price: 1500, category: 'cuban_cigar' },
      { key: 'mixed_2000',        name: '三T/D4/蒙特/寬丘',  price: 2000, category: 'cuban_cigar' },
      { key: 'robusto',           name: '羅布圖',            price: 2500, category: 'cuban_cigar' },
      { key: 'siglo6_tube',       name: '六號鋁管',          price: 2800, category: 'cuban_cigar' },
    ],
  },
  { id: 'm_nanmo',          name: 'Ｍ男模',      region: 'taipei',
    products: [
      { key: 'jinxiong',          name: '金熊',              price: 1000, category: 'non_cuban_cigar' },
      { key: 'romeo',             name: '羅密歐',            price: 1500, category: 'cuban_cigar' },
      { key: 'mixed_2000',        name: '三T/D4/蒙特/寬丘',  price: 2000, category: 'cuban_cigar' },
      { key: 'robusto',           name: '羅布圖',            price: 2500, category: 'cuban_cigar' },
      { key: 'siglo6_tube',       name: '六號鋁管',          price: 2800, category: 'cuban_cigar' },
    ],
  },
  { id: 'xiangshui',        name: '香水',        region: 'taipei',
    products: [
      { key: 'jinxiong',          name: '金熊',              price: 1000, category: 'non_cuban_cigar' },
      { key: 'romeo',             name: '羅密歐',            price: 1500, category: 'cuban_cigar' },
      { key: 'mixed_2000',        name: '三T/D4/蒙特/寬丘',  price: 2000, category: 'cuban_cigar' },
      { key: 'robusto',           name: '羅布圖',            price: 2500, category: 'cuban_cigar' },
      { key: 'siglo6_tube_mentor',name: '六號鋁管/導師',     price: 2800, category: 'cuban_cigar' },
    ],
  },
  { id: 'shouxi',           name: '首席',        region: 'taipei',
    products: [
      { key: 'jinxiong',          name: '金熊',              price: 1000, category: 'non_cuban_cigar' },
      { key: 'romeo',             name: '羅密歐',            price: 1500, category: 'cuban_cigar' },
      { key: 'mixed_2000',        name: '三T/D4/蒙特/寬丘',  price: 2000, category: 'cuban_cigar' },
      { key: 'robusto',           name: '羅布圖',            price: 2500, category: 'cuban_cigar' },
      { key: 'siglo6_tube_mentor',name: '六號鋁管/導師',     price: 2800, category: 'cuban_cigar' },
    ],
  },
  { id: 'xin_hao_marriott', name: '新濠(萬豪)',  region: 'taipei',
    products: [
      { key: 'capadura_888_898',  name: 'Capadura 888/898 Robusto', price: 1000, category: 'non_cuban_cigar' },
      { key: 'capadura_toro',     name: 'Capadura TORO',    price: 1000, category: 'non_cuban_cigar' },
      { key: 'capadura_torpedo',  name: 'Capadura Torpedo', price: 1000, category: 'non_cuban_cigar' },
      { key: 'romeo',             name: '羅密歐',            price: 1500, category: 'cuban_cigar' },
      { key: 'mixed_2000',        name: '三T/D4/蒙特/寬丘',  price: 2000, category: 'cuban_cigar' },
      { key: 'robusto',           name: '羅布圖',            price: 2500, category: 'cuban_cigar' },
      { key: 'siglo6_tube',       name: '六號鋁管',          price: 2800, category: 'cuban_cigar' },
    ],
  },
  { id: 'nanmo_502',        name: '502男模',     region: 'taipei',
    products: [
      { key: 'capadura_888_898',  name: 'Capadura 888/898 Robusto', price: 1000, category: 'non_cuban_cigar' },
      { key: 'capadura_toro',     name: 'Capadura TORO',    price: 1000, category: 'non_cuban_cigar' },
      { key: 'capadura_torpedo',  name: 'Capadura Torpedo', price: 1000, category: 'non_cuban_cigar' },
      { key: 'romeo',             name: '羅密歐',            price: 1500, category: 'cuban_cigar' },
      { key: 'mixed_2000',        name: '三T/D4/蒙特/寬丘',  price: 2000, category: 'cuban_cigar' },
      { key: 'robusto',           name: '羅布圖',            price: 2500, category: 'cuban_cigar' },
      { key: 'siglo6_tube',       name: '六號鋁管',          price: 2800, category: 'cuban_cigar' },
    ],
  },
  { id: 'longsheng',        name: '龍昇',        region: 'taipei',
    products: [
      { key: 'capadura_888_898',  name: 'Capadura 888/898 Robusto', price: 1000, category: 'non_cuban_cigar' },
      { key: 'capadura_toro',     name: 'Capadura TORO',    price: 1000, category: 'non_cuban_cigar' },
      { key: 'capadura_torpedo',  name: 'Capadura Torpedo', price: 1000, category: 'non_cuban_cigar' },
      { key: 'romeo',             name: '羅密歐',            price: 1500, category: 'cuban_cigar' },
      { key: 'mixed_2000',        name: '三T/D4/蒙特/寬丘',  price: 2000, category: 'cuban_cigar' },
      { key: 'robusto',           name: '羅布圖',            price: 2500, category: 'cuban_cigar' },
      { key: 'siglo6_tube',       name: '六號鋁管',          price: 2800, category: 'cuban_cigar' },
    ],
  },
  { id: 'flare',            name: 'Flare',       region: 'taipei', note: '特殊價格模板',
    products: [
      { key: 'romeo_no3',         name: '羅密歐3號',         price: 1800, category: 'cuban_cigar' },
      { key: 'romeo_wide_churchill', name: '羅密歐寬丘',    price: 2700, category: 'cuban_cigar' },
      { key: 'd4',                name: 'D4',               price: 2400, category: 'cuban_cigar' },
      { key: 'monte',             name: '蒙特',              price: 2450, category: 'cuban_cigar' },
      { key: 'robusto',           name: '羅布圖',            price: 3500, category: 'cuban_cigar' },
      { key: 'siglo6_tube',       name: '六號鋁管',          price: 2800, category: 'cuban_cigar' },
    ],
  },
  { id: 'jinsha',           name: '金沙',        region: 'taipei', note: '特殊價格模板',
    products: [
      { key: 'capadura_1200',     name: 'capadura',         price: 1200, category: 'non_cuban_cigar' },
      { key: 'capadura_1500',     name: 'capadura',         price: 1500, category: 'non_cuban_cigar' },
      { key: 'romeo',             name: '羅密歐',            price: 1800, category: 'cuban_cigar' },
      { key: 'd4_monte',          name: 'D4/蒙特',           price: 2500, category: 'cuban_cigar' },
      { key: 'trinidad_3t',       name: '3T',               price: 3500, category: 'cuban_cigar' },
      { key: 'robusto',           name: '羅布圖',            price: 3000, category: 'cuban_cigar' },
      { key: 'siglo6_tube',       name: '六號鋁管',          price: 3500, category: 'cuban_cigar' },
    ],
  },
  { id: 'jinnadu',          name: '金拿督',      region: 'taipei', note: '特殊價格模板',
    products: [
      { key: '888_long',          name: '888長',             price: 2500, category: 'cigar' },
      { key: 'robusto',           name: '羅布圖',            price: 3500, category: 'cuban_cigar' },
      { key: 'd4',                name: 'D4',               price: 3500, category: 'cuban_cigar' },
    ],
  },
]

// ---------- 2026-04 台中模板（5 家）----------
// 注意：台中 template 原有 pre_shift_venue_sales 作為 product，但 UI 層會統一處理為獨立 pre-shift 區塊，
// 此處保留定義但 getVenueSalesMatrixTemplate() 會過濾掉 price:null 的 entry。
const TAICHUNG_VENUE_TEMPLATE = [
  { id: 'zijue',    name: '紫爵',    region: 'taichung',
    products: [
      { key: 'capadura_888_898',  name: 'Capadura 888/898 Robusto', price: 1000, category: 'non_cuban_cigar' },
      { key: 'capadura_toro',     name: 'Capadura TORO',    price: 1000, category: 'non_cuban_cigar' },
      { key: 'capadura_torpedo',  name: 'Capadura Torpedo', price: 1000, category: 'non_cuban_cigar' },
      { key: 'mixed_2000',     name: '3T/蒙特 D4',      price: 2000, category: 'cuban_cigar' },
      { key: 'robusto',        name: '羅布圖',          price: 3000, category: 'cuban_cigar' },
      { key: 'robusto_siglo6', name: '羅布圖/六號鋁管', price: 3000, category: 'cuban_cigar' },
    ],
  },
  { id: 'jinlidu',  name: '金麗都',  region: 'taichung',
    products: [
      { key: 'capadura_888_898',  name: 'Capadura 888/898 Robusto', price: 1000, category: 'non_cuban_cigar' },
      { key: 'capadura_toro',     name: 'Capadura TORO',    price: 1000, category: 'non_cuban_cigar' },
      { key: 'capadura_torpedo',  name: 'Capadura Torpedo', price: 1000, category: 'non_cuban_cigar' },
      { key: 'romeo',          name: '羅密歐',          price: 1500, category: 'cuban_cigar' },
      { key: 'mixed_2000',     name: '3T/蒙特 D4',      price: 2000, category: 'cuban_cigar' },
      { key: 'siglo6_robusto', name: '六號鋁管/羅布圖', price: 2500, category: 'cuban_cigar' },
    ],
  },
  { id: 'soak',     name: 'soak',    region: 'taichung',
    products: [
      { key: 'capadura',       name: 'capadura',       price: 1100, category: 'non_cuban_cigar' },
      { key: 'romeo',          name: '羅密歐',          price: 1600, category: 'cuban_cigar' },
      { key: 'mixed_2200',     name: '3T/蒙特 D4',      price: 2200, category: 'cuban_cigar' },
      { key: 'siglo6_robusto', name: '六號鋁管/羅布圖', price: 3000, category: 'cuban_cigar' },
    ],
  },
  { id: 'shenhua',  name: '神話',    region: 'taichung',
    products: [
      { key: 'capadura_888_898',  name: 'Capadura 888/898 Robusto', price: 1000, category: 'non_cuban_cigar' },
      { key: 'capadura_toro',     name: 'Capadura TORO',    price: 1000, category: 'non_cuban_cigar' },
      { key: 'capadura_torpedo',  name: 'Capadura Torpedo', price: 1000, category: 'non_cuban_cigar' },
      { key: 'romeo',          name: '羅密歐',          price: 1600, category: 'cuban_cigar' },
      { key: 'mixed_2200',     name: '3T/蒙特 D4',      price: 2200, category: 'cuban_cigar' },
      { key: 'siglo6_tube',    name: '六號鋁管',        price: 3000, category: 'cuban_cigar' },
    ],
  },
  { id: 'pink',     name: 'pink',    region: 'taichung', settlement_hint: '店家買斷',
    note: 'Excel 第 1 列有店家買斷標記；pink 欄位顯示 1100 CA',
    products: [
      { key: 'capadura_1100_ca', name: 'capadura', price: 1100, category: 'non_cuban_cigar', note: '1100 CA' },
    ],
  },
]

export async function getVenueSalesMatrixTemplate(region = 'taipei') {
  const src = region === 'taichung' ? TAICHUNG_VENUE_TEMPLATE : TAIPEI_VENUE_TEMPLATE
  return {
    region,
    region_name: REGIONS[region] || region,
    template_version: TEMPLATE_VERSION,
    // 所有店家統一支援 pre_shift（台北未來可能需要）
    venues: src.map(v => ({
      ...v,
      // 過濾掉 price=null 的 pre_shift entry（原在 Taichung template 裡）
      products: v.products.filter(p => p.price !== null && p.key !== 'pre_shift_venue_sales'),
      supports_pre_shift: true,
    })),
  }
}

// ============================================================
// 員工 / 大使清單與 normalize
// ============================================================

const AMBASSADOR_OPTIONS = [
  { id: 'xiao_a',    displayName: '小A',    aliases: ['小Ａ', '小A'] },
  { id: 'qianqian',  displayName: '千千',   aliases: ['千千'] },
  { id: 'jie',       displayName: '潔',     aliases: ['潔'] },
  { id: 'ann',       displayName: 'Ann',    aliases: ['Ann', 'ANN'] },
  { id: 'shenshen',  displayName: '深深',   aliases: ['深深'] },
  { id: 'nana',      displayName: 'NaNa',   aliases: ['NaNa', 'Nana'] },
  { id: 'xiaoyun',   displayName: '小雲',   aliases: ['小雲'] },
  { id: 'xiaowei',   displayName: '小薇',   aliases: ['小薇'] },
  { id: 'luby',      displayName: 'Luby',   aliases: ['Luby'] },
  { id: 'sixuan',    displayName: '思萱',   aliases: ['思萱'] },
  { id: 'lili',      displayName: '力力',   aliases: ['力力'] },
  { id: 'boa',       displayName: 'Boa',    aliases: ['Boa'] },
  { id: 'xiaoqiao',  displayName: '小喬',   aliases: ['小喬'] },
  { id: 'beibei',    displayName: '倍倍',   aliases: ['倍倍'] },
  { id: 'naomi',     displayName: 'Naomi',  aliases: ['Naomi'] },
  { id: 'baoer',     displayName: '寶兒',   aliases: ['寶兒'] },
  { id: 'sara',      displayName: 'Sara',   aliases: ['Sara', 'sara'] },
  { id: 'xiaoci',    displayName: '小慈',   aliases: ['小慈'] },
  { id: 'xuanxuan',  displayName: '瑄瑄',   aliases: ['瑄瑄'] },
  { id: 'angela',    displayName: 'Angela', aliases: ['Angela'] },
]

export async function getVenueSalesAmbassadors(region) {
  // MVP: 全部回傳（未來可依地區過濾：台北 vs 台中）
  // region 已接收備用
  void region
  return AMBASSADOR_OPTIONS.map(a => ({
    id: a.id, displayName: a.displayName, aliases: a.aliases,
  }))
}

/**
 * Normalize raw 姓名字串 → {id, displayName, performance_note}
 * 支援「(掛業績)」「（挂）」等標記，把標記拆到 performance_note
 */
export function normalizeAmbassadorName(rawName) {
  if (!rawName) return { id: null, displayName: rawName || '', performance_note: null }
  const raw = String(rawName).trim()

  // 偵測掛業績標記
  const markMatch = raw.match(/[（(][^()（）]*[掛挂][^()（）]*[)）]/)
  const performance_note = markMatch ? '掛業績' : null
  const cleanName = markMatch ? raw.replace(markMatch[0], '').trim() : raw

  // 先嘗試 exact / substring 比對
  for (const a of AMBASSADOR_OPTIONS) {
    for (const alias of a.aliases) {
      if (cleanName === alias || cleanName.includes(alias)) {
        return { id: a.id, displayName: a.displayName, performance_note }
      }
    }
  }
  return { id: null, displayName: cleanName, performance_note }
}

// ============================================================
// Matrix 模式：payload builder + validator
// ============================================================

/**
 * formState 結構（由 UI 提供）：
 * {
 *   saleDate, region, topNote,
 *   template: { venues: [{id, name, products:[{key, name, category, price}]}] },
 *   ambassadors: [{id, displayName}],
 *   venueState: {
 *     [venueId]: {
 *       hasSales: boolean,
 *       ambassadorId: string,
 *       ambassadorRawName?: string,
 *       quantities: { [productKey]: number },
 *       preShiftAmount: number,
 *       preShiftNote: string,
 *       note: string,
 *     }
 *   },
 *   payment: { cash, transfer, monthly, unpaid, paymentStatus },
 *   idempotencyKey: string,
 * }
 */
export function buildVenueSalesMatrixPayload(formState) {
  const { saleDate, region, topNote, template, ambassadors, venueState, payment, idempotencyKey } = formState

  const venuesArr = (template?.venues || []).map(v => {
    const s = venueState[v.id] || {}
    const amb = ambassadors.find(a => a.id === s.ambassadorId)
    const products = []
    let venueTotal = 0, venueQuantity = 0

    for (const p of v.products) {
      const qty = Number(s.quantities?.[p.key]) || 0
      if (qty > 0) {
        const sub = qty * p.price
        products.push({
          product_key: p.key, product_name: p.name,
          category: p.category,
          unit_price: p.price, quantity: qty, subtotal: sub,
        })
        venueTotal += sub
        venueQuantity += qty
      }
    }

    // 上班前店家銷售（所有店都支援，獨立欄位）
    const preShiftAmount = Number(s.preShiftAmount || 0)
    let pre_shift_sales = null
    if (preShiftAmount > 0) {
      pre_shift_sales = {
        amount: preShiftAmount,
        note: s.preShiftNote || null,
        source_type: 'pre_shift_venue_sales',
      }
      venueTotal += preShiftAmount
    }

    // Normalize ambassador
    let ambassador_raw_name = s.ambassadorRawName || null
    let performance_note = null
    if (ambassador_raw_name) {
      const norm = normalizeAmbassadorName(ambassador_raw_name)
      performance_note = norm.performance_note
    }

    const hasSales = !!s.hasSales
    const hasData = products.length > 0 || preShiftAmount > 0

    return {
      venue_id: v.id, venue_name: v.name,
      ambassador_id: s.ambassadorId || null,
      ambassador_name: amb?.displayName || null,
      ambassador_raw_name,
      performance_note,
      has_sales: hasSales && hasData,
      no_sales: !hasSales,
      products,
      pre_shift_sales,
      venue_total: venueTotal,
      venue_quantity: venueQuantity,
      note: s.note || null,
    }
  })

  const total_sales_amount = venuesArr.reduce((t, v) => t + v.venue_total, 0)
  const total_quantity = venuesArr.reduce((t, v) => t + v.venue_quantity, 0)
  const active_venue_count = venuesArr.filter(v => v.has_sales).length
  const no_sales_venue_count = venuesArr.filter(v => v.no_sales).length
  const blank_venue_count = venuesArr.length - active_venue_count - no_sales_venue_count

  return {
    sale_date: saleDate,
    region,
    source_type: 'hotel_excel_matrix',
    template_version: TEMPLATE_VERSION,
    venues: venuesArr,
    payment: {
      cash_amount: Number(payment.cash) || 0,
      bank_transfer_amount: Number(payment.transfer) || 0,
      monthly_settlement_amount: Number(payment.monthly) || 0,
      unpaid_amount: Number(payment.unpaid) || 0,
      payment_status: payment.paymentStatus || 'paid',
    },
    total_sales_amount,
    total_quantity,
    active_venue_count,
    no_sales_venue_count,
    blank_venue_count,
    idempotency_key: idempotencyKey || newIdempotencyKey(),
    note: topNote || null,
  }
}

export function validateVenueSalesMatrix(formState) {
  const errs = []
  const { saleDate, region, template, venueState, payment } = formState

  if (!saleDate) errs.push('銷售日期必填')
  if (!region) errs.push('地區必填')
  if (!template) return errs

  // 至少一家有銷售或上班前銷售
  const venuesActive = template.venues.filter(v => {
    const s = venueState[v.id] || {}
    if (!s.hasSales) return false
    const hasProducts = Object.values(s.quantities || {}).some(q => Number(q) > 0)
    const hasPreShift = Number(s.preShiftAmount || 0) > 0
    return hasProducts || hasPreShift
  })
  if (venuesActive.length === 0) {
    errs.push('至少一家店家要有銷售（請輸入數量或上班前店家銷售金額）')
  }

  // 有銷售的店必須選大使
  for (const v of venuesActive) {
    const s = venueState[v.id]
    if (!s.ambassadorId) errs.push(`${v.name}: 未選大使`)

    // 數量 / 金額不可為負
    Object.entries(s.quantities || {}).forEach(([, q]) => {
      if (Number(q) < 0) errs.push(`${v.name}: 商品數量不可為負`)
    })
    if (Number(s.preShiftAmount || 0) < 0) errs.push(`${v.name}: 上班前銷售金額不可為負`)
  }

  // 收款
  const pt = Number(payment.cash || 0) + Number(payment.transfer || 0) + Number(payment.monthly || 0) + Number(payment.unpaid || 0)
  const total = template.venues.reduce((t, v) => {
    const s = venueState[v.id] || {}
    if (!s.hasSales) return t
    let vt = 0
    for (const p of v.products) vt += (Number(s.quantities?.[p.key]) || 0) * p.price
    vt += Number(s.preShiftAmount || 0)
    return t + vt
  }, 0)

  if (Number(payment.cash) < 0 || Number(payment.transfer) < 0 || Number(payment.monthly) < 0 || Number(payment.unpaid) < 0) {
    errs.push('收款金額不可為負數')
  }
  if (pt > total + 0.01) {
    errs.push(`收款總額 (NT$ ${pt.toLocaleString()}) 不可超過銷售總額 (NT$ ${total.toLocaleString()})`)
  }
  if (total > 0 && pt === 0) {
    errs.push('有銷售但尚未填任何收款方式（現金/匯款/月結/未收請至少填一種）')
  }
  return errs
}

/**
 * Matrix 送出
 */
export async function submitVenueSalesMatrix(payload) {
  const withKey = {
    ...payload,
    idempotency_key: payload.idempotency_key || newIdempotencyKey(),
  }

  if (USE_MOCK) {
    const createdIds = []
    const salesWithData = (withKey.venues || []).filter(v => v.has_sales && v.venue_total > 0)
    const totalSales = withKey.total_sales_amount || 0
    const p = withKey.payment || {}
    const ratio = totalSales > 0 ? {
      cash: (p.cash_amount || 0) / totalSales,
      transfer: (p.bank_transfer_amount || 0) / totalSales,
      monthly: (p.monthly_settlement_amount || 0) / totalSales,
      unpaid: (p.unpaid_amount || 0) / totalSales,
    } : { cash: 0, transfer: 0, monthly: 0, unpaid: 0 }

    for (const v of salesWithData) {
      const id = `mock-mtx-${Date.now()}-${v.venue_id}`
      mockSales.unshift({
        id,
        sale_date: withKey.sale_date,
        venue_name: v.venue_name,
        ambassador_name: v.ambassador_name || '—',
        total_amount: v.venue_total,
        cash_amount: Math.round(v.venue_total * ratio.cash),
        transfer_amount: Math.round(v.venue_total * ratio.transfer),
        monthly_amount: Math.round(v.venue_total * ratio.monthly),
        unpaid_amount: Math.round(v.venue_total * ratio.unpaid),
        payment_status: p.payment_status || 'paid',
        note: v.note || withKey.note || null,
        performance_note: v.performance_note || null,
        created_at: new Date().toISOString(),
        source: 'matrix_entry',
        region: withKey.region,
      })
      createdIds.push(id)
    }
    return { success: true, sales_count: createdIds.length, sale_ids: createdIds, mock: true }
  }

  const { data, error } = await supabase.rpc('hq_submit_venue_sales_matrix', {
    payload: withKey, p_idempotency_key: withKey.idempotency_key,
  })
  if (error) throw error
  return data
}

// ============================================================
// Utils & legacy mock
// ============================================================

export function todayISO() {
  const d = new Date()
  d.setHours(d.getHours() + 8) // Taipei
  return d.toISOString().slice(0, 10)
}

// 舊「進階明細模式」fallback 用的商品
const mockProducts = [
  { id: 'p1',  name: 'Cohiba Siglo VI',  category: 'cuban_cigar',     unit_price: 3000 },
  { id: 'p2',  name: 'Cohiba Robusto',   category: 'cuban_cigar',     unit_price: 2200 },
  { id: 'p3',  name: 'Montecristo No.2', category: 'cuban_cigar',     unit_price: 1500 },
  { id: 'p4',  name: 'Montecristo Edmundo', category: 'cuban_cigar',  unit_price: 1300 },
  { id: 'p5',  name: 'Davidoff Nicaragua', category: 'non_cuban_cigar', unit_price: 1600 },
  { id: 'p6',  name: 'Padron Anniversary', category: 'non_cuban_cigar', unit_price: 1800 },
  { id: 'p7',  name: 'Arturo Fuente OpusX', category: 'non_cuban_cigar', unit_price: 2400 },
  { id: 'p8',  name: '雪松木包',         category: 'accessory',       unit_price: 100 },
  { id: 'p9',  name: 'Cohiba 打火機',    category: 'accessory',       unit_price: 2800 },
  { id: 'p10', name: '保濕包',           category: 'accessory',       unit_price: 120 },
]

const mockVenuesSimple = [] // 保留給其他未來用途

const mockSales = [
  { id: 'm1', sale_date: todayISO(), venue_name: '威士登',   ambassador_name: '小A',   total_amount: 12800, cash_amount: 8000, transfer_amount: 4800, monthly_amount: 0, unpaid_amount: 0, payment_status: 'paid' },
  { id: 'm2', sale_date: todayISO(), venue_name: '文華東方', ambassador_name: '千千',  total_amount: 24500, cash_amount: 0, transfer_amount: 0, monthly_amount: 0, unpaid_amount: 24500, payment_status: 'unpaid' },
]

// ============================================================
// 其他常數
// ============================================================

export const PRODUCT_CATEGORIES = {
  cuban_cigar: '古巴',
  non_cuban_cigar: '非古',
  accessory: '配件',
  drink: '飲品',
  cigar: '雪茄',
  other: '其他',
  manual: '手填',
}

export const PAYMENT_STATUSES = {
  paid: '已收齊',
  partial: '部分收款',
  monthly: '月結',
  unpaid: '未收款',
}

export const SOURCE_TYPES = {
  hotel_manual: '酒店手動',
  venue_visit: '場域實訪',
  phone_order: '電話訂購',
  messenger_order: 'LINE / 通訊軟體',
  other: '其他',
}
