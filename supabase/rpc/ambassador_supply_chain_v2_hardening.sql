-- ============================================================================
-- RPC · HARDENING v2 (2026-04-25)
-- 依賴：2026-04-25_02_hardening.sql 已 apply
-- 範圍：idempotency wrapper、ambassador_login 強化、role scope 檢查、
--       correction / verified / ship / confirm 整套 hardened RPC
-- Status: DRAFT — DO NOT APPLY.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 【輔助】idempotency wrapper
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION claim_idempotency(p_scope TEXT, p_key TEXT, p_actor UUID)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  v_existing idempotency_keys%ROWTYPE;
BEGIN
  IF p_key IS NULL OR length(p_key) < 8 THEN
    RAISE EXCEPTION 'idempotency_key required (min 8 chars)';
  END IF;

  SELECT * INTO v_existing FROM idempotency_keys WHERE scope=p_scope AND key=p_key;
  IF FOUND THEN
    IF v_existing.status = 'completed' THEN
      RETURN jsonb_build_object('hit', true, 'result', v_existing.result);
    ELSIF v_existing.status = 'in_flight' THEN
      RAISE EXCEPTION 'Duplicate in-flight request';
    END IF;
  END IF;

  INSERT INTO idempotency_keys (scope, key, actor_id, status)
  VALUES (p_scope, p_key, p_actor, 'in_flight');

  RETURN jsonb_build_object('hit', false);
END $$;

CREATE OR REPLACE FUNCTION complete_idempotency(p_scope TEXT, p_key TEXT, p_result JSONB)
RETURNS VOID LANGUAGE sql AS $$
  UPDATE idempotency_keys
  SET status='completed', result=p_result, completed_at=now()
  WHERE scope=p_scope AND key=p_key;
$$;

-- ---------------------------------------------------------------------------
-- 【4】ambassador_login v2：pgcrypto + 鎖定 + 失敗次數
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS ambassador_login(TEXT, TEXT);
CREATE OR REPLACE FUNCTION ambassador_login(p_code TEXT, p_password TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v ambassadors%ROWTYPE;
  v_ok BOOLEAN := false;
BEGIN
  IF p_code IS NULL OR p_password IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '必填欄位缺失');
  END IF;

  SELECT * INTO v FROM ambassadors
  WHERE (ambassador_code = p_code OR phone = p_code)
  LIMIT 1;

  IF NOT FOUND THEN
    -- 不透露「查無此人 vs 密碼錯」，一律回「帳號或密碼錯誤」
    PERFORM pg_sleep(0.3);
    RETURN jsonb_build_object('success', false, 'error', '帳號或密碼錯誤');
  END IF;

  IF NOT v.is_active THEN
    RETURN jsonb_build_object('success', false, 'error', '帳號已停用，請聯絡總部');
  END IF;

  IF v.locked_until IS NOT NULL AND v.locked_until > now() THEN
    RETURN jsonb_build_object('success', false, 'error',
      format('登入嘗試過多，請於 %s 分鐘後重試',
             ceil(EXTRACT(EPOCH FROM (v.locked_until - now()))/60)));
  END IF;

  -- 驗證 PIN：支援 bcrypt hash（以 $2 開頭）或暫時明碼（MVP 過渡期）
  IF v.pin_hash IS NULL THEN
    v_ok := false;
  ELSIF v.pin_hash LIKE '$2%' THEN
    v_ok := (v.pin_hash = crypt(p_password, v.pin_hash));
  ELSE
    v_ok := (v.pin_hash = p_password);  -- 過渡期：下次登入成功後改存 hash
    IF v_ok THEN
      UPDATE ambassadors SET pin_hash = crypt(p_password, gen_salt('bf')), pin_set_at = now()
      WHERE id = v.id;
    END IF;
  END IF;

  IF NOT v_ok THEN
    UPDATE ambassadors
    SET failed_login_count = failed_login_count + 1,
        last_failed_login_at = now(),
        locked_until = CASE
          WHEN failed_login_count + 1 >= 5 THEN now() + interval '15 minutes'
          ELSE locked_until
        END
    WHERE id = v.id;
    RETURN jsonb_build_object('success', false, 'error', '帳號或密碼錯誤');
  END IF;

  -- 登入成功：重置計數
  UPDATE ambassadors
  SET failed_login_count = 0, last_failed_login_at = NULL, locked_until = NULL,
      last_login_at = now()
  WHERE id = v.id;

  RETURN jsonb_build_object(
    'success', true,
    'ambassador_id', v.id,
    'ambassador_code', v.ambassador_code,
    'name', v.name,
    'phone', v.phone,  -- 考慮脫敏：SUBSTRING(phone,1,4)||'***'
    'default_venue_id', v.default_venue_id,
    'role', 'ambassador',
    'expires_at', (now() + interval '12 hours')
  );
