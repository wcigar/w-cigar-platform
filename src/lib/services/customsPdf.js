// ============================================================
// 報關文件 PDF 產生器
//   - Packing List (裝箱單)
//   - Certificate of Origin / Manufacturer's Declaration (產地證明)
//   - Commercial Invoice (商業發票)
// 純前端 jsPDF + autoTable, 手機亦可用
// ============================================================
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

function formatDate(d) {
  if (!d) return ''
  const dt = typeof d === 'string' ? new Date(d) : d
  return dt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

function header(doc, supplier) {
  doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(20, 20, 20)
  doc.text('TDE', 92, 18, { align: 'right' })
  doc.setFontSize(11); doc.text('TABACOS', 96, 14); doc.text('DON ESTEBAN', 96, 20)
  doc.setDrawColor(180, 180, 180); doc.setLineWidth(0.3); doc.line(20, 26, 190, 26)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(80, 80, 80)
  doc.text(supplier?.address || '', 105, 32, { align: 'center' })
  const contact = [supplier?.tel ? `Tel: ${supplier.tel}` : '', supplier?.email ? `Email: ${supplier.email}` : ''].filter(Boolean).join('   ')
  doc.text(contact, 105, 37, { align: 'center' })
}

function titleBar(doc, title, y = 48) {
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(20, 20, 20)
  doc.text(title, 105, y, { align: 'center' })
}

function infoBlock(doc, label, value, x, y, w = 50) {
  doc.setFillColor(245, 245, 245); doc.rect(x, y, w, 9, 'F')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(60, 60, 60)
  doc.text(label, x + w / 2, y + 5.5, { align: 'center' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(20, 20, 20)
  doc.text(String(value ?? ''), x + w / 2, y + 14, { align: 'center', maxWidth: w - 4 })
}

function partyBlock(doc, label, lines, x, y, w = 80) {
  doc.setFillColor(235, 235, 235); doc.rect(x, y, w, 8, 'F')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(40, 40, 40)
  doc.text(label, x + w / 2, y + 5.5, { align: 'center' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(30, 30, 30)
  let cy = y + 13
  lines.filter(Boolean).forEach((ln) => { doc.text(String(ln), x + 2, cy, { maxWidth: w - 4 }); cy += 4.5 })
}

// ===== 1) Packing List =====
export function makePackingList({ supplier, shipment }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  header(doc, supplier); titleBar(doc, 'PACKING LIST', 48)
  infoBlock(doc, 'Date', formatDate(shipment.shipment_date), 20, 56, 40)
  infoBlock(doc, 'Country of Origin', supplier?.country || 'Dominican Republic', 65, 56, 40)
  infoBlock(doc, 'Shipment Method', shipment.shipment_method || 'Passenger checked baggage', 110, 56, 40)
  infoBlock(doc, 'Total Packages', shipment.total_packages || '1 checked baggage', 155, 56, 35)
  const exporterY = 80
  partyBlock(doc, 'Exporter', [supplier?.name, supplier?.address, supplier?.country], 20, exporterY, 80)
  partyBlock(doc, 'Consignee', [shipment.buyer_name, shipment.buyer_address], 110, exporterY, 80)
  const items = shipment.items || []
  autoTable(doc, {
    startY: exporterY + 35,
    head: [['DESCRIPTION', 'BUNDLES', 'PCS/BUNDLE', 'TOTAL PCS', 'PACKAGE TYPE']],
    body: items.map(it => [it.name, it.qty_bundles, it.pcs_per_bundle, it.total_pcs, it.package_type || 'Bundle']),
    foot: [['TOTAL', shipment.total_bundles, '', shipment.total_sticks, `${shipment.total_bundles} ${items[0]?.package_type || 'Bundles'}`]],
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2.5, halign: 'center' },
    headStyles: { fillColor: [70, 70, 70], textColor: 255, fontStyle: 'bold' },
    footStyles: { fillColor: [220, 220, 220], textColor: 20, fontStyle: 'bold' },
    columnStyles: { 0: { halign: 'left', cellWidth: 60 } },
  })
  const wY = doc.lastAutoTable.finalY + 8
  infoBlock(doc, 'Total Net Weight', shipment.total_net_weight_kg || 'TO BE VERIFIED', 30, wY, 50)
  infoBlock(doc, 'Total Gross Weight', 'TO BE VERIFIED', 85, wY, 50)
  infoBlock(doc, 'Weight Unit', 'KGS', 30, wY + 22, 50)
  infoBlock(doc, 'Package Dimensions', 'TO BE VERIFIED', 85, wY + 22, 50)
  infoBlock(doc, 'Packing', `${shipment.total_bundles} bundles in ${shipment.total_packages || '1 checked baggage'}`, 30, wY + 44, 50)
  infoBlock(doc, 'Remark', shipment.packing_remark || 'Net from unit weights; gross pending scale.', 85, wY + 44, 50)
  return doc
}

// ===== 2) Certificate of Origin =====
export function makeCertificateOfOrigin({ supplier, shipment }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  header(doc, supplier); titleBar(doc, "MANUFACTURER'S DECLARATION OF ORIGIN", 48)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(30, 30, 30)
  let y = 60
  doc.text('To Whom It May Concern:', 20, y); y += 8
  const para1 = `We, ${supplier?.name || ''}, hereby declare and certify that the following cigar products were manufactured and packed in the ${supplier?.country || 'Dominican Republic'}, and are of ${supplier?.country || 'Dominican Republic'} origin.`
  doc.text(doc.splitTextToSize(para1, 170), 20, y); y += 14
  const para2 = 'All cigars listed below are handmade, long-filler cigars produced by our factory under private branding. These products are not manufactured in Cuba and are not affiliated with, endorsed by, or produced by Habanos S.A. or any Cuban entity.'
  doc.text(doc.splitTextToSize(para2, 170), 20, y); y += 14
  doc.setFont('helvetica', 'bold'); doc.text('Packaging Clarification:', 20, y); y += 5
  doc.setFont('helvetica', 'normal')
  const para3 = "Certain packaging elements may contain references such as 'Habana, Cuba' or 'Habanos S.A.' for stylistic or nostalgic design purposes only. We confirm that all cigars listed in this document were manufactured, hand-rolled, and packed by " + (supplier?.name || '') + " in the " + (supplier?.country || 'Dominican Republic') + ", and are not produced, endorsed by, or associated with Habanos S.A. or any Cuban entity."
  doc.text(doc.splitTextToSize(para3, 170), 20, y); y += 22
  doc.setFont('helvetica', 'bold'); doc.text('Product Details:', 20, y); y += 3
  const items = shipment.items || []
  autoTable(doc, {
    startY: y,
    head: [['DESCRIPTION', 'BOX QTY', 'PCS/BOX', 'TOTAL PCS']],
    body: items.map(it => [it.name, it.qty_bundles, it.pcs_per_bundle, it.total_pcs]),
    theme: 'grid', styles: { fontSize: 9, cellPadding: 2.2 },
    headStyles: { fillColor: [70, 70, 70], textColor: 255, fontStyle: 'bold', halign: 'center' },
    columnStyles: { 0: { halign: 'left', cellWidth: 95 }, 1: { halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'center' } },
  })
  let fy = doc.lastAutoTable.finalY + 6
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
  doc.text(`Total Bundles: ${shipment.total_bundles}    Total Sticks: ${shipment.total_sticks}`, 20, fy); fy += 6
  doc.setFont('helvetica', 'normal')
  doc.text(`Origin: ${supplier?.country || 'Dominican Republic'}`, 20, fy); fy += 5
  doc.text(`Factory: ${supplier?.name || ''}`, 20, fy); fy += 5
  doc.text(`Address: ${supplier?.address || ''}`, 20, fy); fy += 8
  const para4 = `We further declare that the above products were produced in the ${supplier?.country || 'Dominican Republic'}, and this document is issued by the manufacturer in support of customs review and origin clarification.`
  doc.text(doc.splitTextToSize(para4, 170), 20, fy); fy += 12
  doc.text(`Date: ${formatDate(shipment.shipment_date)}    Location: Santiago, ${supplier?.country || 'Dominican Republic'}`, 20, fy); fy += 18
  doc.setDrawColor(80, 80, 80); doc.line(125, fy, 185, fy)
  doc.setFontSize(9); doc.text('Authorized Signature:', 125, fy - 3); fy += 6
  doc.setFont('helvetica', 'bold'); doc.text(`${supplier?.authorized_name || ''}    ${supplier?.authorized_title || ''}`, 20, fy)
  return doc
}

// ===== 3) Commercial Invoice =====
export function makeCommercialInvoice({ supplier, shipment }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  header(doc, supplier)
  doc.setFontSize(8); doc.setTextColor(80, 80, 80)
  doc.text(`RNC: ${supplier?.rnc || ''}`, 20, 42)
  doc.text(`Email: ${supplier?.email || ''}`, 20, 46)
  titleBar(doc, 'EXPORT INVOICE', 54)
  let y = 60
  partyBlock(doc, 'Bill-to-party', [shipment.buyer_name, shipment.buyer_address], 20, y, 95)
  doc.setFillColor(235, 235, 235); doc.rect(120, y, 70, 8, 'F')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(40, 40, 40)
  doc.text('Invoice Info', 155, y + 5.5, { align: 'center' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(30, 30, 30)
  let iy = y + 13
  const rows = [
    ['Export Invoice No.', shipment.shipment_no || ''],
    ['Incoterms', shipment.invoice_terms || 'FOB, ex-Factory'],
    ['Invoice Date', formatDate(shipment.shipment_date)],
    ['Country of Origin', supplier?.country || 'Dominican Republic'],
    ['Final Destination', 'Taiwan'],
  ]
  rows.forEach(([k, v]) => {
    doc.setFont('helvetica', 'bold'); doc.text(k + ':', 122, iy)
    doc.setFont('helvetica', 'normal'); doc.text(String(v), 188, iy, { align: 'right' })
    iy += 5
  })
  if (shipment.notify_to) partyBlock(doc, 'Notify To', [shipment.notify_to], 20, y + 40, 170)
  const items = shipment.items || []
  const startY = (shipment.notify_to ? y + 65 : y + 50)
  autoTable(doc, {
    startY,
    head: [['DESCRIPTION', '# STICKS', 'PRICE / STICK', 'BOX/BUNDLE (QTY)', 'TOTAL US$']],
    body: items.map(it => [
      it.name, it.total_pcs,
      `$${Number(it.unit_price_usd || 0).toFixed(2)}`,
      `${it.package_type || 'Box'} x ${it.pcs_per_bundle} (QTY ${it.qty_bundles})`,
      `$${Number(it.subtotal || 0).toFixed(2)}`,
    ]),
    foot: [['TOTAL', shipment.total_sticks, '', '', `$${Number(shipment.total_amount_usd || 0).toFixed(2)}`]],
    theme: 'grid', styles: { fontSize: 8.5, cellPadding: 2 },
    headStyles: { fillColor: [70, 70, 70], textColor: 255, fontStyle: 'bold', halign: 'center' },
    footStyles: { fillColor: [220, 220, 220], textColor: 20, fontStyle: 'bold', halign: 'right' },
    columnStyles: {
      0: { halign: 'left', cellWidth: 70 },
      1: { halign: 'center', cellWidth: 18 },
      2: { halign: 'right', cellWidth: 25 },
      3: { halign: 'center' },
      4: { halign: 'right', cellWidth: 25 },
    },
  })
  let fy = doc.lastAutoTable.finalY + 6
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30)
  doc.text(`No. of pieces shipped: ${shipment.total_sticks} sticks (${shipment.total_bundles} boxes/bundles).`, 20, fy); fy += 5
  doc.text(`Please pay to ${supplier?.name || ''} directly. No reclaims 30 days after shipping date.`, 20, fy); fy += 5
  doc.text(`Country of Origin: ${supplier?.country || 'Dominican Republic'}.    Final Destination: Taiwan.`, 20, fy); fy += 10
  doc.setFillColor(245, 245, 245); doc.rect(20, fy, 170, 28, 'F')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
  doc.text('Wire Instruction / Bank Information', 25, fy + 6)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
  doc.text(`Account Name: ${supplier?.bank_account_name || ''}`, 25, fy + 12)
  doc.text(`Bank Name:    ${supplier?.bank_name || ''}`, 25, fy + 17)
  doc.text(`Account #:    ${supplier?.bank_account || ''}`, 25, fy + 22)
  doc.text(`SWIFT:        ${supplier?.bank_swift || ''}`, 25, fy + 27)
  fy += 36
  doc.setFontSize(9)
  doc.text(`Sent by: ${supplier?.name || ''}`, 20, fy)
  doc.text(`Prepared by: Lic. Claribel Paulino`, 110, fy)
  return doc
}

export function generateAllDocs({ supplier, shipment }) {
  return {
    packingList: makePackingList({ supplier, shipment }),
    coo:         makeCertificateOfOrigin({ supplier, shipment }),
    invoice:     makeCommercialInvoice({ supplier, shipment }),
  }
}

export function downloadPdf(doc, filename) { doc.save(filename) }

export async function sharePdfFiles(files) {
  const fileObjs = files.map(({ doc, filename }) => {
    const blob = doc.output('blob')
    return new File([blob], filename, { type: 'application/pdf' })
  })
  if (navigator.share && navigator.canShare && navigator.canShare({ files: fileObjs })) {
    try {
      await navigator.share({ title: '報關文件', text: '雪茄報關文件', files: fileObjs })
      return { ok: true, method: 'share' }
    } catch (e) {
      if (e.name === 'AbortError') return { ok: false, method: 'cancelled' }
    }
  }
  files.forEach(({ doc, filename }) => doc.save(filename))
  return { ok: true, method: 'download' }
}

export function computeShipmentTotals(items) {
  let total_bundles = 0, total_sticks = 0, total_amount_usd = 0, total_net_weight_g = 0
  items.forEach(it => {
    const tp = (it.qty_bundles || 0) * (it.pcs_per_bundle || 0)
    it.total_pcs = tp
    it.subtotal = +(tp * (it.unit_price_usd || 0)).toFixed(2)
    total_bundles += (it.qty_bundles || 0)
    total_sticks += tp
    total_amount_usd += it.subtotal
    total_net_weight_g += tp * (it.unit_weight_g || 15)
  })
  return {
    total_bundles, total_sticks,
    total_amount_usd: +total_amount_usd.toFixed(2),
    total_net_weight_kg: +(total_net_weight_g / 1000).toFixed(3),
  }
}
