// W Cigar Bar 列印橋接伺服器 v1.0
// 部署在 Raspberry Pi Zero 2W
// 啟動：node server.js
// 設定印表機 IP：修改下方 PRINTERS 或用環境變數

const http = require('http')
const net  = require('net')
const fs   = require('fs')
const { exec } = require('child_process')

const PORT = 3000

const PRINTERS = {
  receipt: {
    host: process.env.RECEIPT_IP || '192.168.1.101',
    port: parseInt(process.env.RECEIPT_PORT) || 9100,
  },
  kitchen: {
    host: process.env.KITCHEN_IP || '192.168.1.102',
    port: parseInt(process.env.KITCHEN_PORT) || 9100,
  },
  label: {
    mac: process.env.LABEL_MAC || 'XX:XX:XX:XX:XX:XX',
  },
}

// ── ESC/POS 指令 ────────────────────────────────────────
const ESC = '\x1B'
const GS  = '\x1D'
const CMD = {
  INIT:        ESC + '@',
  CUT:         GS  + 'V\x41\x00',
  OPEN_DRAWER: ESC + 'p\x00\x19\xFA',
  BOLD_ON:     ESC + 'E\x01',
  BOLD_OFF:    ESC + 'E\x00',
  CENTER:      ESC + 'a\x01',
  LEFT:        ESC + 'a\x00',
  DBL:         GS  + '!\x11',
  NORMAL:      GS  + '!\x00',
  SEP:  '================================\n',
  DASH: '--------------------------------\n',
}

function pad(str, len, rightAlign) {
  const s = String(str || '').substring(0, len)
  return rightAlign ? s.padStart(len) : s.padEnd(len)
}

// ── TCP 送出到網路印表機 ─────────────────────────────────
function sendTCP(printerKey, rawData) {
  return new Promise((resolve, reject) => {
    const cfg = PRINTERS[printerKey]
    if (!cfg || !cfg.host) {
      return reject(new Error('印表機未設定: ' + printerKey))
    }
    const client = new net.Socket()
    client.connect(cfg.port, cfg.host, () => {
      client.write(Buffer.from(rawData, 'binary'))
      client.end()
      resolve({ success: true })
    })
    client.on('error', (err) => reject(err))
    setTimeout(() => {
      client.destroy()
      reject(new Error(`印表機 ${printerKey} 連線逾時 (${cfg.host}:${cfg.port})`))
    }, 5000)
  })
}

// ── 藍芽標籤機 ──────────────────────────────────────────
function sendBluetooth(tspl) {
  return new Promise((resolve, reject) => {
    const tmpFile = '/tmp/wcb-label.tspl'
    fs.writeFileSync(tmpFile, tspl, 'utf8')
    exec(`cat "${tmpFile}" > /dev/rfcomm0`, (err) => {
      if (err) reject(new Error('藍芽標籤失敗: ' + err.message))
      else resolve({ success: true })
    })
  })
}

// ── 收據內容 ─────────────────────────────────────────────
function buildReceipt(order, cart, customer, cashierName) {
  const now = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })
  let d = ''
  d += CMD.INIT
  d += CMD.CENTER + CMD.BOLD_ON + CMD.DBL
  d += 'W CIGAR BAR\n'
  d += CMD.NORMAL
  d += '紳士雪茄館  大安總店\n'
  d += CMD.BOLD_OFF + CMD.SEP + CMD.LEFT
  d += `時間：${now}\n`
  d += `單號：${order.order_no || ''}\n`
  d += `收銀：${cashierName || ''}\n`
  if (customer && customer.name) d += `客戶：${customer.name}\n`
  d += CMD.SEP
  ;(cart || []).forEach(item => {
    const name = pad(item.name || '', 18)
    const qty  = pad('x' + item.qty, 3, true)
    const amt  = pad('$' + ((item.price || 0) * item.qty).toLocaleString(), 9, true)
    d += name + qty + amt + '\n'
  })
  d += CMD.SEP
  if ((order.discount_amount || 0) > 0) {
    d += pad('折扣', 20) + pad('-$' + Number(order.discount_amount).toLocaleString(), 12, true) + '\n'
  }
  if ((order.service_fee_amount || 0) > 0) {
    d += pad('服務費', 20) + pad('+$' + Number(order.service_fee_amount).toLocaleString(), 12, true) + '\n'
  }
  d += CMD.BOLD_ON
  d += pad('總計', 20) + pad('$' + Number(order.total || order.order_total || 0).toLocaleString(), 12, true) + '\n'
  d += CMD.BOLD_OFF
  d += `付款：${order.payMethod || order.payment_method || ''}\n`
  d += CMD.SEP + CMD.CENTER
  d += '感謝您蒞臨 W Cigar Bar\n'
  d += '請保留本收據以供查詢\n'
  d += '\n\n' + CMD.CUT
  d += CMD.OPEN_DRAWER
  return d
}

// ── 廚房/酒吧打單 ────────────────────────────────────────
const KITCHEN_CATS = ['奶茶咖啡', '氣泡飲品', '酒類', '餐食', '甜點']

