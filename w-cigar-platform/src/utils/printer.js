// W Cigar Bar 列印客戶端 SDK
// 透過 Raspberry Pi 橋接伺服器列印
// 設定 Pi IP：POS ADMIN → 🖨️ 印表機設定

const TIMEOUT_MS = 5000

function getPiUrl() {
  const ip = localStorage.getItem('wcb_pi_ip')
    || import.meta.env.VITE_PRINT_SERVER_IP
    || '192.168.1.200'
  return `http://${ip}:3000`
}

async function callPi(endpoint, payload = {}) {
  const ctrl  = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(getPiUrl() + endpoint, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
      signal:  ctrl.signal,
    })
    clearTimeout(timer)
    return await res.json()
  } catch (err) {
    clearTimeout(timer)
    const msg = err.name === 'AbortError'
      ? '列印伺服器連線逾時，請確認 Pi 已開機'
      : `列印伺服器無回應: ${err.message}`
    throw new Error(msg)
  }
}

// ── 健康檢查 ────────────────────────────────────────────
export async function checkPiStatus() {
  try {
    const res = await fetch(getPiUrl() + '/status', {
      signal: AbortSignal.timeout(3000)
    })
    return await res.json()
  } catch {
    return null
  }
}

// ── 列印收據 + 自動開收銀抽屜 ───────────────────────────
export async function printReceipt(order, cart, customer, session) {
  try {
    return await callPi('/print/receipt', {
      order,
      cart,
      customer,
      cashierName: session?.name || '',
    })
  } catch (err) {
    console.warn('[Receipt] Pi失敗，fallback瀏覽器列印:', err.message)
    window.print()
    return { success: true, fallback: true }
  }
}

// ── 廚房/酒吧打單 ────────────────────────────────────────
export async function printKitchenOrder(order, cart, tableNo) {
  try {
    return await callPi('/print/kitchen', { order, cart, tableNo })
  } catch (err) {
    console.warn('[Kitchen]', err.message)
    return { success: false, error: err.message }
  }
}

// ── 商品條碼標籤 ─────────────────────────────────────────
export async function printBarcodeLabel(item) {
  try {
    return await callPi('/print/barcode', { item })
  } catch (err) {
    console.warn('[Barcode] Pi失敗，fallback瀏覽器:', err.message)
    return _barcodeBrowser(item)
  }
}

// ── VIP 窖位標籤 ─────────────────────────────────────────
export async function printVipLabel(item, customer, orderNo = '') {
  try {
    return await callPi('/print/vip', { item, customer, orderNo })
  } catch (err) {
    console.warn('[VIP Label] Pi失敗，fallback瀏覽器:', err.message)
    return _vipBrowser(item, customer, orderNo)
  }
}

// ── 單獨開收銀抽屜 ───────────────────────────────────────
export async function openCashDrawer() {
  try {
    return await callPi('/open-drawer')
  } catch (err) {
    return { success: false, error: err.message }
  }
}

// ── 儲存 / 讀取設定 ──────────────────────────────────────
export function savePrinterConfig(piIp) {
  if (piIp) localStorage.setItem('wcb_pi_ip', piIp.trim())
}

export function getPrinterConfig() {
  return {
    piIp: localStorage.getItem('wcb_pi_ip') || '',
  }
}

// ── Browser Fallback：條碼標籤 ───────────────────────────
function _barcodeBrowser(item) {
  const code  = (item.id || item.product_id || 'UNKNOWN')
  const price = (item.price || item._price || item.price_a || 0).toLocaleString()
  const win = window.open('', '_blank', 'width=220,height=140')
  if (!win) return { success: false, error: '彈出視窗被封鎖' }
  win.document.write(`<!DOCTYPE html>
<html><head><meta charset="utf-8">
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
<style>
@page { margin:0; size:50mm 25mm; }
* { box-sizing:border-box; margin:0; padding:0; }
body { width:50mm; height:25mm; padding:1mm 1.5mm; font-family:sans-serif; text-align:center; }
.brand { font-size:5pt; letter-spacing:1pt; margin-bottom:.5mm; }
.name  { font-size:6pt; font-weight:bold; margin-bottom:1mm;
         white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:48mm; }
svg    { max-width:48mm; height:10mm; }
.price { font-size:7pt; font-weight:bold; margin-top:.5mm; }
</style></head>
<body>
<div class="brand">W CIGAR BAR</div>
<div class="name">${item.name}</div>
<svg id="bc"></svg>
<div class="price">NT$ ${price}</div>
<script>
JsBarcode('#bc', '${code}', {
  format:'CODE128', width:1.5, height:30,
  displayValue:true, fontSize:8, margin:2
});
window.onload = function() {
  setTimeout(function(){ window.print(); window.close(); }, 500);
};
<\/script>
</body></html>`)
  win.document.close()
  return { success: true, fallback: true }
}

// ── Browser Fallback：VIP 標籤 ───────────────────────────
function _vipBrowser(item, customer, orderNo) {
  const now    = new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })
  const qrData = encodeURIComponent(JSON.stringify({
    c: customer?.name  || '',
    p: customer?.phone || '',
    o: orderNo.slice(-8),
    d: now,
  }))
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${qrData}`
  const win = window.open('', '_blank', 'width=220,height=160')
  if (!win) return { success: false, error: '彈出視窗被封鎖' }
  win.document.write(`<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
@page { margin:0; size:50mm 30mm; }
* { box-sizing:border-box; margin:0; padding:0; }
body { width:50mm; height:30mm; padding:1.5mm; font-family:sans-serif; overflow:hidden; }
.wrap { display:flex; height:100%; gap:1.5mm; }
.left { flex:1; display:flex; flex-direction:column; justify-content:space-between; }
.right { width:10mm; display:flex; align-items:center; }
.brand   { font-size:5.5pt; font-weight:bold; border-bottom:.3pt solid #000; padding-bottom:.5mm; }
.cname   { font-size:7pt; font-weight:bold; margin-top:.5mm; }
.cigar   { font-size:5pt; color:#333; margin-top:.3mm; }
.cabinet { font-size:5.5pt; font-weight:bold; margin-top:.5mm; }
.date    { font-size:4.5pt; color:#666; margin-top:.3mm; }
img { width:10mm; height:10mm; }
</style></head>
<body>
<div class="wrap">
  <div class="left">
    <div>
      <div class="brand">W CIGAR BAR 紳士雪茄館</div>
      <div class="cname">${customer?.name || '訪客'}</div>
      <div class="cigar">${item.name}</div>
    </div>
    <div>
      <div class="cabinet">窖位：${customer?.cabinet_no || '—'}</div>
      <div class="date">入庫：${now} ｜ ${orderNo.slice(-8)}</div>
    </div>
  </div>
  <div class="right">
    <img src="${qrUrl}" alt="QR"/>
  </div>
</div>
</body></html>`)
  win.document.close()
  win.focus()
  setTimeout(() => { win.print(); win.close() }, 800)
  return { success: true, fallback: true }
}
