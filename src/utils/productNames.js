// src/utils/productNames.js
// 商品 product_key → 中文名 中央 mapping
// 5/3 RICKY 庫存盤點若有新規格，由 Wilson 直接 update venue_pricing；
// 此處新 key 自動 fallback 顯示原 key（getProductCN）
export const PRODUCT_CN_NAMES = {
  // 古巴系列
  romeo: '羅密歐二號鋁管',
  romeo_no3: '羅密歐 3 號',
  romeo_wide: '羅密歐寬邱',
  romeo_wide_churchill: '羅密歐寬邱吉爾',
  robusto: 'Robusto / 羅布圖',
  robusto_siglo6: 'Robusto / Siglo VI',
  d4: '帕特加斯 D4',
  monte: '蒙特',
  monte_no2: '蒙特二號',
  monte_no2_2000: '蒙特二號 ($2000)',
  monte_no2_2200: '蒙特二號 ($2200)',
  monte_no2_2500: '蒙特二號 ($2500)',
  partagas_d4_2000: '帕特加斯 D4 ($2000)',
  partagas_d4_2200: '帕特加斯 D4 ($2200)',
  partagas_d4_2500: '帕特加斯 D4 ($2500)',
  siglo6_tube: 'Siglo VI 鋁管',
  siglo6_tube_mentor: 'Siglo VI 導師版',
  siglo6_robusto: 'Siglo VI Robusto',
  trinidad_emerald: '3T 翡翠',
  trinidad_emerald_2000: '3T 翡翠 ($2000)',
  trinidad_emerald_2200: '3T 翡翠 ($2200)',
  trinidad_3t: 'Trinidad 3T',

  // Capadura 系列
  capadura: 'Capadura 通用',
  capadura_1200: 'Capadura ($1200)',
  capadura_1500: 'Capadura ($1500)',
  capadura_888_robusto: 'Capadura 888 Robusto (短)',
  capadura_898_robusto: 'Capadura 898 Robusto (短)',
  capadura_888_toro: 'Capadura 888 TORO (長)',
  capadura_898_toro: 'Capadura 898 TORO (長)',
  capadura_888_torpedo: 'Capadura 888 Torpedo (魚雷)',
  capadura_898_torpedo: 'Capadura 898 Torpedo (魚雷)',

  // 金熊 6 規格
  jinxiong: '金熊',
  jinxiong_888r: '金熊 888R',
  jinxiong_898r: '金熊 898R',
  jinxiong_888t: '金熊 888T',
  jinxiong_898t: '金熊 898T',
  jinxiong_888tp: '金熊 888Tp',
  jinxiong_898tp: '金熊 898Tp',

  // 其他
  '888_long': '888 長',
}

export function getProductCN(key) {
  return PRODUCT_CN_NAMES[key] || key
}
