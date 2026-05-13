// ============================================================
// 報關文件 Word 產生器 (對應 customsPdf.js)
//   - Packing List (裝箱單)
//   - Certificate of Origin (產地證明)
//   - Commercial Invoice (商業發票)
// 版面 100% 對應 PDF：logo / titleBar / infoBlock / partyBlock /
// items table / signature 處 / Wire Instruction 灰底 box
// ============================================================
import FileSaver from 'file-saver'
const saveAs = FileSaver?.saveAs || FileSaver
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, VerticalAlign, ShadingType,
} from 'docx'

// ── Constants ────────────────────────────────────────────────────────────
const COLOR_BLACK = '141414'
const COLOR_TEXT  = '1E1E1E'
const COLOR_MUTED = '505050'
const COLOR_GREY_LINE = 'B4B4B4'
const COLOR_GREY_FILL = 'F0F0F0'
const COLOR_GREY_FILL_LIGHT = 'F5F5F5'
const COLOR_GREY_FILL_DARK = 'EBEBEB'
const COLOR_TABLE_HEAD = '464646'

const NO_BORDER = { style: BorderStyle.NIL, size: 0, color: 'FFFFFF' }
const THIN_BORDER = { style: BorderStyle.SINGLE, size: 4, color: '888888' }
const BLACK_BORDER_BOX = { style: BorderStyle.SINGLE, size: 12, color: COLOR_BLACK }
const GREY_LINE_BORDER = { style: BorderStyle.SINGLE, size: 6, color: '808080' }
const DIVIDER_LINE = { style: BorderStyle.SINGLE, size: 4, color: COLOR_GREY_LINE, space: 1 }

// ── Helpers ──────────────────────────────────────────────────────────────
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
    children: [new TextRun({
      text: s(text), bold: !!opts.bold,
      size: opts.size || 20,
      color: opts.color || COLOR_TEXT,
      font: 'Calibri',
    })],
  })
}

function P_runs(runs, opts = {}) {
  return new Paragraph({
    alignment: opts.align || AlignmentType.LEFT,
    spacing: { before: opts.before || 0, after: opts.after || 80 },
    children: runs.map(r => new TextRun({
      text: s(r.text), bold: !!r.bold,
      size: r.size || 20, color: r.color || COLOR_TEXT,
      font: 'Calibri',
    })),
  })
}

function spacer(lines = 1) {
  return Array(lines).fill(0).map(() => new Paragraph({ children: [new TextRun(' ')] }))
}

function fullTableBorders() {
  return { top: THIN_BORDER, bottom: THIN_BORDER, left: THIN_BORDER, right: THIN_BORDER, insideHorizontal: THIN_BORDER, insideVertical: THIN_BORDER }
}

function noTableBorders() {
  return { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER }
}

function cell({ text, bold = false, size = 18, fill, align = AlignmentType.LEFT, color = COLOR_TEXT, children, width, verticalAlign = VerticalAlign.CENTER }) {
  return new TableCell({
    verticalAlign,
    width: width ? { size: width, type: WidthType.DXA } : undefined,
    shading: fill ? { type: ShadingType.SOLID, color: fill, fill } : undefined,
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    children: children || [new Paragraph({
      alignment: align,
      spacing: { before: 0, after: 0 },
      children: [new TextRun({ text: s(text), bold, size, color, font: 'Calibri' })],
    })],
  })
}

