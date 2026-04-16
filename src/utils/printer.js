/**
 * W Cigar Bar — Frontend Printer Utilities
 * Talks to Pi Print Server via HTTP.
 */

// Config
const PRINT_SERVER =
  import.meta.env.VITE_PRINT_SERVER_URL || 'http://192.168.1.100:3001';

// Low-level helpers

/** POST JSON to print server */
async function printRequest(endpoint, payload = {}) {
  const res = await fetch(`${PRINT_SERVER}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Print failed: ${res.status}`);
  }
  return res.json();
}

/** GET from print server */
async function printGet(endpoint) {
  const res = await fetch(`${PRINT_SERVER}${endpoint}`);
  if (!res.ok) throw new Error(`Print server error: ${res.status}`);
  return res.json();
}

// Public API

/**
 * Check printer status
 * @returns {Promise<{server: string, printer: string, host: string, port: number}>}
 */
export async function getStatus() {
  return printGet('/status');
}

/**
 * Print customer receipt
 * @param {Object} order - { id, items, subtotal, tax, total, payment, cashier, createdAt }
 */
export async function printReceipt(order) {
  return printRequest('/print/receipt', order);
}

/**
 * Print kitchen/bar ticket
 * @param {Object} order - { id, items, table, createdAt }
 */
export async function printKitchen(order) {
  return printRequest('/print/kitchen', order);
}

/**
 * Print barcode label
 * @param {string} code - barcode data string
 * @param {string} [label] - optional text above barcode
 */
export async function printBarcode(code, label) {
  return printRequest('/print/barcode', { code, label });
}

/**
 * Print VIP member label
 * @param {Object} member - { name, level, memberId, since }
 */
export async function printVipLabel(member) {
  return printRequest('/print/vip-label', member);
}

/**
 * Kick cash drawer
 */
export async function openDrawer() {
  return printRequest('/open-drawer');
}

/**
 * 批次列印 VIP 窖藏櫃位標籤
 * 每支雪茄一張標籤
 */
export async function printCellarLabels({ customer, items, orderNo, storedDate }) {
  const labels = items.flatMap(item =>
    Array.from({ length: item.qty }, (_, i) => ({
      memberName: customer.name,
      memberId: customer.vip_code || customer.id,
      cabinetNo: item.cabinet_no,
      cigarName: item.name,
      unitPrice: item.price,
      orderNo,
      storedDate,
      index: i + 1,
      total: item.qty
    }))
  )
  const res = await fetch(`${BASE}/print-cellar-labels`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ labels })
  })
  if (!res.ok) throw new Error('櫃位標籤列印失敗')
  return res.json()
}

/**
 * 列印 VIP 入櫃明細總表
 */
export async function printCellarSummary({ customer, items, orderNo, storedDate, totalAmount }) {
  const res = await fetch(`${BASE}/print-cellar-summary`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      memberName: customer.name,
      memberId: customer.vip_code || customer.id,
      cabinetNo: items[0]?.cabinet_no || 'A1',
      orderNo,
      storedDate,
      totalAmount,
      items: items.map(i => ({ name: i.name, qty: i.qty, price: i.price, subtotal: i.price * i.qty }))
    })
  })
  if (!res.ok) throw new Error('入櫃明細列印失敗')
  return res.json()
}
