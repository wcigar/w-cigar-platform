/**
 * W Cigar Bar — Pi Thermal Print Server
 * Runs on Raspberry Pi, listens for HTTP requests from POS frontend.
 *
 * Routes:
 *   GET  /status        — health check + printer reachability
 *   POST /print/receipt  — print customer receipt
 *   POST /print/kitchen  — print kitchen/bar ticket
 *   POST /print/barcode  — print barcode label
 *   POST /print/vip-label — print VIP member label
 *   POST /open-drawer    — kick cash drawer
 */

const express = require('express');
const cors = require('cors');
const net = require('net');

const app = express();
app.use(cors());
app.use(express.json());

// Config
const PRINTER_HOST = process.env.PRINTER_HOST || '192.168.1.87';
const PRINTER_PORT = Number(process.env.PRINTER_PORT) || 9100;
const SERVER_PORT = Number(process.env.SERVER_PORT) || 3001;

// ESC/POS Constants
const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

const CMD = {
  INIT:        Buffer.from([ESC, 0x40]),
  CUT:         Buffer.from([GS, 0x56, 0x00]),
  PARTIAL_CUT: Buffer.from([GS, 0x56, 0x01]),
  ALIGN_LEFT:  Buffer.from([ESC, 0x61, 0x00]),
  ALIGN_CENTER:Buffer.from([ESC, 0x61, 0x01]),
  ALIGN_RIGHT: Buffer.from([ESC, 0x61, 0x02]),
  BOLD_ON:     Buffer.from([ESC, 0x45, 0x01]),
  BOLD_OFF:    Buffer.from([ESC, 0x45, 0x00]),
  DOUBLE_ON:   Buffer.from([ESC, 0x21, 0x30]),
  DOUBLE_OFF:  Buffer.from([ESC, 0x21, 0x00]),
  FEED3:       Buffer.from([ESC, 0x64, 0x03]),
  DRAWER_KICK: Buffer.from([ESC, 0x70, 0x00, 0x19, 0xff]),
};

// Helpers

/** Pad / truncate string to fixed width */
function pad(str, len, align = 'left') {
  const s = String(str);
  if (s.length >= len) return s.slice(0, len);
  const space = len - s.length;
  if (align === 'right') return ' '.repeat(space) + s;
  if (align === 'center') {
    const l = Math.floor(space / 2);
    return ' '.repeat(l) + s + ' '.repeat(space - l);
  }
  return s + ' '.repeat(space);
}

/** Send raw buffer to printer via TCP */
function sendTCP(host, port, buffer) {
  return new Promise((resolve, reject) => {
    const sock = new net.Socket();
    sock.setTimeout(5000);
    sock.connect(port, host, () => {
      sock.write(buffer, () => {
        sock.end();
        resolve();
      });
    });
    sock.on('timeout', () => { sock.destroy(); reject(new Error('TCP timeout')); });
    sock.on('error', reject);
  });
}

/** Check if printer is reachable */
function pingPrinter(host, port) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    sock.setTimeout(2000);
    sock.connect(port, host, () => { sock.end(); resolve(true); });
    sock.on('timeout', () => { sock.destroy(); resolve(false); });
    sock.on('error', () => { sock.destroy(); resolve(false); });
  });
}

// Receipt Builders

const LINE_WIDTH = 48;
const SEP = '-'.repeat(LINE_WIDTH);

function textBuf(str) { return Buffer.from(str + '\n', 'utf8'); }

/**
 * Build customer receipt
 * @param {Object} order - { id, items: [{name, qty, price}], subtotal, tax, total, payment, cashier, createdAt }
 */