// ── TDE | TABACOS DON ESTEBAN logo ───────────────────────────────────────
function logoTable() {
  const tdeCell = new TableCell({
    width: { size: 1400, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 100, bottom: 100, left: 80, right: 80 },
    borders: { top: BLACK_BORDER_BOX, bottom: BLACK_BORDER_BOX, left: BLACK_BORDER_BOX, right: BLACK_BORDER_BOX },
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 0 },
      children: [new TextRun({ text: 'TDE', bold: true, size: 40, color: COLOR_BLACK, font: 'Calibri' })],
    })],
  })
  const nameCell = new TableCell({
    width: { size: 3400, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 40, bottom: 40, left: 200, right: 80 },
    borders: { top: NO_BORDER, bottom: NO_BORDER, left: GREY_LINE_BORDER, right: NO_BORDER },
    children: [
      new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { before: 0, after: 40 },
        children: [new TextRun({ text: 'TABACOS', size: 18, color: COLOR_BLACK, characterSpacing: 60, font: 'Calibri' })],
      }),
      new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { before: 0, after: 0 },
        children: [new TextRun({ text: 'DON ESTEBAN', bold: true, size: 28, color: COLOR_BLACK, font: 'Calibri' })],
      }),
    ],
  })
  return new Table({
    alignment: AlignmentType.CENTER,
    width: { size: 4800, type: WidthType.DXA },
    rows: [new TableRow({ children: [tdeCell, nameCell] })],
    borders: noTableBorders(),
  })
}

function thinDivider() {
  return new Paragraph({
    spacing: { before: 100, after: 80 },
    border: { bottom: DIVIDER_LINE },
    children: [],
  })
}

function headerBlock(supplier) {
  const lines = [logoTable(), thinDivider()]
  lines.push(P(supplier?.address || '', { size: 18, align: AlignmentType.CENTER, color: COLOR_MUTED }))
  const contact = [
    supplier?.tel ? `Tel: ${supplier.tel}` : '',
    supplier?.email ? `Email: ${supplier.email}` : '',
  ].filter(Boolean).join('   ')
  if (contact) lines.push(P(contact, { size: 18, align: AlignmentType.CENTER, color: COLOR_MUTED }))
  return lines
}

// ── Title bar (深灰底白字置中) ────────────────────────────────────────────
function titleBar(text) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 200, after: 200 },
    shading: { type: ShadingType.SOLID, color: COLOR_TABLE_HEAD, fill: COLOR_TABLE_HEAD },
    children: [new TextRun({ text: s(text), bold: true, size: 28, color: 'FFFFFF', font: 'Calibri' })],
  })
}

// ── infoBlocksRow: N 個 box 並排，label 灰底居中、value 下方居中（仿 PDF infoBlock）
function infoBlocksRow(blocks) {
  // blocks: [[label, value], ...]
  const totalCol = blocks.length
  const colWidth = Math.floor(9600 / totalCol)
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({
      children: blocks.map(([label, value]) => new TableCell({
        verticalAlign: VerticalAlign.CENTER,
        width: { size: colWidth, type: WidthType.DXA },
        margins: { top: 0, bottom: 60, left: 60, right: 60 },
        borders: { top: THIN_BORDER, bottom: THIN_BORDER, left: THIN_BORDER, right: THIN_BORDER },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 0, after: 0 },
            shading: { type: ShadingType.SOLID, color: COLOR_GREY_FILL, fill: COLOR_GREY_FILL },
            children: [new TextRun({ text: s(label), bold: true, size: 16, color: '3C3C3C', font: 'Calibri' })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 80, after: 40 },
            children: [new TextRun({ text: s(value), size: 18, color: COLOR_TEXT, font: 'Calibri' })],
          }),
        ],
      })),
    })],
    borders: fullTableBorders(),
  })
}

// ── partyBlock: 標題深灰底 + 內容多行
function partyBlock(label, lines) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [new TableCell({
          shading: { type: ShadingType.SOLID, color: COLOR_GREY_FILL_DARK, fill: COLOR_GREY_FILL_DARK },
          margins: { top: 80, bottom: 80, left: 100, right: 100 },
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 0, after: 0 },
            children: [new TextRun({ text: s(label), bold: true, size: 20, color: '282828', font: 'Calibri' })],
          })],
        })],
      }),
      new TableRow({
        children: [new TableCell({
          margins: { top: 100, bottom: 100, left: 120, right: 120 },
          children: lines.filter(Boolean).map(l => new Paragraph({
            spacing: { before: 0, after: 60 },
            children: [new TextRun({ text: s(l), size: 20, color: COLOR_TEXT, font: 'Calibri' })],
          })),
        })],
      }),
    ],
    borders: fullTableBorders(),
  })
}

