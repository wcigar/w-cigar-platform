// src/lib/services/salesReport.js
// 銷售儀表板 — 撈 venue_sales_daily 區間，本地端 aggregate（含 COGS 毛利計算）
import { supabase } from '../supabase'

const REGION_LABEL = {
  taipei: '台北', taichung: '台中', taoyuan: '桃園',
  kaohsiung: '高雄', tainan: '台南', hsinchu: '新竹',
}

const PRODUCT_LABEL = {
  capadura_888_robusto: 'Capadura 888 Robusto',
  capadura_898_robusto: 'Capadura 898 Robusto',
  capadura_888_torpedo: 'Capadura 888 Torpedo',
  jinxiong: '金熊 (Capadura)',
  romeo: '羅密歐 Romeo',
  romeo_wide: '羅密歐 寬丘',
  d4: 'D4',
  monte: '蒙特',
  monte_no2: '蒙特 No.2',
  robusto: '羅布圖 Robusto',
  siglo6_tube: '六號鋁管 Siglo VI',
  siglo6_tube_mentor: '六號鋁管 / 導師',
  trinidad_emerald: 'Trinidad Emerald (翡翠)',
}

// 進貨成本 (NT$/根)
const PRODUCT_COST = {
  capadura_888_robusto: 135,
  capadura_898_robusto: 135,
  capadura_888_torpedo: 135,
  jinxiong: 135,
  trinidad_emerald: 540,
  d4: 480,
  monte: 480,
  monte_no2: 480,
  robusto: 756,
  siglo6_tube: 786,
  siglo6_tube_mentor: 786,
  romeo: 480,
  romeo_wide: 480,
}

const CAPADURA_EXTRA_KEYS = new Set(['jinxiong'])

function categorize(productKey) {
  if (!productKey) return 'cuban'
  if (/^capadura/i.test(productKey)) return 'capadura'
  if (CAPADURA_EXTRA_KEYS.has(productKey)) return 'capadura'
  return 'cuban'
}

export const getRegionLabel = (key) => REGION_LABEL[key] || key
export const getProductLabel = (key) => PRODUCT_LABEL[key] || key
export const getProductCategory = categorize
export const getProductCost = (key) => PRODUCT_COST[key]
export { PRODUCT_COST, PRODUCT_LABEL }

export async function getSalesReport(fromDate, toDate) {
  const [salesRes, venuesRes, ambassadorsRes] = await Promise.all([
    supabase
      .from('venue_sales_daily')
      .select('sale_date, venue_id, ambassador_id, total_amount, items, performance_note')
      .gte('sale_date', fromDate)
      .lte('sale_date', toDate),
    supabase.from('venues').select('id, name, region'),
    supabase.from('ambassadors').select('id, name'),
  ])

  if (salesRes.error) throw salesRes.error
  if (venuesRes.error) throw venuesRes.error
  if (ambassadorsRes.error) throw ambassadorsRes.error

  const venues = Object.fromEntries((venuesRes.data || []).map(v => [v.id, v]))
  const ambassadors = Object.fromEntries((ambassadorsRes.data || []).map(a => [a.id, a]))
  const sales = salesRes.data || []

  const kpi = {
    revenue: 0, count: sales.length, qty: 0, cogs: 0, qty_unknown_cost: 0,
    venues: new Set(), ambassadors: new Set(),
  }
  const regionMap = new Map()
  const venueMap = new Map()
  const ambMap = new Map()
  const dateMap = new Map()
  const productMap = new Map()
  const unknownProducts = new Set()

  for (const s of sales) {
    const amount = Number(s.total_amount) || 0
    kpi.revenue += amount
    kpi.venues.add(s.venue_id)
    if (s.ambassador_id) kpi.ambassadors.add(s.ambassador_id)

    const v = venues[s.venue_id] || { id: s.venue_id, name: s.venue_id, region: 'unknown' }
    const a = s.ambassador_id ? (ambassadors[s.ambassador_id] || { id: s.ambassador_id, name: s.ambassador_id }) : null

    const reg = regionMap.get(v.region) || { region: v.region, revenue: 0, cnt: 0, cogs: 0 }
    reg.revenue += amount; reg.cnt += 1
    regionMap.set(v.region, reg)

    const ven = venueMap.get(v.id) || { venue_id: v.id, venue_name: v.name, region: v.region, revenue: 0, cnt: 0, cogs: 0, qty: 0 }
    ven.revenue += amount; ven.cnt += 1
    venueMap.set(v.id, ven)

    if (a) {
      const am = ambMap.get(a.id) || { ambassador_id: a.id, ambassador_name: a.name, revenue: 0, cnt: 0, qty: 0, cogs: 0 }
      am.revenue += amount; am.cnt += 1
      ambMap.set(a.id, am)
    }

    const dt = dateMap.get(s.sale_date) || { sale_date: s.sale_date, revenue: 0 }
    dt.revenue += amount
    dateMap.set(s.sale_date, dt)

    const items = Array.isArray(s.items) ? s.items : []
    for (const it of items) {
      const key = it.product_key
      if (!key) continue
      const qty = Number(it.quantity) || 0
      const sub = Number(it.subtotal) || 0
      const cost = PRODUCT_COST[key]
      const lineCost = (cost == null) ? 0 : cost * qty
      kpi.qty += qty
      if (cost == null) {
        kpi.qty_unknown_cost += qty
        unknownProducts.add(key)
      } else {
        kpi.cogs += lineCost
      }

      const p = productMap.get(key) || {
        product_key: key,
        product_label: PRODUCT_LABEL[key] || key,
        category: categorize(key),
        cost_per_unit: cost,
        qty: 0, revenue: 0, cnt: 0, cogs: 0,
      }
      p.qty += qty; p.revenue += sub; p.cnt += 1; p.cogs += lineCost
      productMap.set(key, p)

      ven.cogs += lineCost
      ven.qty += qty
      reg.cogs += lineCost

      if (a && ambMap.has(a.id)) {
        const am = ambMap.get(a.id)
        am.qty += qty
        am.cogs += lineCost
      }
    }
  }

  const finalize = (m) => [...m.values()].map(x => ({
    ...x,
    gross_profit: x.revenue - (x.cogs || 0),
    gross_margin: x.revenue > 0 ? ((x.revenue - (x.cogs || 0)) / x.revenue) : 0,
  }))

  const byProductAll = finalize(productMap).sort((a,b) => b.revenue - a.revenue)

  return {
    kpi: {
      revenue: kpi.revenue,
      count: kpi.count,
      qty: kpi.qty,
      cogs: kpi.cogs,
      gross_profit: kpi.revenue - kpi.cogs,
      gross_margin: kpi.revenue > 0 ? (kpi.revenue - kpi.cogs) / kpi.revenue : 0,
      qty_unknown_cost: kpi.qty_unknown_cost,
      unknown_products: [...unknownProducts],
      venues: kpi.venues.size,
      ambassadors: kpi.ambassadors.size,
    },
    byRegion: finalize(regionMap).sort((a,b) => b.revenue - a.revenue),
    byVenue: finalize(venueMap).sort((a,b) => b.revenue - a.revenue),
    byAmbassador: finalize(ambMap).sort((a,b) => b.revenue - a.revenue),
    byDate: [...dateMap.values()].sort((a,b) => a.sale_date.localeCompare(b.sale_date)),
    byProductAll,
    byProductCapadura: byProductAll.filter(p => p.category === 'capadura'),
    byProductCuban: byProductAll.filter(p => p.category === 'cuban'),
  }
}
