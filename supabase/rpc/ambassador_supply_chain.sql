-- ============================================================================
-- RPC / Function drafts: ambassador_supply_chain
-- Status: DRAFT — DO NOT APPLY until migration is applied and confirmed.
-- 所有函數標註 🔴 MVP 必要 / 🟡 Phase 2
-- ============================================================================

-- ============================================================================
-- 🔴 ambassador_login
--   Input: p_code text (大使代碼或手機), p_password text
--   Output: JSON { success, ambassador_id, ambassador_code, name, phone,
--                  default_venue_id, role, expires_at, error? }
--   權限: SECURITY DEFINER（客戶端 anon 可呼叫）
-- ============================================================================
CREATE OR REPLACE FUNCTION ambassador_login(p_code TEXT, p_password TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v ambassadors%ROWTYPE;
BEGIN
  SELECT * INTO v FROM ambassadors
  WHERE is_active = true
    AND (ambassador_code = p_code OR phone = p_code)
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '查無此大使或已停用');
  END IF;

  -- MVP: pin_hash 存明碼比對；Phase 2 改 crypt()
  IF v.pin_hash IS NULL OR v.pin_hash <> p_password THEN
    RETURN jsonb_build_object('success', false, 'error', 'PIN 錯誤');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'ambassador_id', v.id,
    'ambassador_code', v.ambassador_code,
    'name', v.name,
    'phone', v.phone,
    'default_venue_id', v.default_venue_id,
    'role', 'ambassador',
    'expires_at', (now() + interval '12 hours')
  );
END $$;

