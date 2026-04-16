/**
 * POS → VIP 窖藏橋接
 * 結帳後自動建立 VIP 訂單 + 入櫃紀錄 + 扣庫存 + 庫存異動紀錄
 */
import { supabase } from '../lib/supabase'

function genOrderNo() {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return `VIP-${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

/**
 * POS 結帳 → VIP 窖藏系統
 * @param {Object} params
 * @param {Object} params.customer  - { id, name, vip_code, cabinet_no }
 * @param {Array}  params.items     - [{ id, name, price, qty, destination:'入櫃'|'外帶'|'現場抽', cabinet_no, inv_master_id }]
 * @param {Object} params.staff     - { id, name }
 * @param {string} params.signatureUrl - base64 簽名圖
 * @param {string} params.paymentMethod
 * @param {number} params.totalAmount
 * @returns {{ orderNo, orderId, cabinetItems, customer, storedDate }}
 */
export async function bridgePosToCellar({ customer, items, staff, signatureUrl, paymentMethod, totalAmount }) {
  const orderNo = genOrderNo()
  const cabinetItems = items.filter(i => i.destination === '入櫃')

  // ── 1. 建立 VIP 訂單 ──
  const { data: order, error: orderErr } = await supabase
    .from('vip_orders')
    .insert({
      order_no: orderNo,
      vip_id: customer.id,
      vip_name: customer.name,
      order_type: '現貨購買',
      order_total: totalAmount,
      paid_amount: totalAmount,
      balance: 0,
      status: '已沖平結清',
      staff_id: staff.id,
      staff_name: staff.name,
      notes: 'POS結帳自動建立'
    })
    .select('id')
    .single()

  if (orderErr) throw new Error('建立VIP訂單失敗: ' + orderErr.message)

  // ── 2. 建立訂單明細 ──
  const orderItems = items.map(item => ({
    order_id: order.id,
    order_no: orderNo,
    product_name: item.name,
    qty_ordered: item.qty,
    qty_delivered: item.qty,
    qty_pending: 0,
    unit_price: item.price,
    subtotal: item.price * item.qty,
    destination: item.destination,
    cabinet_no: item.destination === '入櫃' ? (item.cabinet_no || customer.cabinet_no || 'A1') : null,
    status: '已交付'
  }))

  const { error: itemsErr } = await supabase
    .from('vip_order_items')
    .insert(orderItems)

  if (itemsErr) throw new Error('建立訂單明細失敗: ' + itemsErr.message)

  // ── 3. 入櫃商品 → upsert vip_cabinets ──
  for (const item of cabinetItems) {
    const cabNo = item.cabinet_no || customer.cabinet_no || 'A1'
    const { data: existing } = await supabase
      .from('vip_cabinets')
      .select('id, quantity')
      .eq('vip_id', customer.id)
      .eq('cabinet_no', cabNo)
      .eq('product_name', item.name)
      .maybeSingle()

    if (existing) {
      await supabase
        .from('vip_cabinets')
        .update({
          quantity: existing.quantity + item.qty,
          market_value: (existing.quantity + item.qty) * item.price,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id)
    } else {
      await supabase
        .from('vip_cabinets')
        .insert({
          vip_id: customer.id,
          cabinet_no: cabNo,
          product_name: item.name,
          cigar_name: item.name,
          quantity: item.qty,
          unit_price: item.price,
          market_value: item.price * item.qty,
          stored_date: new Date().toISOString().slice(0, 10),
          stored_at: new Date().toISOString()
        })
    }
  }

  // ── 4. 扣總庫存 + 寫異動紀錄 ──
  for (const item of items) {
    if (!item.inv_master_id) continue
    const { data: stock } = await supabase
      .from('inventory_master')
      .select('current_stock')
      .eq('id', item.inv_master_id)
      .single()

    if (stock) {
      const newStock = Math.max(0, stock.current_stock - item.qty)
      await supabase
        .from('inventory_master')
        .update({
          current_stock: newStock,
          last_update: new Date().toISOString(),
          is_low: newStock <= 5
        })
        .eq('id', item.inv_master_id)

      await supabase
        .from('stock_transactions')
        .insert({
          inv_master_id: item.inv_master_id,
          product_id: item.id,
          channel: 'POS_VIP',
          direction: 'out',
          quantity: item.qty,
          unit: '支',
          notes: `VIP購買(${item.destination}) - ${customer.name} - ${orderNo}`,
          handled_by: staff.name
        })
    }
  }

  // ── 5. 付款紀錄 ──
  await supabase
    .from('vip_payments')
    .insert({
      order_id: order.id,
      order_no: orderNo,
      vip_id: customer.id,
      amount: totalAmount,
      payment_method: paymentMethod || '現金',
      staff_id: staff.id,
      staff_name: staff.name,
      receipt_url: signatureUrl || null,
      notes: 'POS結帳付款'
    })

  return {
    orderNo,
    orderId: order.id,
    cabinetItems: cabinetItems.map(i => ({
      ...i,
      cabinet_no: i.cabinet_no || customer.cabinet_no || 'A1'
    })),
    customer,
    storedDate: new Date().toISOString().slice(0, 10)
  }
}
