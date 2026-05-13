// ============================================================
// 報關文件 Word 產生器 (對應 customsPdf.js 三份文件)
//   - Packing List (裝箱單)
//   - Certificate of Origin (產地證明)
//   - Commercial Invoice (商業發票)
// 純前端 docx + file-saver, 手機亦可用
// ============================================================
import { saveAs } from 'file-saver'
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, HeadingLevel, WidthType, VerticalAlign,
  ShadingType, PageOrientation, LevelFormat,
} from 'docx'

// ── Helpers ───────────────────────────────────────────────────────────────
function s(v) { return v == null ? '' : String(v) }

function formatDate(d) {
  if (!d) return ''
  const dt = typeof d === 'string' ? new Date(d) : d
  return dt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

function P(text, opts = {}) {
  return new Paragraph({
    alignment: opts.align || AlignmentType.LEFT,
    spacing: { before: opts.before || 0, after: opts.after || 80 },
    children: [new TextRun({ text: s(text), bold: !!opts.bold, size: opts.size || 20, color: opts.color || '202020', font: 'Calibri' })],
  })
}

function P_multi(runs, opts = {}) {
  return new Paragraph({
    alignment: opts.align || AlignmentType.LEFT,
    spacing: { before: opts.before || 0, after: opts.after || 80 },
    children: runs.map(r => new TextRun({ text: s(r.text), bold: !!r.bold, size: r.size || 20, color: r.color || '202020', font: 'Calibri' })),
  })
}

function titleBar(text) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 200, after: 200 },
    shading: { type: ShadingType.SOLID, color: '464646', fill: '464646' },
    children: [new TextRun({ text: s(text), bold: true, size: 28, color: 'FFFFFF', font: 'Calibri' })],
  })
}

function thinCell({ text, bold = false, size = 18, fill, align = AlignmentType.LEFT, color = '202020', children }) {
  return new TableCell({
    verticalAlign: VerticalAlign.CENTER,
    shading: fill ? { type: ShadingType.SOLID, color: fill, fill } : undefined,
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    children: children || [new Paragraph({ alignment: align, children: [new TextRun({ text: s(text), bold, size, color, font: 'Calibri' })] })],
  })
}

function headerBlock(supplier) {
  const lines = [
    P(supplier?.name || '', { bold: true, size: 32, align: AlignmentType.CENTER }),
    P(supplier?.address || '', { size: 20, align: AlignmentType.CENTER, color: '505050' }),
  ]
  if (supplier?.country) lines.push(P(supplier.country, { size: 20, align: AlignmentType.CENTER, color: '505050' }))
  if (supplier?.phone || supplier?.email) {
    lines.push(P([supplier?.phone, supplier?.email].filter(Boolean).join('  ·  '), { size: 18, align: AlignmentType.CENTER, color: '707070' }))
  }
  return lines
}

function infoGrid(rows) {
  // rows: [[label, value], ...]
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(([label, value]) => new TableRow({
      children: [
        thinCell({ text: label, bold: true, size: 18, fill: 'EFEFEF', align: AlignmentType.LEFT }),
        thinCell({ text: value, size: 18, align: AlignmentType.LEFT }),
      ],
    })),
    borders: tableBorders(),
  })
}

function tableBorders() {
  const c = { style: BorderStyle.SINGLE, size: 4, color: '888888' }
  return { top: c, bottom: c, left: c, right: c, insideHorizontal: c, insideVertical: c }
}

function partyBlock(title, lines) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [thinCell({ text: title, bold: true, size: 20, fill: 'EFEFEF', align: AlignmentType.LEFT })] }),
      new TableRow({ children: [
        new TableCell({
          margins: { top: 80, bottom: 80, left: 100, right: 100 },
          children: lines.filter(Boolean).map(l => new Paragraph({ children: [new TextRun({ text: s(l), size: 20, font: 'Calibri' })] })),
        }),
      ] }),
    ],
    borders: tableBorders(),
  })
}

function spacer(lines = 1) { return Array(lines).fill(0).map(() => new Paragraph({ children: [new TextRun(' ')] })) }