// ── 商品表 helper：標準表頭 + body + foot ───────────────────────────────
function itemsTable({ headers, rows, footer, headSize = 18, bodySize = 18 }) {
  const headRow = new TableRow({
    tableHeader: true,
    children: headers.map(h => cell({
      text: h, bold: true, size: headSize, fill: COLOR_TABLE_HEAD,
      color: 'FFFFFF', align: AlignmentType.CENTER,
    })),
  })
  const bodyRows = rows.map(row => new TableRow({
    children: row.map((c, i) => {
      if (typeof c === 'object' && c !== null && 'text' in c) {
        return cell({ ...c, size: c.size || bodySize })
      }
      return cell({ text: c, size: bodySize, align: i === 0 ? AlignmentType.LEFT : AlignmentType.CENTER })
    }),
  }))
  const footerRow = footer ? new TableRow({
    children: footer.map(c => cell({
      ...(typeof c === 'object' && c !== null ? c : { text: c }),
      bold: true, fill: 'DCDCDC', align: (typeof c === 'object' ? c.align : null) || AlignmentType.CENTER,
    })),
  }) : null
  const allRows = footerRow ? [headRow, ...bodyRows, footerRow] : [headRow, ...bodyRows]
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: allRows,
    borders: fullTableBorders(),
  })
}

function describeItem(it) {
  return s(it.name) + (it.unit_weight_g && it.total_pcs ? ` (Net ${(it.unit_weight_g * it.total_pcs).toFixed(0)}g)` : '')
}

// ────────────────────────────────────────────────────────────────────────
// 1) PACKING LIST
// ────────────────────────────────────────────────────────────────────────
export async function makePackingListDocx({ supplier, shipment }) {
  const items = shipment.items || []
  const country = supplier?.country || 'Dominican Republic'
  const hs = shipment.hs_code || '2402.10.00.00-8'

  const itTable = itemsTable({
    headers: ['DESCRIPTION', 'HS CODE', 'BUNDLES', 'PCS/BUNDLE', 'TOTAL PCS', 'PACKAGE TYPE'],
    headSize: 16, bodySize: 17,
    rows: items.map(it => [
      { text: describeItem(it), align: AlignmentType.LEFT, size: 17 },
      { text: it.hs_code || hs, size: 14, align: AlignmentType.CENTER },
      it.qty_bundles,
      it.pcs_per_bundle,
      it.total_pcs,
      it.package_type || 'Bundle',
    ]),
    footer: ['TOTAL', '', shipment.total_bundles, '', shipment.total_sticks, `${shipment.total_bundles} ${items[0]?.package_type || 'Bundles'}`],
  })

  return Packer.toBlob(new Document({
    sections: [{
      properties: { page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } } },
      children: [
        ...headerBlock(supplier),
        titleBar('PACKING LIST'),
        infoBlocksRow([
          ['Date', formatDate(shipment.shipment_date)],
          ['Country of Origin', country],
          ['Shipment Method', shipment.shipment_method || 'Passenger checked baggage'],
          ['Total Packages', shipment.total_packages || '1 checked baggage'],
        ]),
        ...spacer(1),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [new TableRow({
            children: [
              new TableCell({
                width: { size: 50, type: WidthType.PERCENTAGE },
                borders: noTableBorders(),
                margins: { top: 0, bottom: 0, left: 0, right: 60 },
                children: [partyBlock('Exporter', [supplier?.name, supplier?.address, country])],
              }),
              new TableCell({
                width: { size: 50, type: WidthType.PERCENTAGE },
                borders: noTableBorders(),
                margins: { top: 0, bottom: 0, left: 60, right: 0 },
                children: [partyBlock('Consignee', [shipment.buyer_name, shipment.buyer_address])],
              }),
            ],
          })],
          borders: noTableBorders(),
        }),
        ...spacer(1),
        itTable,
        ...spacer(1),
        infoBlocksRow([
          ['Total Net Weight (kg)', shipment.total_net_weight_kg || 'TO BE VERIFIED'],
          ['Total Gross Weight', 'TO BE VERIFIED'],
          ['Weight Unit', 'KGS'],
        ]),
        ...spacer(1),
        infoBlocksRow([
          ['Package Dimensions', 'TO BE VERIFIED'],
          ['Packing', `${shipment.total_bundles} bundles in ${shipment.total_packages || '1 checked baggage'}`],
          ['Remark', shipment.packing_remark || 'Net from unit weights; gross pending scale.'],
        ]),
      ],
    }],
  }))
}

