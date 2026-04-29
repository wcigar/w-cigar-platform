// src/lib/services/salesReport.js
// 銷售儀表板 — 撈 venue_sales_daily 區間，本地端 aggregate（含 COGS 毛利 + 補貨 + 運費 + 季對比 + 即時KPI + 外場存貨資產 + 大使人事成本）
import { supabase } from '../supabase'
import { getPayrollByDateRange, getAmbassadorPayrollMap } from './attendance'

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

const PRODUCT_COST = {
  capadura_888_robusto: 135, capadura_898_robusto: 135, capadura_888_torpedo: 135,
  jinxiong: 135,
  trinidad_emerald: 540, d4: 480, monte: 480, monte_no2: 480,
  robusto: 756, siglo6_tube: 786, siglo6_tube_mentor: 786,
  romeo: 480, romeo_wide: 480,
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

// === 補貨建議 ===
export async function getReplenishmentSuggestions() {
  const [invRes, venuesRes] = await Promise.all([
    supabase.from('inventory_balances').select('venue_id, product_key, current_qty, alert_threshold, target_quantity'),
    supabase.from('venues').select('id, name, region'),
  ])
  if (invRes.error) throw invRes.error
  if (venuesRes.error) throw venuesRes.error
  const venues = Object.fromEntries((venuesRes.data || []).map(v => [v.id, v]))
  const items = (invRes.data || []).map(it => {
    const v = venues[it.venue_id] || { id: it.venue_id, name: it.venue_id, region: 'unknown' }
    const cur = Number(it.current_qty) || 0
    const tgt = Number(it.target_quantity) || 0
    const alert = Number(it.alert_threshold) || 0
    const need = Math.max(0, tgt - cur)
    const isLow = cur <= alert
    const isCritical = cur === 0 || (alert > 0 && cur < alert / 2)
    return {
      venue_id: it.venue_id, venue_name: v.name, region: v.region,
      product_key: it.product_key, product_label: PRODUCT_LABEL[it.product_key] || it.product_key,
      category: categorize(it.product_key),
      current_qty: cur, target_quantity: tgt, alert_threshold: alert,
      suggested_qty: need, is_low: isLow, is_critical: isCritical,
      priority: isCritical ? 3 : isLow ? 2 : 1,
    }
  })
  const lowItems = items.filter(x => x.is_low).sort((a,b) => b.priority - a.priority || a.current_qty - b.current_qty)
  return {
    items, lowItems,
    totalItems: items.length,
    lowCount: lowItems.length,
    criticalCount: items.filter(x => x.is_critical).length,
    totalSuggestedQty: lowItems.reduce((s, x) => s + x.suggested_qty, 0),
  }
}

// === 外場存貨資產（所有店家庫存 × 進貨成本）===
export async function getOutstandingInventory() {
  const { data, error } = await supabase
    .from('inventory_balances')
    .select('venue_id, product_key, current_qty, target_quantity')
  if (error) throw error
  let totalQty = 0, totalAsset = 0, totalTargetAsset = 0
  const byProduct = new Map()
  for (const r of (data || [])) {
    const cost = PRODUCT_COST[r.product_key] || 0
    const qty = Number(r.current_qty) || 0
    const tgtQty = Number(r.target_quantity) || 0
    totalQty += qty
    totalAsset += qty * cost
    totalTargetAsset += tgtQty * cost
    const key = r.product_key
    const p = byProduct.get(key) || {
      product_key: key,
      product_label: PRODUCT_LABEL[key] || key,
      category: categorize(key),
      cost_per_unit: cost,
      qty: 0, target_qty: 0, asset: 0,
    }
    p.qty += qty; p.target_qty += tgtQty; p.asset += qty * cost
    byProduct.set(key, p)
  }
  return {
    totalQty, totalAsset, totalTargetAsset,
    byProduct: [...byProduct.values()].sort((a,b) => b.asset - a.asset),
  }
}

// === 出貨運費紀錄 CRUD ===
export async function getShippingLogs(fromDate, toDate) {
  let q = supabase.from('shipping_logs').select('id, ship_date, amount, notes, created_by_name, created_at')
  if (fromDate) q = q.gte('ship_date', fromDate)
  if (toDate) q = q.lte('ship_date', toDate)
  q = q.order('ship_date', { ascending: false })
  const { data, error } = await q
  if (error) throw error
  const total = (data || []).reduce((s, r) => s + Number(r.amount || 0), 0)
  return { logs: data || [], total }
}

export async function addShippingLog({ ship_date, amount, notes, created_by_name }) {
  const { data, error } = await supabase.from('shipping_logs').insert({
    ship_date, amount: Number(amount) || 0, notes: notes || null, created_by_name: created_by_name || null,
  }).select().single()
  if (error) throw error
  return data
}

export async function deleteShippingLog(id) {
  const { error } = await supabase.from('shipping_logs').delete().eq('id', id)
  if (error) throw error
  return true
}

// === 即時當日 KPI ===
export async function getDailyKPI() {
  const today = new Date()
  const yyyy = today.getFullYear()
  const mm = today.getMonth()
  const dd = today.getDate()
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  const todayStr = fmt(today)
  const yesterday = new Date(today); yesterday.setDate(dd - 1)
  const yStr = fmt(yesterday)
  const dow = today.getDay()
  const monday = new Date(today); monday.setDate(dd - ((dow + 6) % 7))
  const monStr = fmt(monday)
  const monthStart = `${yyyy}-${String(mm+1).padStart(2,'0')}-01`

  const { data, error } = await supabase
    .from('venue_sales_daily')
    .select('sale_date, total_amount')
    .gte('sale_date', monthStart)
    .lte('sale_date', todayStr)
  if (error) throw error
  const sum = (rows) => rows.reduce((s, r) => s + Number(r.total_amount || 0), 0)
  const cnt = (rows) => rows.length
  const todayRows = (data || []).filter(r => r.sale_date === todayStr)
  const yRows = (data || []).filter(r => r.sale_date === yStr)
  const weekRows = (data || []).filter(r => r.sale_date >= monStr && r.sale_date <= todayStr)
  const monthRows = data || []
  return {
    today: { revenue: sum(todayRows), count: cnt(todayRows), date: todayStr },
    yesterday: { revenue: sum(yRows), count: cnt(yRows), date: yStr },
    weekToDate: { revenue: sum(weekRows), count: cnt(weekRows), from: monStr, to: todayStr },
    monthToDate: { revenue: sum(monthRows), count: cnt(monthRows), from: monthStart, to: todayStr },
  }
}

// === 季對比 ===
function quarterRange(year, q) {
  const startMonth = (q - 1) * 3
  const start = `${year}-${String(startMonth+1).padStart(2,'0')}-01`
  const endDate = new Date(year, startMonth + 3, 0)
  const end = `${endDate.getFullYear()}-${String(endDate.getMonth()+1).padStart(2,'0')}-${String(endDate.getDate()).padStart(2,'0')}`
  return { start, end, label: `${year} Q${q}` }
}

export async function getQuarterComparison() {
  const today = new Date()
  const y = today.getFullYear()
  const q = Math.floor(today.getMonth() / 3) + 1
  const cur = quarterRange(y, q)
  const py = q === 1 ? y - 1 : y
  const pq = q === 1 ? 4 : q - 1
  const prev = quarterRange(py, pq)
  const fetchQ = async (range) => {
    const { data, error } = await supabase
      .from('venue_sales_daily')
      .select('total_amount, items, ambassador_id, venue_id')
      .gte('sale_date', range.start)
      .lte('sale_date', range.end)
    if (error) throw error
    let revenue = 0, qty = 0, count = (data || []).length, cogs = 0
    const venues = new Set(), ambs = new Set()
    for (const s of (data || [])) {
      revenue += Number(s.total_amount) || 0
      if (s.venue_id) venues.add(s.venue_id)
      if (s.ambassador_id) ambs.add(s.ambassador_id)
      const items = Array.isArray(s.items) ? s.items : []
      for (const it of items) {
        const c = PRODUCT_COST[it.product_key]
        const q2 = Number(it.quantity) || 0
        qty += q2
        if (c != null) cogs += c * q2
      }
    }
    // 套入大使人事成本
    let labor = 0
    try {
      const p = getPayrollByDateRange(range.start, range.end)
      labor = p.totalPayroll || 0
    } catch (e) { /* ignore */ }
    const grossProfit = revenue - cogs
    const netProfit = grossProfit - labor
    return { ...range, revenue, qty, count, cogs, gross_profit: grossProfit, labor_cost: labor, net_profit: netProfit, venues: venues.size, ambassadors: ambs.size }
  }
  const [curStats, prevStats] = await Promise.all([fetchQ(cur), fetchQ(prev)])
  const delta = (a, b) => b > 0 ? ((a - b) / b) : (a > 0 ? 1 : 0)
  return {
    current: curStats, previous: prevStats,
    deltaRevenue: delta(curStats.revenue, prevStats.revenue),
    deltaQty: delta(curStats.qty, prevStats.qty),
    deltaCount: delta(curStats.count, prevStats.count),
    deltaProfit: delta(curStats.gross_profit, prevStats.gross_profit),
    deltaNetProfit: delta(curStats.net_profit, prevStats.net_profit),
    deltaLabor: delta(curStats.labor_cost, prevStats.labor_cost),
  }
}

// === 主報表 ===
export async function getSalesReport(fromDate, toDate) {
  const [salesRes, venuesRes, ambassadorsRes] = await Promise.all([
    supabase.from('venue_sales_daily')
      .select('sale_date, venue_id, ambassador_id, total_amount, items, performance_note')
      .gte('sale_date', fromDate).lte('sale_date', toDate),
    supabase.from('venues').select('id, name, region'),
    supabase.from('ambassadors').select('id, name'),
  ])
  if (salesRes.error) throw salesRes.error
  if (venuesRes.error) throw venuesRes.error
  if (ambassadorsRes.error) throw ambassadorsRes.error

  const venues = Object.fromEntries((venuesRes.data || []).map(v => [v.id, v]))
  const ambassadors = Object.fromEntries((ambassadorsRes.data || []).map(a => [a.id, a]))
  const sales = salesRes.data || []

  const kpi = { revenue: 0, count: sales.length, qty: 0, cogs: 0, qty_unknown_cost: 0, venues: new Set(), ambassadors: new Set() }
  const regionMap = new Map(), venueMap = new Map(), ambMap = new Map(), dateMap = new Map(), productMap = new Map()
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
      if (cost == null) { kpi.qty_unknown_cost += qty; unknownProducts.add(key) }
      else { kpi.cogs += lineCost }
      const p = productMap.get(key) || {
        product_key: key, product_label: PRODUCT_LABEL[key] || key,
        category: categorize(key), cost_per_unit: cost,
        qty: 0, revenue: 0, cnt: 0, cogs: 0,
      }
      p.qty += qty; p.revenue += sub; p.cnt += 1; p.cogs += lineCost
      productMap.set(key, p)
      ven.cogs += lineCost; ven.qty += qty; reg.cogs += lineCost
      if (a && ambMap.has(a.id)) { const am = ambMap.get(a.id); am.qty += qty; am.cogs += lineCost }
    }
  }

  const finalize = (m) => [...m.values()].map(x => ({
    ...x,
    gross_profit: x.revenue - (x.cogs || 0),
    gross_margin: x.revenue > 0 ? ((x.revenue - (x.cogs || 0)) / x.revenue) : 0,
  }))
  const byProductAll = finalize(productMap).sort((a,b) => b.revenue - a.revenue)

  // === 套入大使人事成本，得出真正公司毛利率 ===
  let payroll = { totalPayroll: 0, totalHours: 0, byAmbassador: [], byDate: [], map: {} }
  try {
    payroll = getAmbassadorPayrollMap(fromDate, toDate)
  } catch (e) {
    console.warn('[salesReport] payroll fetch failed:', e)
  }

  // 把大使薪資合進 byAmbassador
  const byAmbassadorWithPayroll = finalize(ambMap).map(a => {
    const pay = payroll.map[a.ambassador_id] || payroll.map[a.ambassador_name] || null
    const labor = pay ? Number(pay.total || 0) : 0
    const hours = pay ? Number(pay.hours || 0) : 0
    const netProfit = a.gross_profit - labor
    const netMargin = a.revenue > 0 ? netProfit / a.revenue : 0
    return { ...a, labor_cost: labor, work_hours: hours, net_profit: netProfit, net_margin: netMargin }
  }).sort((x, y) => y.revenue - x.revenue)

  const grossProfit = kpi.revenue - kpi.cogs
  const totalLabor = payroll.totalPayroll || 0
  const netProfitTotal = grossProfit - totalLabor
  const netMargin = kpi.revenue > 0 ? netProfitTotal / kpi.revenue : 0

  return {
    kpi: {
      revenue: kpi.revenue, count: kpi.count, qty: kpi.qty,
      cogs: kpi.cogs, gross_profit: grossProfit,
      gross_margin: kpi.revenue > 0 ? grossProfit / kpi.revenue : 0,
      // ⬇ 真正公司毛利（扣大使薪資）
      labor_cost: totalLabor,
      labor_hours: payroll.totalHours || 0,
      net_profit: netProfitTotal,
      net_margin: netMargin,
      qty_unknown_cost: kpi.qty_unknown_cost, unknown_products: [...unknownProducts],
      venues: kpi.venues.size, ambassadors: kpi.ambassadors.size,
    },
    payroll: {
      total: totalLabor, hours: payroll.totalHours || 0,
      byAmbassador: payroll.byAmbassador || [],
      byDate: payroll.byDate || [],
    },
    byRegion: finalize(regionMap).sort((a,b) => b.revenue - a.revenue),
    byVenue: finalize(venueMap).sort((a,b) => b.revenue - a.revenue),
    byAmbassador: byAmbassadorWithPayroll,
    byDate: [...dateMap.values()].sort((a,b) => a.sale_date.localeCompare(b.sale_date)),
    byProductAll,
    byProductCapadura: byProductAll.filter(p => p.category === 'capadura'),
    byProductCuban: byProductAll.filter(p => p.category === 'cuban'),
  }
}