// ── 1) Packing List ───────────────────────────────────────────────────────
export async function makePackingListDocx({ supplier, shipment }) {
  const items = shipment.items || []
  const rows = [
    new TableRow({
      tableHeader: true,
      children: ['DESCRIPTION', 'HS CODE', 'BUNDLES', 'PCS/BUNDLE', 'TOTAL PCS', 'PACKAGE TYPE'].map(h =>
        thinCell({ text: h, bold: true, size: 18, fill: '464646', color: 'FFFFFF', align: AlignmentType.CENTER })),
    }),
    ...items.map(it => new TableRow({ children: [
      thinCell({ text: it.name + (it.unit_weight_g && it.total_pcs ? ` (Net ${(it.unit_weight_g * it.total_pcs).toFixed(0)}g)` : ''), size: 18 }),
      thinCell({ text: it.hs_code || shipment.hs_code || '2402.10.00.00-8', size: 16, align: AlignmentType.CENTER }),
      thinCell({ text: it.qty_bundles, size: 18, align: AlignmentType.CENTER }),
      thinCell({ text: it.pcs_per_bundle, size: 18, align: AlignmentType.CENTER }),
      thinCell({ text: it.total_pcs, size: 18, align: AlignmentType.CENTER }),
      thinCell({ text: it.package_type || 'Bundle', size: 18, align: AlignmentType.CENTER }),
    ] })),
    new TableRow({ children: [
      thinCell({ text: 'TOTAL', bold: true, fill: 'DCDCDC', align: AlignmentType.CENTER }),
      thinCell({ text: '', fill: 'DCDCDC' }),
      thinCell({ text: shipment.total_bundles, bold: true, fill: 'DCDCDC', align: AlignmentType.CENTER }),
      thinCell({ text: '', fill: 'DCDCDC' }),
      thinCell({ text: shipment.total_sticks, bold: true, fill: 'DCDCDC', align: AlignmentType.CENTER }),
      thinCell({ text: `${shipment.total_bundles} ${items[0]?.package_type || 'Bundles'}`, bold: true, fill: 'DCDCDC', align: AlignmentType.CENTER }),
    ] }),
  ]
  const itemsTable = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows, borders: tableBorders() })

  const doc = new Document({
    sections: [{
      properties: { page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } } },
      children: [
        ...headerBlock(supplier),
        titleBar('PACKING LIST'),
        infoGrid([
          ['Date', formatDate(shipment.shipment_date)],
          ['Country of Origin', supplier?.country || 'Dominican Republic'],
          ['Shipment Method', shipment.shipment_method || 'Passenger checked baggage'],
          ['Total Packages', shipment.total_packages || '1 checked baggage'],
        ]),
        ...spacer(1),
        partyBlock('Exporter', [supplier?.name, supplier?.address, supplier?.country]),
        ...spacer(1),
        partyBlock('Consignee', [shipment.buyer_name, shipment.buyer_address]),
        ...spacer(1),
        itemsTable,
        ...spacer(1),
        infoGrid([
          ['Total Net Weight (kg)', shipment.total_net_weight_kg || 'TO BE VERIFIED'],
          ['Total Gross Weight', 'TO BE VERIFIED'],
          ['Weight Unit', 'KGS'],
          ['Package Dimensions', 'TO BE VERIFIED'],
          ['Packing', `${shipment.total_bundles} bundles in ${shipment.total_packages || '1 checked baggage'}`],
          ['Remark', shipment.packing_remark || 'Net from unit weights; gross pending scale.'],
        ]),
      ],
    }],
  })
  return Packer.toBlob(doc)
}