// ────────────────────────────────────────────────────────────────────────
// 2) CERTIFICATE OF ORIGIN
// ────────────────────────────────────────────────────────────────────────
export async function makeCertificateOfOriginDocx({ supplier, shipment }) {
  const items = shipment.items || []
  const country = supplier?.country || 'Dominican Republic'
  const supplierName = supplier?.name || ''

  const para1 = `We, ${supplierName}, hereby declare and certify that the following cigar products were manufactured and packed in the ${country}, and are of ${country} origin.`
  const para2 = 'All cigars listed below are handmade, long-filler cigars produced by our factory under private branding. These products are not manufactured in Cuba and are not affiliated with, endorsed by, or produced by Habanos S.A. or any Cuban entity.'
  const para3 = `Certain packaging elements may contain references such as 'Habana, Cuba' or 'Habanos S.A.' for stylistic or nostalgic design purposes only. We confirm that all cigars listed in this document were manufactured, hand-rolled, and packed by ${supplierName} in the ${country}, and are not produced, endorsed by, or associated with Habanos S.A. or any Cuban entity.`
  const para4 = `We further declare that the above products were produced in the ${country}, and this document is issued by the manufacturer in support of customs review and origin clarification.`

  const itTable = itemsTable({
    headers: ['DESCRIPTION', 'BOX QTY', 'PCS/BOX', 'TOTAL PCS'],
    headSize: 18, bodySize: 18,
    rows: items.map(it => [
      { text: describeItem(it), align: AlignmentType.LEFT },
      it.qty_bundles, it.pcs_per_bundle, it.total_pcs,
    ]),
  })

  // 簽名區：2 cell 並排 — 左下空白(占位)、右下 signature line + Authorized Signature 標題
  const signatureBlock = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({
      children: [
        new TableCell({
          width: { size: 50, type: WidthType.PERCENTAGE },
          borders: noTableBorders(),
          children: [new Paragraph({ children: [new TextRun(' ')] })],
        }),
        new TableCell({
          width: { size: 50, type: WidthType.PERCENTAGE },
          borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER },
          margins: { top: 200, bottom: 0, left: 60, right: 60 },
          children: [
            // 簽名線 + 「Authorized Signature:」標題
            new Paragraph({
              spacing: { before: 0, after: 40 },
              border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '505050', space: 1 } },
              children: [new TextRun(' ')],
            }),
            new Paragraph({
              spacing: { before: 0, after: 0 },
              children: [new TextRun({ text: 'Authorized Signature', size: 18, color: COLOR_MUTED, font: 'Calibri' })],
            }),
          ],
        }),
      ],
    })],
    borders: noTableBorders(),
  })

  return Packer.toBlob(new Document({
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
        itTable,
        ...spacer(1),
        P(`Total Bundles: ${shipment.total_bundles}    Total Sticks: ${shipment.total_sticks}`, { size: 20, bold: true }),
        P(`Origin: ${country}`, { size: 20 }),
        P(`Factory: ${supplierName}`, { size: 20 }),
        P(`Address: ${supplier?.address || ''}`, { size: 20, after: 200 }),
        P(para4, { size: 20, after: 300 }),
        P(`Date: ${formatDate(shipment.shipment_date)}    Location: Santiago, ${country}`, { size: 20, after: 400 }),
        signatureBlock,
        P_runs([
          { text: supplier?.authorized_name || '', bold: true, size: 20 },
          { text: '    ', size: 20 },
          { text: supplier?.authorized_title || '', size: 20, color: COLOR_MUTED },
        ], { before: 80 }),
      ],
    }],
  }))
}

