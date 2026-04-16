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