// ── 2) Certificate of Origin ───────────────────────────────────────────────
export async function makeCertificateOfOriginDocx({ supplier, shipment }) {
  const items = shipment.items || []
  const itemRows = [
    new TableRow({
      tableHeader: true,
      children: ['DESCRIPTION', 'BOX QTY', 'PCS/BOX', 'TOTAL PCS'].map(h =>
        thinCell({ text: h, bold: true, size: 18, fill: '464646', color: 'FFFFFF', align: AlignmentType.CENTER })),
    }),
    ...items.map(it => new TableRow({ children: [
      thinCell({ text: it.name + (it.unit_weight_g && it.total_pcs ? ` (Net ${(it.unit_weight_g * it.total_pcs).toFixed(0)}g)` : ''), size: 18 }),
      thinCell({ text: it.qty_bundles, size: 18, align: AlignmentType.CENTER }),
      thinCell({ text: it.pcs_per_bundle, size: 18, align: AlignmentType.CENTER }),
      thinCell({ text: it.total_pcs, size: 18, align: AlignmentType.CENTER }),
    ] })),
  ]
  const itemsTable = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: itemRows, borders: tableBorders() })
  const country = supplier?.country || 'Dominican Republic'
  const supplierName = supplier?.name || ''
  const para1 = `We, ${supplierName}, hereby declare and certify that the following cigar products were manufactured and packed in the ${country}, and are of ${country} origin.`
  const para2 = 'All cigars listed below are handmade, long-filler cigars produced by our factory under private branding. These products are not manufactured in Cuba and are not affiliated with, endorsed by, or produced by Habanos S.A. or any Cuban entity.'
  const para3 = `Certain packaging elements may contain references such as 'Habana, Cuba' or 'Habanos S.A.' for stylistic or nostalgic design purposes only. We confirm that all cigars listed in this document were manufactured, hand-rolled, and packed by ${supplierName} in the ${country}, and are not produced, endorsed by, or associated with Habanos S.A. or any Cuban entity.`
  const para4 = `We further declare that the above products were produced in the ${country}, and this document is issued by the manufacturer in support of customs review and origin clarification.`

  const doc = new Document({
    sections: [{
      properties: { page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } } },
      children: [
        ...headerBlock(supplier),
        titleBar("MANUFACTURER'S DECLARATION OF ORIGIN"),
        P('To Whom It May Concern:', { size: 22, bold: true, before: 100, after: 200 }),
        P(para1, { size: 20, after: 200 }),
        P(para2, { size: 20, after: 200 }),
        P('Packaging Clarification:', { size: 20, bold: true, after: 100 }),
        P(para3, { size: 20, after: 200 }),
        P('Product Details:', { size: 20, bold: true, after: 100 }),
        itemsTable,
        ...spacer(1),
        P(`Total Bundles: ${shipment.total_bundles}    Total Sticks: ${shipment.total_sticks}`, { size: 20, bold: true }),
        P(`Origin: ${country}`, { size: 20 }),
        P(`Factory: ${supplierName}`, { size: 20 }),
        P(`Address: ${supplier?.address || ''}`, { size: 20, after: 200 }),
        P(para4, { size: 20, after: 300 }),
        P(`Date: ${formatDate(shipment.shipment_date)}    Location: Santiago, ${country}`, { size: 20, after: 400 }),
        P('Authorized Signature: ____________________________', { size: 20, after: 100 }),
        P(`${supplier?.authorized_name || ''}    ${supplier?.authorized_title || ''}`, { size: 20, bold: true }),
      ],
    }],
  })
  return Packer.toBlob(doc)
}