function buildKitchen(order, cart, tableNo) {
  const items = (cart || []).filter(i => KITCHEN_CATS.includes(i._cat))
  if (!items.length) return null
  const now = new Date().toLocaleTimeString('zh-TW', {
    timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false
  })
  let d = CMD.INIT + CMD.CENTER + CMD.BOLD_ON + CMD.DBL
  d += '★ 廚房出單 ★\n'
  d += CMD.NORMAL + CMD.BOLD_OFF
  d += `${now}  尾號：${(order.order_no || '').slice(-6)}\n`
  if (tableNo) d += `桌號：${tableNo}\n`
  d += CMD.DASH + CMD.LEFT
  items.forEach(item => {
    d += CMD.BOLD_ON + CMD.DBL
    d += `${item.qty}x ${item.name}\n`
    d += CMD.NORMAL + CMD.BOLD_OFF
    if (item.notes) d += `  備註：${item.notes}\n`
  })
  d += CMD.DASH + CMD.CENTER
  d += `共 ${items.length} 項\n\n\n`
  d += CMD.CUT
  return d
}

// ── 條碼標籤 TSPL ────────────────────────────────────────
function buildBarcode(item) {
  const code  = (item.id || item.product_id || 'UNKNOWN').replace(/"/g, '')
  const name  = (item.name || '').substring(0, 24).replace(/"/g, "'")
  const price = 'NT$ ' + (item.price || item._price || 0).toLocaleString()
  return [
    'SIZE 50 mm, 25 mm',
    'GAP 3 mm, 0',
    'DIRECTION 1',
    'CLS',
    `TEXT 5,5,"2",0,1,1,"W CIGAR BAR"`,
    `TEXT 5,28,"3",0,1,1,"${name}"`,
    `BARCODE 5,55,"128",50,1,0,2,2,"${code}"`,
    `TEXT 5,115,"3",0,1,1,"${price}"`,
    'PRINT 1,1',
  ].join('\r\n')
}

// ── VIP 窖位標籤 TSPL ────────────────────────────────────
function buildVip(item, customer, orderNo) {
  const now    = new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })
  const cname  = (customer && customer.name  || '').substring(0, 12).replace(/"/g, "'")
  const cigar  = (item.name || '').substring(0, 20).replace(/"/g, "'")
  const cab    = (customer && customer.cabinet_no || '—').replace(/"/g, "'")
  const short  = (orderNo || '').slice(-8)
  const qrData = JSON.stringify({ c: cname, o: short, d: now }).replace(/"/g, "'")
  return [
    'SIZE 50 mm, 30 mm',
    'GAP 3 mm, 0',
    'DIRECTION 1',
    'CLS',
    `TEXT 5,5,"2",0,1,1,"W CIGAR BAR 紳士雪茄館"`,
    `TEXT 5,28,"3",0,1,1,"${cname}"`,
    `TEXT 5,52,"2",0,1,1,"${cigar}"`,
    `TEXT 5,72,"2",0,1,1,"窖位: ${cab}"`,
    `TEXT 5,92,"2",0,1,1,"${now} ${short}"`,
    `QRCODE 320,5,L,4,A,0,"${qrData}"`,
    'PRINT 1,1',
  ].join('\r\n')
}

// ── HTTP 伺服器 ──────────────────────────────────────────
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Content-Type', 'application/json; charset=utf-8')

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return }

  // GET /status
  if (req.method === 'GET' && req.url === '/status') {
    res.end(JSON.stringify({
      ok: true,
      store: 'W Cigar Bar 大安總店',
      printers: PRINTERS,
      time: new Date().toISOString(),
    }))
    return
  }

  if (req.method !== 'POST') { res.writeHead(404); res.end('{}'); return }

  let body = ''
  req.on('data', chunk => { body += chunk })
  req.on('end', async () => {
    try {
      const p = JSON.parse(body)
      let result = {}

      switch (req.url) {
        case '/print/receipt':
          result = await sendTCP('receipt', buildReceipt(p.order, p.cart, p.customer, p.cashierName))
          break
        case '/print/kitchen': {
          const kData = buildKitchen(p.order, p.cart, p.tableNo)
          result = kData
            ? await sendTCP('kitchen', kData)
            : { success: true, skipped: true, reason: '無廚房品項' }
          break
        }
        case '/print/barcode':
          result = await sendBluetooth(buildBarcode(p.item))
          break
        case '/print/vip':
          result = await sendBluetooth(buildVip(p.item, p.customer, p.orderNo))
          break
        case '/open-drawer':
          result = await sendTCP('receipt', CMD.INIT + CMD.OPEN_DRAWER)
          break
        default:
          res.writeHead(404); res.end('{}'); return
      }

      res.end(JSON.stringify(result))
    } catch (err) {
      console.error('[Error]', req.url, err.message)
      res.writeHead(500)
      res.end(JSON.stringify({ success: false, error: err.message }))
    }
  })
})

server.listen(PORT, '0.0.0.0', () => {
  console.log('==========================================')
  console.log('  W Cigar Bar 列印橋接伺服器已啟動')
  console.log(`  Port : ${PORT}`)
  console.log(`  收據機: ${PRINTERS.receipt.host}:${PRINTERS.receipt.port}`)
  console.log(`  廚房機: ${PRINTERS.kitchen.host}:${PRINTERS.kitchen.port}`)
  console.log(`  標籤機: ${PRINTERS.label.mac}`)
  console.log('==========================================')
})
