// src/lib/services/salesReport.js
// 銷售儀表板 — 撈 venue_sales_daily 區間，本地端 aggregate
import { supabase } from '../supabase'

const REGION_LABEL = {
  taipei: '台北', taichung: '台中', taoyuan: '桃園',
  kaohsiung: '高雄', tainan: '台南', hsinchu: '新竹',
}

export const getRegionLabel = (key) => REGION_LABEL[key] || key

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
    revenue: 0, count: sales.length,
    venues: new Set(), ambassadors: new Set(),
  }
  const regionMap = new Map()
  const venueMap = new Map()
  const ambMap = new Map()
  const dateMap = new Map()

  for (const s of sales) {
    const amount = Number(s.total_amount) || 0
    kpi.revenue += amount
    kpi.venues.add(s.venue_id)
    if (s.ambassador_id) kpi.ambassadors.add(s.ambassador_id)

    const v = venues[s.venue_id] || { id: s.venue_id, name: s.venue_id, region: 'unknown' }
    const a = s.ambassador_id ? (ambassadors[s.ambassador_id] || { id: s.ambassador_id, name: s.ambassador_id }) : null

    const reg = regionMap.get(v.region) || { region: v.region, revenue: 0, cnt: 0 }
    reg.revenue += amount; reg.cnt += 1
    regionMap.set(v.region, reg)

    const ven = venueMap.get(v.id) || { venue_id: v.id, venue_name: v.name, region: v.region, revenue: 0, cnt: 0 }
    ven.revenue += amount; ven.cnt += 1
    venueMap.set(v.id, ven)

    if (a) {
      const am = ambMap.get(a.id) || { ambassador_id: a.id, ambassador_name: a.name, revenue: 0, cnt: 0 }
      am.revenue += amount; am.cnt += 1
      ambMap.set(a.id, am)
    }

    const dt = dateMap.get(s.sale_date) || { sale_date: s.sale_date, revenue: 0 }
    dt.revenue += amount
    dateMap.set(s.sale_date, dt)
  }

  return {
    kpi: {
      revenue: kpi.revenue,
      count: kpi.count,
      venues: kpi.venues.size,
      ambassadors: kpi.ambassadors.size,
    },
    byRegion: [...regionMap.values()].sort((a,b) => b.revenue - a.revenue),
    byVenue: [...venueMap.values()].sort((a,b) => b.revenue - a.revenue),
    byAmbassador: [...ambMap.values()].sort((a,b) => b.revenue - a.revenue),
    byDate: [...dateMap.values()].sort((a,b) => a.sale_date.localeCompare(b.sale_date)),
  }
}