// ── 3) Commercial Invoice ─────────────────────────────────────────────────
export async function makeCommercialInvoiceDocx({ supplier, shipment }) {
  const items = shipment.items || []
  const itemRows = [
    new TableRow({
      tableHeader: true,
      children: ['DESCRIPTION', 'HS CODE', '# STICKS', 'PRICE/STICK', 'BOX/BUNDLE (QTY)', 'TOTAL US$'].map(h =>
        thinCell({ text: h, bold: true, size: 16, fill: '464646', color: 'FFFFFF', align: AlignmentType.CENTER })),
    }),
    ...items.map(it => new TableRow({ children: [
      thinCell({ text: it.name + (it.unit_weight_g && it.total_pcs ? ` (Net ${(it.unit_weight_g * it.total_pcs).toFixed(0)}g)` : ''), size: 16 }),
      thinCell({ text: it.hs_code || shipment.hs_code || '2402.10.00.00-8', size: 14, align: AlignmentType.CENTER }),
      thinCell({ text: it.total_pcs, size: 16, align: AlignmentType.CENTER }),
      thinCell({ text: `$${Number(it.unit_price_usd || 0).toFixed(2)}`, size: 16, align: AlignmentType.RIGHT }),
      thinCell({ text: `${it.package_type || 'Box'} x ${it.pcs_per_bundle} (QTY ${it.qty_bundles})`, size: 16, align: AlignmentType.CENTER }),
      thinCell({ text: `$${Number(it.subtotal || 0).toFixed(2)}`, size: 16, align: AlignmentType.RIGHT }),
    ] })),
    new TableRow({ children: [
      thinCell({ text: 'TOTAL', bold: true, fill: 'DCDCDC', align: AlignmentType.CENTER }),
      thinCell({ text: '', fill: 'DCDCDC' }),
      thinCell({ text: shipment.total_sticks, bold: true, fill: 'DCDCDC', align: AlignmentType.CENTER }),
      thinCell({ text: '', fill: 'DCDCDC' }),
      thinCell({ text: '', fill: 'DCDCDC' }),
      thinCell({ text: `$${Number(shipment.total_amount_usd || 0).toFixed(2)}`, bold: true, fill: 'DCDCDC', align: AlignmentType.RIGHT }),
    ] }),
  ]
  const itemsTable = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: itemRows, borders: tableBorders() })

  const sections = [
    ...headerBlock(supplier),
    P(`RNC: ${supplier?.rnc || ''}`, { size: 18, color: '707070', align: AlignmentType.LEFT }),
    P(`Email: ${supplier?.email || ''}`, { size: 18, color: '707070', align: AlignmentType.LEFT, after: 200 }),
    titleBar('EXPORT INVOICE'),
    partyBlock('Bill-to-party', [shipment.buyer_name, shipment.buyer_address]),
    ...spacer(1),
    infoGrid([
      ['Export Invoice No.', shipment.shipment_no || ''],
      ['Incoterms', shipment.invoice_terms || 'FOB, ex-Factory'],
      ['Invoice Date', formatDate(shipment.shipment_date)],
      ['HS Code', shipment.hs_code || '2402.10.00.00-8'],
      ['Country of Origin', supplier?.country || 'Dominican Republic'],
      ['Final Destination', 'Taiwan'],
    ]),
  ]
  if (shipment.notify_to) {
    sections.push(...spacer(1), partyBlock('Notify To', [shipment.notify_to]))
  }
  sections.push(
    ...spacer(1),
    itemsTable,
    ...spacer(1),
    P(`No. of pieces shipped: ${shipment.total_sticks} sticks (${shipment.total_bundles} boxes/bundles).`, { size: 18 }),
    P(`Please pay to ${supplier?.name || ''} directly. No reclaims 30 days after shipping date.`, { size: 18 }),
    P(`Country of Origin: ${supplier?.country || 'Dominican Republic'}.    Final Destination: Taiwan.    HS Code: ${shipment.hs_code || '2402.10.00.00-8'}`, { size: 18, after: 200 }),
    P('Wire Instruction / Bank Information', { bold: true, size: 20, after: 100 }),
    infoGrid([
      ['Account Name', supplier?.bank_account_name || ''],
      ['Bank Name', supplier?.bank_name || ''],
      ['Account #', supplier?.bank_account || ''],
      ['SWIFT', supplier?.bank_swift || ''],
    ]),
    ...spacer(1),
    P_multi([
      { text: `Sent by: ${supplier?.name || ''}`, size: 18 },
      { text: '         Prepared by: Lic. Claribel Paulino', size: 18 },
    ]),
  )

  const doc = new Document({
    sections: [{
      properties: { page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } } },
      children: sections,
    }],
  })
  return Packer.toBlob(doc)
}

// ── orchestrator + download ──────────────────────────────────────────────
export async function generateAllDocsDocx({ supplier, shipment }) {
  const [packingList, coo, invoice] = await Promise.all([
    makePackingListDocx({ supplier, shipment }),
    makeCertificateOfOriginDocx({ supplier, shipment }),
    makeCommercialInvoiceDocx({ supplier, shipment }),
  ])
  return { packingList, coo, invoice }
}

export function downloadDocx(blob, filename) {
  saveAs(blob, filename)
}

export async function shareDocxFiles(files) {
  const fileObjs = files.map(({ blob, filename }) => new File([blob], filename, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }))
  if (navigator.share && navigator.canShare && navigator.canShare({ files: fileObjs })) {
    try {
      await navigator.share({ title: '報關文件 Word', text: '雪茄報關文件 Word', files: fileObjs })
      return { ok: true, method: 'share' }
    } catch (e) {
      if (e.name === 'AbortError') return { ok: false, method: 'cancelled' }
    }
  }
  files.forEach(({ blob, filename }) => saveAs(blob, filename))
  return { ok: true, method: 'download' }
}