// ────────────────────────────────────────────────────────────────────────
// 3) COMMERCIAL INVOICE
// ────────────────────────────────────────────────────────────────────────
export async function makeCommercialInvoiceDocx({ supplier, shipment }) {
  const items = shipment.items || []
  const country = supplier?.country || 'Dominican Republic'
  const hs = shipment.hs_code || '2402.10.00.00-8'

  const itTable = itemsTable({
    headers: ['DESCRIPTION', 'HS CODE', '# STICKS', 'PRICE/STICK', 'BOX/BUNDLE (QTY)', 'TOTAL US$'],
    headSize: 14, bodySize: 16,
    rows: items.map(it => [
      { text: describeItem(it), align: AlignmentType.LEFT },
      { text: it.hs_code || hs, size: 14, align: AlignmentType.CENTER },
      { text: it.total_pcs, align: AlignmentType.CENTER },
      { text: `$${Number(it.unit_price_usd || 0).toFixed(2)}`, align: AlignmentType.RIGHT },
      { text: `${it.package_type || 'Box'} x ${it.pcs_per_bundle} (QTY ${it.qty_bundles})`, align: AlignmentType.CENTER },
      { text: `$${Number(it.subtotal || 0).toFixed(2)}`, align: AlignmentType.RIGHT },
    ]),
    footer: [
      { text: 'TOTAL', align: AlignmentType.CENTER }, '',
      { text: shipment.total_sticks, align: AlignmentType.CENTER }, '', '',
      { text: `$${Number(shipment.total_amount_usd || 0).toFixed(2)}`, align: AlignmentType.RIGHT },
    ],
  })

  // Invoice Info 右側方塊：標題深灰底 + 6 行 key (粗) value (右對齊)
  const invoiceInfoRows = [
    ['Export Invoice No.', shipment.shipment_no || ''],
    ['Incoterms', shipment.invoice_terms || 'FOB, ex-Factory'],
    ['Invoice Date', formatDate(shipment.shipment_date)],
    ['HS Code', hs],
    ['Country of Origin', country],
    ['Final Destination', 'Taiwan'],
  ]
  const invoiceInfoBlock = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [new TableCell({
          columnSpan: 2,
          shading: { type: ShadingType.SOLID, color: COLOR_GREY_FILL_DARK, fill: COLOR_GREY_FILL_DARK },
          margins: { top: 80, bottom: 80, left: 100, right: 100 },
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: 'Invoice Info', bold: true, size: 20, color: '282828', font: 'Calibri' })],
          })],
        })],
      }),
      ...invoiceInfoRows.map(([k, v]) => new TableRow({
        children: [
          cell({ text: k + ':', bold: true, size: 17, align: AlignmentType.LEFT, fill: COLOR_GREY_FILL_LIGHT }),
          cell({ text: v, size: 17, align: AlignmentType.RIGHT }),
        ],
      })),
    ],
    borders: fullTableBorders(),
  })

  // Bill-to-party + Invoice Info 並排 (左 / 右)
  const headerRow = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({
      children: [
        new TableCell({
          width: { size: 60, type: WidthType.PERCENTAGE },
          borders: noTableBorders(),
          margins: { top: 0, bottom: 0, left: 0, right: 80 },
          verticalAlign: VerticalAlign.TOP,
          children: [partyBlock('Bill-to-party', [shipment.buyer_name, shipment.buyer_address])],
        }),
        new TableCell({
          width: { size: 40, type: WidthType.PERCENTAGE },
          borders: noTableBorders(),
          margins: { top: 0, bottom: 0, left: 80, right: 0 },
          verticalAlign: VerticalAlign.TOP,
          children: [invoiceInfoBlock],
        }),
      ],
    })],
    borders: noTableBorders(),
  })

  // Wire Instruction box (灰底)
  const wireInstruction = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [new TableCell({
          columnSpan: 2,
          shading: { type: ShadingType.SOLID, color: COLOR_GREY_FILL, fill: COLOR_GREY_FILL },
          margins: { top: 100, bottom: 60, left: 120, right: 120 },
          children: [new Paragraph({
            children: [new TextRun({ text: 'Wire Instruction / Bank Information', bold: true, size: 20, color: COLOR_TEXT, font: 'Calibri' })],
          })],
        })],
      }),
      ...[
        ['Account Name', supplier?.bank_account_name || ''],
        ['Bank Name', supplier?.bank_name || ''],
        ['Account #', supplier?.bank_account || ''],
        ['SWIFT', supplier?.bank_swift || ''],
      ].map(([k, v]) => new TableRow({
        children: [
          new TableCell({
            width: { size: 30, type: WidthType.PERCENTAGE },
            shading: { type: ShadingType.SOLID, color: COLOR_GREY_FILL, fill: COLOR_GREY_FILL },
            margins: { top: 40, bottom: 40, left: 120, right: 120 },
            children: [new Paragraph({
              children: [new TextRun({ text: k + ':', bold: true, size: 18, color: COLOR_TEXT, font: 'Calibri' })],
            })],
          }),
          new TableCell({
            width: { size: 70, type: WidthType.PERCENTAGE },
            shading: { type: ShadingType.SOLID, color: COLOR_GREY_FILL, fill: COLOR_GREY_FILL },
            margins: { top: 40, bottom: 40, left: 80, right: 120 },
            children: [new Paragraph({
              children: [new TextRun({ text: s(v), size: 18, color: COLOR_TEXT, font: 'Calibri' })],
            })],
          }),
        ],
      })),
    ],
    borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER },
  })

  // Sent by / Prepared by 兩 cell 並排
  const signatureFooter = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({
      children: [
        new TableCell({
          width: { size: 50, type: WidthType.PERCENTAGE },
          borders: noTableBorders(),
          children: [new Paragraph({
            children: [new TextRun({ text: `Sent by: ${supplier?.name || ''}`, size: 18, color: COLOR_TEXT, font: 'Calibri' })],
          })],
        }),
        new TableCell({
          width: { size: 50, type: WidthType.PERCENTAGE },
          borders: noTableBorders(),
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: 'Prepared by: Lic. Claribel Paulino', size: 18, color: COLOR_TEXT, font: 'Calibri' })],
          })],
        }),
      ],
    })],
    borders: noTableBorders(),
  })

  const children = [
    ...headerBlock(supplier),
    // RNC + Email 在 logo 下方左對齊小字
    P(`RNC: ${supplier?.rnc || ''}`, { size: 16, color: COLOR_MUTED, align: AlignmentType.LEFT }),
    P(`Email: ${supplier?.email || ''}`, { size: 16, color: COLOR_MUTED, align: AlignmentType.LEFT, after: 200 }),
    titleBar('EXPORT INVOICE'),
    headerRow,
    ...spacer(1),
  ]
  if (shipment.notify_to) {
    children.push(partyBlock('Notify To', [shipment.notify_to]), ...spacer(1))
  }
  children.push(
    itTable,
    ...spacer(1),
    P(`No. of pieces shipped: ${shipment.total_sticks} sticks (${shipment.total_bundles} boxes/bundles).`, { size: 18 }),
    P(`Please pay to ${supplier?.name || ''} directly. No reclaims 30 days after shipping date.`, { size: 18 }),
    P(`Country of Origin: ${country}.    Final Destination: Taiwan.    HS Code: ${hs}`, { size: 18, after: 200 }),
    wireInstruction,
    ...spacer(1),
    signatureFooter,
  )

  return Packer.toBlob(new Document({
    sections: [{
      properties: { page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } } },
      children,
    }],
  }))
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

export function downloadDocx(blob, filename) { saveAs(blob, filename) }

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