function buildReceipt(order) {
  const bufs = [CMD.INIT];

  bufs.push(CMD.ALIGN_CENTER, CMD.DOUBLE_ON);
  bufs.push(textBuf('W Cigar Bar'));
  bufs.push(CMD.DOUBLE_OFF);
  bufs.push(textBuf('Taipei Da-an District'));
  bufs.push(textBuf(SEP));

  bufs.push(CMD.ALIGN_LEFT);
  bufs.push(textBuf(`Order: #${order.id || '----'}`));
  bufs.push(textBuf(`Date:  ${order.createdAt || new Date().toLocaleString('zh-TW')}`));
  bufs.push(textBuf(`Staff: ${order.cashier || ''}`));
  bufs.push(textBuf(SEP));

  bufs.push(textBuf(pad('Item', 24) + pad('Qty', 6, 'right') + pad('Price', 10, 'right') + pad('Amt', 8, 'right')));
  bufs.push(textBuf(SEP));

  for (const item of (order.items || [])) {
    const amt = (item.qty || 1) * (item.price || 0);
    bufs.push(textBuf(
      pad(item.name || '', 24) +
      pad(String(item.qty || 1), 6, 'right') +
      pad(`$${item.price || 0}`, 10, 'right') +
      pad(`$${amt}`, 8, 'right')
    ));
  }

  bufs.push(textBuf(SEP));
  bufs.push(CMD.BOLD_ON);
  bufs.push(textBuf(pad('Subtotal', 24) + pad(`$${order.subtotal || 0}`, 24, 'right')));
  if (order.tax) {
    bufs.push(textBuf(pad('Tax', 24) + pad(`$${order.tax}`, 24, 'right')));
  }
  bufs.push(CMD.DOUBLE_ON);
  bufs.push(textBuf(pad('TOTAL', 24) + pad(`$${order.total || 0}`, 24, 'right')));
  bufs.push(CMD.DOUBLE_OFF, CMD.BOLD_OFF);

  if (order.payment) {
    bufs.push(textBuf(`Payment: ${order.payment}`));
  }

  bufs.push(textBuf(SEP));
  bufs.push(CMD.ALIGN_CENTER);
  bufs.push(textBuf('Thank you for visiting W Cigar Bar'));
  bufs.push(textBuf(''));
  bufs.push(CMD.FEED3, CMD.PARTIAL_CUT);
  return Buffer.concat(bufs);
}

/**
 * Build kitchen/bar ticket
 * @param {Object} order - { id, items: [{name, qty, note}], table, createdAt }
 */
function buildKitchen(order) {
  const bufs = [CMD.INIT];
  bufs.push(CMD.ALIGN_CENTER, CMD.DOUBLE_ON, CMD.BOLD_ON);
  bufs.push(textBuf(`KITCHEN #${order.id || '----'}`));
  bufs.push(CMD.DOUBLE_OFF, CMD.BOLD_OFF);
  bufs.push(CMD.ALIGN_LEFT);
  bufs.push(textBuf(`Table: ${order.table || '-'}    ${order.createdAt || new Date().toLocaleString('zh-TW')}`));
  bufs.push(textBuf(SEP));
  for (const item of (order.items || [])) {
    bufs.push(CMD.BOLD_ON);
    bufs.push(textBuf(`  x${item.qty || 1}  ${item.name || ''}`));
    bufs.push(CMD.BOLD_OFF);
    if (item.note) {
      bufs.push(textBuf(`       ** ${item.note}`));
    }
  }
  bufs.push(textBuf(SEP));
  bufs.push(CMD.FEED3, CMD.CUT);
  return Buffer.concat(bufs);
}

/**
 * Build barcode label (Code128)
 * @param {Object} data - { code, label }
 */
function buildBarcode(data) {
  const bufs = [CMD.INIT];
  const code = data.code || '0000000000';
  bufs.push(CMD.ALIGN_CENTER);
  if (data.label) { bufs.push(textBuf(data.label)); }
  bufs.push(Buffer.from([GS, 0x48, 0x02]));
  bufs.push(Buffer.from([GS, 0x68, 0x50]));
  bufs.push(Buffer.from([GS, 0x77, 0x03]));
  bufs.push(Buffer.from([GS, 0x6b, 0x49, code.length]));
  bufs.push(Buffer.from(code, 'ascii'));
  bufs.push(Buffer.from([LF]));
  bufs.push(CMD.FEED3, CMD.PARTIAL_CUT);
  return Buffer.concat(bufs);
}