-- ============================================================================
-- 🔴 hq_submit_venue_sales
-- ============================================================================
CREATE OR REPLACE FUNCTION hq_submit_venue_sales(payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_sale_id UUID;
BEGIN
  INSERT INTO venue_sales_daily (
    sale_date, venue_id, ambassador_id,
    total_amount, cash_amount, transfer_amount, monthly_amount, unpaid_amount,
    payment_status, note, created_by
  ) VALUES (
    (payload->>'sale_date')::DATE,
    (payload->>'venue_id')::UUID,
    NULLIF(payload->>'ambassador_id','')::UUID,
    COALESCE((payload->>'total_amount')::NUMERIC, 0),
    COALESCE((payload->>'cash_amount')::NUMERIC, 0),
    COALESCE((payload->>'transfer_amount')::NUMERIC, 0),
    COALESCE((payload->>'monthly_amount')::NUMERIC, 0),
    COALESCE((payload->>'unpaid_amount')::NUMERIC, 0),
    COALESCE(payload->>'payment_status', 'paid'),
    payload->>'note',
    NULLIF(payload->>'created_by','')::UUID
  ) RETURNING id INTO v_sale_id;

  -- 寫明細
  INSERT INTO venue_sales_items (sale_id, product_id, quantity, unit_price)
  SELECT v_sale_id, (i->>'product_id')::UUID, (i->>'quantity')::INT, (i->>'unit_price')::NUMERIC
  FROM jsonb_array_elements(payload->'items') i;

  -- 未收款 → 自動建立 collection_record
  IF COALESCE((payload->>'unpaid_amount')::NUMERIC, 0) > 0
     OR COALESCE((payload->>'monthly_amount')::NUMERIC, 0) > 0 THEN
    INSERT INTO collection_records (sale_id, due_amount, supervisor_id, due_date)
    SELECT v_sale_id,
           COALESCE((payload->>'unpaid_amount')::NUMERIC,0) + COALESCE((payload->>'monthly_amount')::NUMERIC,0),
           v.supervisor_id,
           current_date + interval '7 days'
    FROM venues v WHERE v.id = (payload->>'venue_id')::UUID;
  END IF;

  RETURN jsonb_build_object('success', true, 'sale_id', v_sale_id);
END $$;

-- ============================================================================
-- 🔴 generate_daily_replenishment
--   MVP 邏輯：今日賣多少補多少（按 venue + product 匯總當日 sold_qty）
-- ============================================================================
CREATE OR REPLACE FUNCTION generate_daily_replenishment(p_run_date DATE DEFAULT current_date)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_run_id UUID;
  v_items_count INT;
BEGIN
  INSERT INTO replenishment_runs (run_date, status) VALUES (p_run_date, 'draft')
  RETURNING id INTO v_run_id;

  INSERT INTO replenishment_items (run_id, venue_id, product_id, sold_qty, suggested_qty)
  SELECT v_run_id, s.venue_id, vi.product_id, SUM(vi.quantity), SUM(vi.quantity)
  FROM venue_sales_daily s
  JOIN venue_sales_items vi ON vi.sale_id = s.id
  WHERE s.sale_date = p_run_date AND s.status = 'active'
  GROUP BY s.venue_id, vi.product_id;

  SELECT COUNT(*) INTO v_items_count FROM replenishment_items WHERE run_id = v_run_id;
  UPDATE replenishment_runs SET total_items = v_items_count WHERE id = v_run_id;

  RETURN jsonb_build_object('success', true, 'run_id', v_run_id, 'items_count', v_items_count);
END $$;

-- ============================================================================
-- 🔴 warehouse_confirm_pick / warehouse_ship_replenishment
-- （略；結構同上，簽名：
--    warehouse_confirm_pick(p_run_id UUID, p_items JSONB) RETURNS JSONB
--    warehouse_ship_replenishment(p_shipment_id UUID) RETURNS JSONB
-- ）
-- ============================================================================

-- ============================================================================
-- 🔴 ambassador_get_pending_receipts(p_ambassador_id UUID)
-- ============================================================================
CREATE OR REPLACE FUNCTION ambassador_get_pending_receipts(p_ambassador_id UUID)
RETURNS SETOF JSONB LANGUAGE sql SECURITY DEFINER AS $$
  SELECT jsonb_build_object(
    'receipt_id', ar.id,
    'shipment_no', ws.shipment_no,
    'venue_name', v.name,
    'items_count', (SELECT COUNT(*) FROM warehouse_shipment_items WHERE shipment_id = ws.id),
    'shipped_at', ws.shipped_at
  )
  FROM ambassador_receipts ar
  JOIN warehouse_shipments ws ON ws.id = ar.shipment_id
  JOIN venues v ON v.id = ar.venue_id
  WHERE ar.ambassador_id = p_ambassador_id AND ar.status = 'pending'
  ORDER BY ws.shipped_at;
$$;

-- ============================================================================
-- 🔴 ambassador_confirm_receipt(p_receipt_id UUID)
-- ============================================================================
CREATE OR REPLACE FUNCTION ambassador_confirm_receipt(p_receipt_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE ambassador_receipts SET status='confirmed', confirmed_at=now() WHERE id=p_receipt_id;
  RETURN jsonb_build_object('success', true);
END $$;

-- ============================================================================
-- 🔴 ambassador_report_receipt_error(p_receipt_id UUID, p_discrepancies JSONB)
--   同時寫 exception_events
-- ============================================================================
CREATE OR REPLACE FUNCTION ambassador_report_receipt_error(p_receipt_id UUID, p_discrepancies JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE ambassador_receipts SET status='discrepancy' WHERE id=p_receipt_id;

  INSERT INTO ambassador_receipt_discrepancies (receipt_id, product_id, issue_type, reported_qty, note)
  SELECT p_receipt_id, (d->>'product_id')::UUID, d->>'issue_type',
         NULLIF(d->>'reported_qty','')::INT, d->>'note'
  FROM jsonb_array_elements(p_discrepancies) d;

  INSERT INTO exception_events (category, severity, title, ref_type, ref_id, ambassador_id, venue_id)
  SELECT 'receipt_qty_mismatch', 'warning',
         '大使收貨異常：' || ws.shipment_no, 'ambassador_receipts', p_receipt_id,
         ar.ambassador_id, ar.venue_id
  FROM ambassador_receipts ar
  JOIN warehouse_shipments ws ON ws.id = ar.shipment_id
  WHERE ar.id = p_receipt_id;

  RETURN jsonb_build_object('success', true);
END $$;

-- ============================================================================
-- 🔴 ambassador_submit_supply_request (payload JSONB)
--   payload: { ambassador_id, venue_id, urgency, reason, note, items:[{code|supply_item_id, custom_name, qty}] }
-- ============================================================================
CREATE OR REPLACE FUNCTION ambassador_submit_supply_request(payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_req_id UUID;
  v_high BOOLEAN;
BEGIN
  INSERT INTO ambassador_supply_requests (ambassador_id, venue_id, urgency, reason, note, status)
  VALUES (
    (payload->>'ambassador_id')::UUID,
    NULLIF(payload->>'venue_id','')::UUID,
    COALESCE(payload->>'urgency','normal'),
    payload->>'reason',
    payload->>'note',
    'submitted'
  ) RETURNING id INTO v_req_id;

  INSERT INTO ambassador_supply_request_items (request_id, supply_item_id, custom_name, requested_qty)
  SELECT v_req_id,
         COALESCE((i->>'supply_item_id')::UUID, (SELECT id FROM supply_items WHERE code = (i->>'code'))),
         i->>'custom_name',
         (i->>'qty')::INT
  FROM jsonb_array_elements(payload->'items') i;

  SELECT bool_or(si.is_high_risk) INTO v_high
  FROM ambassador_supply_request_items asri
  JOIN supply_items si ON si.id = asri.supply_item_id
  WHERE asri.request_id = v_req_id;

  UPDATE ambassador_supply_requests SET has_high_risk = COALESCE(v_high,false) WHERE id = v_req_id;

  RETURN jsonb_build_object('success', true, 'request_id', v_req_id, 'has_high_risk', v_high);
END $$;

-- ============================================================================
-- 🔴 ambassador_get_my_supply_requests(p_ambassador_id UUID)
-- ============================================================================
CREATE OR REPLACE FUNCTION ambassador_get_my_supply_requests(p_ambassador_id UUID)
RETURNS SETOF JSONB LANGUAGE sql SECURITY DEFINER AS $$
  SELECT jsonb_build_object(
    'id', asr.id, 'request_date', asr.request_date, 'urgency', asr.urgency,
    'status', asr.status, 'has_high_risk', asr.has_high_risk, 'reason', asr.reason,
    'items_count', (SELECT COUNT(*) FROM ambassador_supply_request_items WHERE request_id = asr.id)
  )
  FROM ambassador_supply_requests asr
  WHERE asr.ambassador_id = p_ambassador_id
  ORDER BY asr.request_date DESC, asr.created_at DESC;
$$;

-- ============================================================================
-- 🔴 hq_get_supply_requests(p_filter JSONB)
-- ============================================================================
CREATE OR REPLACE FUNCTION hq_get_supply_requests(p_filter JSONB DEFAULT '{}'::JSONB)
RETURNS SETOF JSONB LANGUAGE sql SECURITY DEFINER AS $$
  SELECT jsonb_build_object(
    'id', asr.id, 'ambassador_name', a.name, 'venue_name', v.name,
    'request_date', asr.request_date, 'urgency', asr.urgency,
    'status', asr.status, 'has_high_risk', asr.has_high_risk,
    'items_count', (SELECT COUNT(*) FROM ambassador_supply_request_items WHERE request_id = asr.id)
  )
  FROM ambassador_supply_requests asr
  JOIN ambassadors a ON a.id = asr.ambassador_id
  LEFT JOIN venues v ON v.id = asr.venue_id
  WHERE (p_filter->>'status' IS NULL OR asr.status = p_filter->>'status')
  ORDER BY asr.request_date DESC;
$$;

-- ============================================================================
-- 🔴 hq_review_supply_request(p_request_id UUID, p_decision TEXT, p_overrides JSONB, p_reason TEXT)
--   p_decision: 'approve' | 'adjust_approve' | 'reject'
-- ============================================================================
CREATE OR REPLACE FUNCTION hq_review_supply_request(p_request_id UUID, p_decision TEXT,
                                                    p_overrides JSONB DEFAULT NULL,
                                                    p_reason TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF p_decision = 'reject' THEN
    UPDATE ambassador_supply_requests
    SET status='rejected', rejection_reason=p_reason, reviewed_at=now()
    WHERE id=p_request_id;
    RETURN jsonb_build_object('success', true, 'status', 'rejected');
  ELSIF p_decision = 'adjust_approve' THEN
    UPDATE ambassador_supply_requests SET status='adjusted_approved', reviewed_at=now() WHERE id=p_request_id;
    -- 依 p_overrides 更新 approved_qty
    UPDATE ambassador_supply_request_items asri
    SET approved_qty = (o->>'approved_qty')::INT
    FROM jsonb_array_elements(p_overrides) o
    WHERE asri.id = (o->>'item_id')::UUID AND asri.request_id = p_request_id;
    RETURN jsonb_build_object('success', true, 'status', 'adjusted_approved');
  ELSE
    UPDATE ambassador_supply_requests SET status='approved', reviewed_at=now() WHERE id=p_request_id;
    UPDATE ambassador_supply_request_items SET approved_qty = requested_qty WHERE request_id = p_request_id;
    RETURN jsonb_build_object('success', true, 'status', 'approved');
  END IF;
END $$;

-- ============================================================================
-- 🔴 get_boss_war_room_daily(p_date DATE)
-- ============================================================================
CREATE OR REPLACE FUNCTION get_boss_war_room_daily(p_date DATE DEFAULT current_date)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'summary', (SELECT row_to_json(s) FROM boss_war_room_daily_view s WHERE sale_date = p_date LIMIT 1),
    'venue_ranking', (SELECT jsonb_agg(row_to_json(v) ORDER BY v.amount DESC)
                      FROM venue_sales_ranking_view v WHERE v.sale_date = p_date),
    'ambassador_ranking', (SELECT jsonb_agg(row_to_json(a) ORDER BY a.amount DESC)
                           FROM ambassador_ranking_view a WHERE a.sale_date = p_date),
    'product_ranking', (SELECT jsonb_agg(row_to_json(p) ORDER BY p.qty DESC)
                        FROM product_sales_ranking_view p WHERE p.sale_date = p_date),
    'supply_stats', (SELECT jsonb_object_agg(status, count) FROM boss_supply_dashboard_view),
    'exceptions', (SELECT jsonb_agg(row_to_json(e) ORDER BY e.created_at DESC)
                   FROM exception_events e WHERE e.status = 'open' LIMIT 20)
  ) INTO result;
  RETURN result;
END $$;

-- ============================================================================
-- 🔴 supervisor_submit_collection(p_sale_id UUID, p_method TEXT, p_amount NUMERIC, p_proof_url TEXT, p_note TEXT)
-- ============================================================================
CREATE OR REPLACE FUNCTION supervisor_submit_collection(
  p_sale_id UUID, p_method TEXT, p_amount NUMERIC,
  p_proof_url TEXT DEFAULT NULL, p_note TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_col_id UUID;
  v_due NUMERIC;
  v_collected NUMERIC;
BEGIN
  SELECT id, due_amount INTO v_col_id, v_due FROM collection_records WHERE sale_id=p_sale_id LIMIT 1;
  IF NOT FOUND THEN
    INSERT INTO collection_records (sale_id, due_amount, status)
    VALUES (p_sale_id, p_amount, 'pending') RETURNING id INTO v_col_id;
    v_due := p_amount;
  END IF;

  INSERT INTO collection_payments (collection_id, method, amount, proof_url, note)
  VALUES (v_col_id, p_method, p_amount, p_proof_url, p_note);

  SELECT COALESCE(SUM(amount),0) INTO v_collected FROM collection_payments WHERE collection_id = v_col_id;

  UPDATE collection_records
  SET collected_amount = v_collected,
      status = CASE
        WHEN v_collected >= v_due THEN 'collected'
        WHEN v_collected > 0 THEN 'partial'
        ELSE 'pending'
      END
  WHERE id = v_col_id;

  IF v_collected < v_due AND (v_due - v_collected) > 0 THEN
    -- Phase 2: 視情況寫 exception_events
    NULL;
  END IF;

  RETURN jsonb_build_object('success', true);
END $$;

-- ============================================================================
-- 🟡 Phase 2: warehouse_confirm_pick / warehouse_ship_replenishment /
-- 🟡 warehouse_create_supply_shipment / warehouse_ship_supply_request /
-- 🟡 ambassador_confirm_supply_receipt / ambassador_report_supply_discrepancy /
-- 🟡 hq_adjust_and_approve_supply_request / hq_reject_supply_request /
-- 🟡 hq_resolve_supply_discrepancy / hq_review_collection_exception /
-- 🟡 supervisor_get_collection_status / get_product_sales_ranking /
-- 🟡 get_ambassador_ranking / get_venue_sales_ranking / get_supply_dashboard
-- ============================================================================

-- ============================================================================
-- 部署順序：
-- 1. 先 apply migration (.sql)
-- 2. 再 apply 這個檔案
-- 3. 最後在 Supabase Studio 驗證 RPC 回傳
-- ============================================================================