END $$;

-- ---------------------------------------------------------------------------
-- 【5】Role scope 檢查 helper（RPC 內呼叫，不依賴 RLS）
-- ---------------------------------------------------------------------------
-- MVP 階段 client-side auth，RPC 無法靠 auth.uid()；
-- 所以用 p_actor_id 顯式傳入（前端從 localStorage 讀）並在後端驗證該身分角色。
-- 風險：被繞過。但 MVP 接受；Phase 2 切 Supabase Auth 時移到 RLS。

CREATE OR REPLACE FUNCTION assert_role(p_actor_id UUID, p_required TEXT[])
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_role TEXT;
BEGIN
  -- 先查員工
  SELECT CASE
    WHEN is_admin = true THEN 'boss'
    WHEN role_ext = 'warehouse' THEN 'warehouse'
    WHEN role_ext = 'supervisor' THEN 'supervisor'
    ELSE 'staff'
  END INTO v_role
  FROM employees WHERE id = p_actor_id AND enabled = true;

  IF v_role IS NULL THEN
    -- 查大使
    IF EXISTS (SELECT 1 FROM ambassadors WHERE id = p_actor_id AND is_active = true) THEN
      v_role := 'ambassador';
    END IF;
  END IF;

  IF v_role IS NULL OR NOT (v_role = ANY(p_required)) THEN
    RAISE EXCEPTION 'Forbidden: role % not in %', COALESCE(v_role,'unknown'), p_required
      USING ERRCODE = '42501';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 【1】hq_submit_venue_sales v2：idempotency + 狀態 draft→submitted + 異常偵測
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS hq_submit_venue_sales(JSONB);
CREATE OR REPLACE FUNCTION hq_submit_venue_sales(
  payload JSONB,
  p_idempotency_key TEXT,
  p_actor_id UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_sale_id UUID;
  v_idem JSONB;
  v_result JSONB;
BEGIN
  PERFORM assert_role(p_actor_id, ARRAY['staff','boss']);
  v_idem := claim_idempotency('hq_submit_venue_sales', p_idempotency_key, p_actor_id);
  IF (v_idem->>'hit')::BOOLEAN THEN
    RETURN v_idem->'result';
  END IF;

  INSERT INTO venue_sales_daily (
    sale_date, venue_id, ambassador_id,
    total_amount, cash_amount, transfer_amount, monthly_amount, unpaid_amount,
    payment_status, note, created_by, status, submitted_at, submitted_by
  ) VALUES (
    (payload->>'sale_date')::DATE,
    (payload->>'venue_id')::UUID,
    NULLIF(payload->>'ambassador_id','')::UUID,
    COALESCE((payload->>'total_amount')::NUMERIC,0),
    COALESCE((payload->>'cash_amount')::NUMERIC,0),
    COALESCE((payload->>'transfer_amount')::NUMERIC,0),
    COALESCE((payload->>'monthly_amount')::NUMERIC,0),
    COALESCE((payload->>'unpaid_amount')::NUMERIC,0),
    COALESCE(payload->>'payment_status','paid'),
    payload->>'note',
    p_actor_id,
    'submitted', now(), p_actor_id
  ) RETURNING id INTO v_sale_id;

  INSERT INTO venue_sales_items (sale_id, product_id, quantity, unit_price, split_reason)
  SELECT v_sale_id, (i->>'product_id')::UUID, (i->>'quantity')::INT,
         (i->>'unit_price')::NUMERIC, i->>'split_reason'
  FROM jsonb_array_elements(payload->'items') i;

  -- 未收款自動建 collection_record，預期金額拆現金/匯款/月結
  IF COALESCE((payload->>'unpaid_amount')::NUMERIC,0) +
     COALESCE((payload->>'monthly_amount')::NUMERIC,0) > 0 THEN
    INSERT INTO collection_records (
      sale_id, supervisor_id, due_amount,
      expected_cash, expected_transfer, expected_monthly,
      status, due_date
    )
    SELECT v_sale_id, v.supervisor_id,
           COALESCE((payload->>'unpaid_amount')::NUMERIC,0) + COALESCE((payload->>'monthly_amount')::NUMERIC,0),
           0, 0, COALESCE((payload->>'monthly_amount')::NUMERIC,0),
           'pending', current_date + interval '7 days'
    FROM venues v WHERE v.id = (payload->>'venue_id')::UUID;
  END IF;

  PERFORM detect_sale_anomalies(v_sale_id);

  v_result := jsonb_build_object('success', true, 'sale_id', v_sale_id);
  PERFORM complete_idempotency('hq_submit_venue_sales', p_idempotency_key, v_result);
  RETURN v_result;
END $$;

-- ---------------------------------------------------------------------------
-- 【1】hq_correct_sale：鎖定後的修正專用
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION hq_correct_sale(
  p_sale_id UUID,
  p_correction_type TEXT,
  p_reason TEXT,
  p_after_snapshot JSONB,
  p_actor_id UUID,
  p_idempotency_key TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_before JSONB;
  v_idem JSONB;
  v_corr_id UUID;
BEGIN
  PERFORM assert_role(p_actor_id, ARRAY['boss']);  -- 只有 boss 能修正
  v_idem := claim_idempotency('hq_correct_sale', p_idempotency_key, p_actor_id);
  IF (v_idem->>'hit')::BOOLEAN THEN RETURN v_idem->'result'; END IF;

  SELECT to_jsonb(s) INTO v_before FROM venue_sales_daily s WHERE id = p_sale_id;

  INSERT INTO sales_corrections (sale_id, correction_type, reason, before_snapshot, after_snapshot, created_by, approved_by)
  VALUES (p_sale_id, p_correction_type, p_reason, v_before, p_after_snapshot, p_actor_id, p_actor_id)
  RETURNING id INTO v_corr_id;

  -- 實際應用 p_after_snapshot 到表（此處 proposal 略，依 correction_type 分支）
  UPDATE venue_sales_daily SET status = 'adjusted' WHERE id = p_sale_id;

  PERFORM complete_idempotency('hq_correct_sale', p_idempotency_key,
    jsonb_build_object('success', true, 'correction_id', v_corr_id));
  RETURN jsonb_build_object('success', true, 'correction_id', v_corr_id);
END $$;

-- ---------------------------------------------------------------------------
-- 【2】補貨流程 RPC（各 stage 一支，全部有 idempotency）
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION hq_review_replenishment(p_run_id UUID, p_actor_id UUID, p_idempotency_key TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_idem JSONB; BEGIN
  PERFORM assert_role(p_actor_id, ARRAY['staff','boss']);
  v_idem := claim_idempotency('hq_review_replenishment', p_idempotency_key, p_actor_id);
  IF (v_idem->>'hit')::BOOLEAN THEN RETURN v_idem->'result'; END IF;

  UPDATE replenishment_runs
  SET status='reviewed', reviewed_at=now(), reviewed_by=p_actor_id
  WHERE id=p_run_id AND status='generated';

  PERFORM complete_idempotency('hq_review_replenishment', p_idempotency_key, jsonb_build_object('success', true));
  RETURN jsonb_build_object('success', true);
END $$;

CREATE OR REPLACE FUNCTION warehouse_confirm_pick(
  p_run_id UUID, p_items JSONB, p_actor_id UUID, p_idempotency_key TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_idem JSONB;
  v_shipment_id UUID;
BEGIN
  PERFORM assert_role(p_actor_id, ARRAY['warehouse','boss']);
  v_idem := claim_idempotency('warehouse_confirm_pick', p_idempotency_key, p_actor_id);
  IF (v_idem->>'hit')::BOOLEAN THEN RETURN v_idem->'result'; END IF;

  UPDATE replenishment_runs SET status='picking', picked_at=now(), picked_by=p_actor_id
  WHERE id=p_run_id AND status='reviewed';

  -- 實際出貨數量（允許 ≠ suggested，需填 shipped_reason）
  UPDATE replenishment_items ri
  SET actual_shipped_qty = (i->>'actual_qty')::INT,
      shipped_reason = i->>'reason'
  FROM jsonb_array_elements(p_items) i
  WHERE ri.id = (i->>'item_id')::UUID;

  -- 建 shipment
  INSERT INTO warehouse_shipments (run_id, status, picked_by, shipment_no, shipped_by, shipped_at)
  VALUES (p_run_id, 'shipped', p_actor_id,
          gen_doc_no('WS','doc_seq_warehouse'),  -- document_no 會同時被 trigger 填
          p_actor_id, now())
  RETURNING id INTO v_shipment_id;

  UPDATE replenishment_runs SET status='shipped' WHERE id=p_run_id;

  PERFORM complete_idempotency('warehouse_confirm_pick', p_idempotency_key,
    jsonb_build_object('success', true, 'shipment_id', v_shipment_id));
  RETURN jsonb_build_object('success', true, 'shipment_id', v_shipment_id);
END $$;

-- ---------------------------------------------------------------------------
-- 【3】庫存異動必走 RPC（不直改 venue_inventory）
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION adjust_venue_inventory(
  p_venue_id UUID, p_product_id UUID, p_change_qty INT,
  p_change_type TEXT, p_reason TEXT, p_actor_id UUID, p_idempotency_key TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_idem JSONB; BEGIN
  PERFORM assert_role(p_actor_id, ARRAY['staff','boss','warehouse']);
  v_idem := claim_idempotency('adjust_venue_inventory', p_idempotency_key, p_actor_id);
  IF (v_idem->>'hit')::BOOLEAN THEN RETURN v_idem->'result'; END IF;

  IF p_change_type NOT IN ('adjustment','damage','missing','correction') THEN
    RAISE EXCEPTION 'Only manual change_types allowed via this RPC';
  END IF;

  IF p_reason IS NULL OR length(p_reason) < 4 THEN
    RAISE EXCEPTION 'reason required';
  END IF;

  INSERT INTO venue_inventory_ledger (venue_id, product_id, change_type, change_qty, reason, approved_by, created_by)
  VALUES (p_venue_id, p_product_id, p_change_type, p_change_qty, p_reason, p_actor_id, p_actor_id);

  PERFORM complete_idempotency('adjust_venue_inventory', p_idempotency_key, jsonb_build_object('success', true));
  RETURN jsonb_build_object('success', true);
END $$;

-- ---------------------------------------------------------------------------
-- 【6】收帳 RPC：現金/匯款分流，verified 分層
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS supervisor_submit_collection(UUID, TEXT, NUMERIC, TEXT, TEXT);
CREATE OR REPLACE FUNCTION supervisor_submit_collection(
  p_sale_id UUID, p_method TEXT, p_amount NUMERIC,
  p_reference_no TEXT, p_proof_url TEXT, p_note TEXT,
  p_actor_id UUID, p_idempotency_key TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_idem JSONB;
  v_col_id UUID;
  v_scope_ok BOOLEAN;
BEGIN
  PERFORM assert_role(p_actor_id, ARRAY['supervisor','boss']);
  IF p_method NOT IN ('cash','bank_transfer','monthly_settlement','partial_payment') THEN
    RAISE EXCEPTION 'invalid method %', p_method;
  END IF;

  -- Scope check: supervisor 只能收自己負責場域
  IF (SELECT is_admin FROM employees WHERE id = p_actor_id) IS NOT TRUE THEN
    SELECT EXISTS (
      SELECT 1 FROM venue_sales_daily vsd
      JOIN supervisor_venue_scope svs ON svs.venue_id = vsd.venue_id
      WHERE vsd.id = p_sale_id AND svs.supervisor_id = p_actor_id
    ) INTO v_scope_ok;
    IF NOT v_scope_ok THEN
      RAISE EXCEPTION 'Forbidden: sale not in your venue scope';
    END IF;
  END IF;

  v_idem := claim_idempotency('supervisor_submit_collection', p_idempotency_key, p_actor_id);
  IF (v_idem->>'hit')::BOOLEAN THEN RETURN v_idem->'result'; END IF;

  SELECT id INTO v_col_id FROM collection_records WHERE sale_id=p_sale_id LIMIT 1;
  IF v_col_id IS NULL THEN
    INSERT INTO collection_records (sale_id, supervisor_id, due_amount, status)
    VALUES (p_sale_id, p_actor_id, p_amount, 'pending')
    RETURNING id INTO v_col_id;
  END IF;

  INSERT INTO collection_payments (
    collection_id, method, amount, collected_by, collected_at, reference_no, note, proof_url
  ) VALUES (
    v_col_id, p_method, p_amount, p_actor_id, now(), p_reference_no, p_note, p_proof_url
  );

  -- 狀態推進：未達 due_amount → partially_collected；達到 → collected（尚需 verified 才算結）
  UPDATE collection_records cr
  SET collected_amount = (SELECT COALESCE(SUM(amount),0) FROM collection_payments WHERE collection_id = cr.id),
      status = CASE
        WHEN cr.status = 'verified' THEN 'verified'
        WHEN (SELECT COALESCE(SUM(amount),0) FROM collection_payments WHERE collection_id = cr.id) >= cr.due_amount
          THEN 'collected'
        WHEN (SELECT COALESCE(SUM(amount),0) FROM collection_payments WHERE collection_id = cr.id) > 0
          THEN 'partially_collected'
        ELSE 'pending'
      END
  WHERE cr.id = v_col_id;

  PERFORM complete_idempotency('supervisor_submit_collection', p_idempotency_key, jsonb_build_object('success', true));
  RETURN jsonb_build_object('success', true, 'collection_id', v_col_id);
END $$;

CREATE OR REPLACE FUNCTION hq_verify_collection(
  p_collection_id UUID, p_actor_id UUID, p_idempotency_key TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_idem JSONB;
  v_due NUMERIC; v_collected NUMERIC;
BEGIN
  PERFORM assert_role(p_actor_id, ARRAY['staff','boss']);
  v_idem := claim_idempotency('hq_verify_collection', p_idempotency_key, p_actor_id);
  IF (v_idem->>'hit')::BOOLEAN THEN RETURN v_idem->'result'; END IF;

  SELECT due_amount, collected_amount INTO v_due, v_collected
  FROM collection_records WHERE id = p_collection_id;

  IF v_collected < v_due THEN
    -- 差額異常進 exception
    INSERT INTO exception_events (category, severity, title, message, ref_type, ref_id)
    VALUES ('collection_short','critical',
            format('收帳差額：應收 %s / 實收 %s', v_due, v_collected),
            '差額 ' || (v_due - v_collected), 'collection_records', p_collection_id);
    UPDATE collection_records SET status='discrepancy' WHERE id = p_collection_id;
    RETURN jsonb_build_object('success', false, 'reason', 'short_amount');
  END IF;

  UPDATE collection_records SET status='verified', verified_at=now(), verified_by=p_actor_id
  WHERE id = p_collection_id;

  UPDATE collection_payments SET is_cleared=true, verified_at=now(), verified_by=p_actor_id
  WHERE collection_id = p_collection_id;

  PERFORM complete_idempotency('hq_verify_collection', p_idempotency_key, jsonb_build_object('success', true));
  RETURN jsonb_build_object('success', true);
END $$;

-- ---------------------------------------------------------------------------
-- 【7】耗材：submit/confirm/ship 全部加 idempotency + role scope
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS ambassador_submit_supply_request(JSONB);
CREATE OR REPLACE FUNCTION ambassador_submit_supply_request(
  payload JSONB, p_actor_id UUID, p_idempotency_key TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_req_id UUID;
  v_idem JSONB;
  v_high BOOLEAN;
BEGIN
  PERFORM assert_role(p_actor_id, ARRAY['ambassador']);
  -- ambassador 只能為自己申請
  IF (payload->>'ambassador_id')::UUID <> p_actor_id THEN
    RAISE EXCEPTION 'Forbidden: cannot submit for other ambassador';
  END IF;

  v_idem := claim_idempotency('ambassador_submit_supply_request', p_idempotency_key, p_actor_id);
  IF (v_idem->>'hit')::BOOLEAN THEN RETURN v_idem->'result'; END IF;

  INSERT INTO ambassador_supply_requests (ambassador_id, venue_id, urgency, reason, note, status)
  VALUES (
    p_actor_id,
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

  -- has_high_risk flag
  SELECT bool_or(si.is_high_risk OR si.requires_manager_approval) INTO v_high
  FROM ambassador_supply_request_items asri
  JOIN supply_items si ON si.id = asri.supply_item_id
  WHERE asri.request_id = v_req_id;

  UPDATE ambassador_supply_requests SET has_high_risk = COALESCE(v_high,false) WHERE id = v_req_id;

  PERFORM complete_idempotency('ambassador_submit_supply_request', p_idempotency_key,
    jsonb_build_object('success', true, 'request_id', v_req_id));
  RETURN jsonb_build_object('success', true, 'request_id', v_req_id, 'has_high_risk', v_high);
END $$;

CREATE OR REPLACE FUNCTION ambassador_confirm_supply_receipt(
  p_shipment_id UUID, p_actor_id UUID, p_idempotency_key TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_idem JSONB; BEGIN
  PERFORM assert_role(p_actor_id, ARRAY['ambassador']);
  v_idem := claim_idempotency('ambassador_confirm_supply_receipt', p_idempotency_key, p_actor_id);
  IF (v_idem->>'hit')::BOOLEAN THEN RETURN v_idem->'result'; END IF;

  UPDATE supply_shipments SET status='received' WHERE id=p_shipment_id;

  PERFORM complete_idempotency('ambassador_confirm_supply_receipt', p_idempotency_key, jsonb_build_object('success', true));
  RETURN jsonb_build_object('success', true);
END $$;

-- ---------------------------------------------------------------------------
-- 【8】戰情室 get_boss_war_room_daily v2：使用新 view（已過濾狀態）
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS get_boss_war_room_daily(DATE);
CREATE OR REPLACE FUNCTION get_boss_war_room_daily(p_date DATE DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_date DATE := COALESCE(p_date, (now() AT TIME ZONE 'Asia/Taipei')::date);
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'date', v_date,
    'summary', (SELECT row_to_json(s) FROM boss_war_room_daily_view s WHERE sale_date = v_date LIMIT 1),
    'venue_ranking', (SELECT jsonb_agg(row_to_json(v) ORDER BY v.amount DESC)
                      FROM venue_sales_ranking_view v WHERE v.sale_date = v_date),
    'ambassador_ranking', (SELECT jsonb_agg(row_to_json(a) ORDER BY a.amount DESC)
                           FROM ambassador_ranking_view a WHERE a.sale_date = v_date),
    'product_ranking', (SELECT jsonb_agg(row_to_json(p) ORDER BY p.qty DESC)
                        FROM product_sales_ranking_view p WHERE p.sale_date = v_date),
    'replenishment_completion', (SELECT row_to_json(r) FROM replenishment_completion_view r WHERE run_date = v_date),
    'collection_completion', (SELECT row_to_json(c) FROM collection_completion_view c WHERE col_date = v_date),
    'open_exceptions', (SELECT jsonb_agg(row_to_json(e)) FROM open_exceptions_view e LIMIT 50),
    'supply_stats', (SELECT jsonb_object_agg(status, count) FROM boss_supply_dashboard_view)
  ) INTO result;
  RETURN result;
END $$;

-- ============================================================================
-- 注意：以上函數都假設 client 會傳 p_actor_id 與 p_idempotency_key。
-- 前端 service layer 須對應更新（見 src/lib/services/idempotency.js）
-- ============================================================================