/**
 * Build VIP member label
 * @param {Object} member - { name, level, memberId, since }
 */
function buildVip(member) {
  const bufs = [CMD.INIT];
  bufs.push(CMD.ALIGN_CENTER, CMD.DOUBLE_ON, CMD.BOLD_ON);
  bufs.push(textBuf('W Cigar Bar VIP'));
  bufs.push(CMD.DOUBLE_OFF, CMD.BOLD_OFF);
  bufs.push(textBuf(SEP));
  bufs.push(CMD.ALIGN_LEFT);
  bufs.push(CMD.BOLD_ON);
  bufs.push(textBuf(`Name:   ${member.name || ''}`));
  bufs.push(CMD.BOLD_OFF);
  bufs.push(textBuf(`Level:  ${member.level || 'Standard'}`));
  bufs.push(textBuf(`ID:     ${member.memberId || ''}`));
  bufs.push(textBuf(`Since:  ${member.since || ''}`));
  bufs.push(textBuf(SEP));
  if (member.memberId) {
    bufs.push(CMD.ALIGN_CENTER);
    bufs.push(Buffer.from([GS, 0x48, 0x02]));
    bufs.push(Buffer.from([GS, 0x68, 0x40]));
    bufs.push(Buffer.from([GS, 0x77, 0x02]));
    bufs.push(Buffer.from([GS, 0x6b, 0x49, member.memberId.length]));
    bufs.push(Buffer.from(member.memberId, 'ascii'));
    bufs.push(Buffer.from([LF]));
  }
  bufs.push(CMD.FEED3, CMD.PARTIAL_CUT);
  return Buffer.concat(bufs);
}

// Routes

app.get('/status', async (_req, res) => {
  const reachable = await pingPrinter(PRINTER_HOST, PRINTER_PORT);
  res.json({
    server: 'ok',
    printer: reachable ? 'online' : 'offline',
    host: PRINTER_HOST,
    port: PRINTER_PORT,
    timestamp: new Date().toISOString(),
  });
});

app.post('/print/receipt', async (req, res) => {
  try {
    const buf = buildReceipt(req.body);
    await sendTCP(PRINTER_HOST, PRINTER_PORT, buf);
    res.json({ success: true });
  } catch (err) {
    console.error('[receipt]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/print/kitchen', async (req, res) => {
  try {
    const buf = buildKitchen(req.body);
    await sendTCP(PRINTER_HOST, PRINTER_PORT, buf);
    res.json({ success: true });
  } catch (err) {
    console.error('[kitchen]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/print/barcode', async (req, res) => {
  try {
    const buf = buildBarcode(req.body);
    await sendTCP(PRINTER_HOST, PRINTER_PORT, buf);
    res.json({ success: true });
  } catch (err) {
    console.error('[barcode]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/print/vip-label', async (req, res) => {
  try {
    const buf = buildVip(req.body);
    await sendTCP(PRINTER_HOST, PRINTER_PORT, buf);
    res.json({ success: true });
  } catch (err) {
    console.error('[vip-label]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/open-drawer', async (_req, res) => {
  try {
    await sendTCP(PRINTER_HOST, PRINTER_PORT, Buffer.concat([CMD.INIT, CMD.DRAWER_KICK]));
    res.json({ success: true });
  } catch (err) {
    console.error('[drawer]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Start
app.listen(SERVER_PORT, '0.0.0.0', () => {
  console.log(`[W Print Server] listening on :${SERVER_PORT}`);
  console.log(`[W Print Server] printer target ${PRINTER_HOST}:${PRINTER_PORT}`);
});
