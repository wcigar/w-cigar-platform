import { generateAllDocsDocx } from './src/lib/services/customsDocx.js'
import fs from 'fs'

const supplier = {
  name: 'Tabacos Don Esteban',
  address: 'Zona Industrial, Santiago, Dominican Republic',
  country: 'Dominican Republic',
  tel: '+1 (809) 570-7111',
  email: 'donesteban97@gmail.com',
  rnc: '1-0174857-5',
  bank_account_name: 'TABACOS DON ESTEBAN',
  bank_name: 'Banco Popular',
  bank_account: '900-2345678-9',
  bank_swift: 'BPDODOSXXX',
  authorized_name: 'Lic. Claribel Paulino',
  authorized_title: 'Sales Manager',
}

const shipment = {
  shipment_no: 'INV-260513-TEST',
  shipment_date: '2026-05-13',
  buyer_name: 'CAPADURA Co. Ltd',
  buyer_address: 'No.123 Some Road, Taipei City, Taiwan',
  shipment_method: 'Passenger checked baggage',
  total_packages: '1 checked baggage',
  invoice_terms: 'FOB, ex-Factory',
  notify_to: 'ABC Logistics Co. Ltd',
  packing_remark: 'Net from unit weights; gross pending scale.',
  total_bundles: 5, total_sticks: 125, total_amount_usd: 625, total_net_weight_kg: 1.875,
  items: [
    { name: 'Don Esteban Robusto', pcs_per_bundle: 25, package_type: 'Bundle', unit_weight_g: 15, unit_price_usd: 5, qty_bundles: 5, total_pcs: 125, subtotal: 625 },
  ],
}

const { packingList, coo, invoice } = await generateAllDocsDocx({ supplier, shipment })
fs.writeFileSync('/tmp/PackingList.docx', Buffer.from(await packingList.arrayBuffer()))
fs.writeFileSync('/tmp/CertificateOfOrigin.docx', Buffer.from(await coo.arrayBuffer()))
fs.writeFileSync('/tmp/CommercialInvoice.docx', Buffer.from(await invoice.arrayBuffer()))
console.log('3 docx 已寫到 /tmp/')
console.log(`PackingList: ${fs.statSync('/tmp/PackingList.docx').size} bytes`)
console.log(`COO: ${fs.statSync('/tmp/CertificateOfOrigin.docx').size} bytes`)
console.log(`Invoice: ${fs.statSync('/tmp/CommercialInvoice.docx').size} bytes`)
