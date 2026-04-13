/**
 * POS 共用工具函數
 * 從 StaffPOS.jsx 抽取，供 PosCheckout + StaffPOS 共用
 */

// ── 付款方式 ──
export const PAY_METHODS = [
  { key: 'cash', label: '現金', icon: '💵', color: '#4da86c' },
  { key: 'card_acpay', label: 'ACPAY刷卡', icon: '💳', color: '#4d8ac4' },
  { key: 'card_teb', label: '臺企銀刷卡', icon: '🏦', color: '#8b6cc4' },
  { key: 'transfer', label: '銀行轉帳', icon: '🔄', color: '#c4a84d' },
  { key: 'wechat', label: '微信支付', icon: '💚', color: '#07c160' },
  { key: 'alipay', label: '支付寶', icon: '🔵', color: '#1677ff' },
]

// ── 桌位 ──
export const TABLES = ['1F四人位', '1F六人位', 'B1包廂四人位', 'B1包廂大圓桌', 'B1沙發區', '戶外區', '外帶']

// ── 快速現金 ──
export const QUICK_CASH = [100, 500, 1000, 2000, 3000, 5000]

// ── 數量預設 ──
export const QTY_PRESETS = [1, 2, 3, 4, 5]

// ── 分類 ──
export const CATEGORIES = [
  { key: 'all', label: '全部' },
  { key: '古巴雪茄', label: '古巴雪茄' },
  { key: 'Capadura', label: 'Capadura' },
  { key: '雪茄配件', label: '雪茄配件' },
  { key: '莊園品茗', label: '莊園品茗' },
  { key: '奶茶咖啡', label: '奶茶咖啡' },
  { key: '氣泡飲品', label: '氣泡飲品' },
  { key: '餐食', label: '餐食' },
  { key: '甜點', label: '甜點' },
  { key: '酒類', label: '酒類' },
]
export const CAT_ORDER = {}
CATEGORIES.forEach((c, i) => { CAT_ORDER[c.key] = i })

// ── 排序選項 ──
export const SORTS = [
  { key: 'menu', label: '菜單順序' },
  { key: 'price_desc', label: '價格高→低' },
  { key: 'price_asc', label: '價格低→高' },
  { key: 'name', label: '名稱' },
]

// ── 會員等級樣式 ──
export const TIER_STYLES = {
  '尊榮會員': { bg: 'rgba(155,89,182,.15)', color: '#9b59b6', border: '#9b59b6', label: '👑 尊榮' },
  '進階會員': { bg: 'rgba(201,168,76,.15)', color: '#c9a84c', border: '#c9a84c', label: '⭐ 進階' },
  '紳士俱樂部': { bg: 'rgba(149,165,166,.15)', color: '#95a5a6', border: '#95a5a6', label: '🎩 紳士' },
  '非會員': { bg: 'transparent', color: '#666', border: '#333', label: '散客' },
}

// ── 庫存狀態 ──
export function deriveStock(cur, safe) {
  return cur <= 0 ? '缺貨' : cur <= (safe || 0) ? '少量' : '現貨'
}

// ── 品項分類 ──
export function classifyItem(n, cat) {
  const l = (n || '').toLowerCase()
  if (cat === '配件' || cat === '營運耗材') return '雪茄配件'
  if (/奶茶|咖啡|拿鐵|espresso|latte|americano/.test(l)) return '奶茶咖啡'
  if (/氣泡|可樂|雪碧|蘋果汁|可爾必思|礦泉水|coke|sprite|zero|蘇打/.test(l)) return '氣泡飲品'
  if (/茶|芭樂|guava/.test(l) && cat === '吧台飲品') return '莊園品茗'
  if (/布朗|蒙布朗|佛卡夏|可頌|甜點|蛋糕/.test(l)) return '甜點'
  if (/滷味|炸物|水餃|雞湯|拼盤|鬆餅|薯條|三明治/.test(l) || cat === '餐飲') return '餐食'
  if (cat === '酒類') return '酒類'
  if (cat === '吧台飲品') return '奶茶咖啡'
  return '餐食'
}

// ── 軟飲判定 ──
export function isSoftDrink(n) {
  return /可樂|雪碧|蘋果汁|礦泉水|可爾必思|zero|coke|sprite/i.test(n || '')
}

// ── 飲品分類 ──
export const DRINK_CATS = new Set(['莊園品茗', '奶茶咖啡', '氣泡飲品'])
export function isDrink(p) { return DRINK_CATS.has(p?._cat) }

// ── 會員折扣計算 ──
export function calcMemberDiscount(tier, items) {
  if (!tier || tier.id === '非會員') return { discount: 0, details: [] }
  let tot = 0
  const d = []
  items.forEach(item => {
    let r = 1
    if (tier.all_items_discount && tier.all_items_discount < 1) r = tier.all_items_discount
    else if (item._cat === 'Capadura' && tier.capadura_discount < 1) r = tier.capadura_discount
    else if (item._cat === '雪茄配件' && tier.accessory_discount < 1) r = tier.accessory_discount
    else if (item._cat === '酒類' && tier.whisky_discount < 1) r = tier.whisky_discount
    else if (tier.free_soft_drink && isSoftDrink(item.name)) r = 0
    if (r < 1) {
      const s = Math.round(item.price * item.qty * (1 - r))
      tot += s
      d.push({ name: item.name, rate: r, saved: s })
    }
  })
  return { discount: tot, details: d }
}

// ── 搜尋評分 ──
export function scoreSearch(products, keyword) {
  const kw = keyword.toLowerCase().trim()
  if (!kw) return products
  const scored = products.map(p => {
    const brand = (p.brand || '').toLowerCase()
    const name = (p.name || '').toLowerCase()
    const spec = (p.spec || '').toLowerCase()
    let score = 0
    if (brand === kw) score = 100
    else if (brand.startsWith(kw)) score = 80
    else if (brand.includes(kw)) score = 60
    else if (name.includes(kw)) score = 40
    else if (spec.includes(kw)) score = 20
    else if ([brand, name, spec, p._cat || ''].join(' ').includes(kw)) score = 10
    return { ...p, _searchScore: score }
  }).filter(p => p._searchScore > 0)
  scored.sort((a, b) => b._searchScore - a._searchScore || (a.name || '').localeCompare(b.name || ''))
  return scored
}

// ── 品牌排序 ──
export function sortProducts(list, sortBy) {
  const normBrand = s => (s || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, '')
  if (sortBy === 'menu') {
    return [...list].sort((a, b) => {
      const catDiff = (CAT_ORDER[a._cat] ?? 99) - (CAT_ORDER[b._cat] ?? 99)
      if (catDiff !== 0) return catDiff
      if (a._cat === '古巴雪茄' || a._cat === 'Capadura') {
        const brandCmp = normBrand(a.brand).localeCompare(normBrand(b.brand))
        if (brandCmp !== 0) return brandCmp
      }
      return (a.name || '').localeCompare(b.name || '')
    })
  }
  if (sortBy === 'price_desc') return [...list].sort((a, b) => b._price - a._price)
  if (sortBy === 'price_asc') return [...list].sort((a, b) => a._price - b._price)
  return [...list].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
}

// ── 今天日期 (台北) ──
export function todayTaipei() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' })
}
