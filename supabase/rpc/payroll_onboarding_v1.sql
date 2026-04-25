-- ============================================================================
-- RPC · PAYROLL + ONBOARDING v1 (2026-04-25)
-- 依賴：2026-04-25_03_payroll_onboarding.sql 已 apply
-- Status: DRAFT — DO NOT APPLY.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 【C】銷售落地 → 自動生 sales_profit_snapshot（trigger）
-- 注意：交易腳本在 venue_sales_items 落地後執行，抓當時 active profile/rule
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION calculate_sales_profit_snapshot()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_sale venue_sales_daily%ROWTYPE;
  v_product RECORD;
  v_cp ambassador_compensation_profiles%ROWTYPE;
  v_rule ambassador_commission_rules%ROWTYPE;
  v_vp venue_profit_rules%ROWTYPE;
  v_vp_item venue_profit_rule_items%ROWTYPE;
  v_cost NUMERIC := 0;
  v_venue_share NUMERIC := 0;
  v_gross NUMERIC := 0;
  v_commission_rate NUMERIC := 0;
  v_estimated_commission NUMERIC := 0;
  v_basis TEXT := 'revenue';
BEGIN
  SELECT * INTO v_sale FROM venue_sales_daily WHERE id = NEW.sale_id;
  SELECT * INTO v_product FROM inventory_master WHERE id = NEW.product_id;

  -- 抓當時 active compensation profile
  SELECT * INTO v_cp FROM ambassador_compensation_profiles
  WHERE ambassador_id = v_sale.ambassador_id
    AND status = 'active' AND is_active = true
    AND effective_from <= v_sale.sale_date
    AND (effective_to IS NULL OR effective_to >= v_sale.sale_date)
  ORDER BY effective_from DESC LIMIT 1;

  -- 抓最精確 commission rule（越精準越優先：product_id > category > brand > venue > default）
  SELECT * INTO v_rule FROM ambassador_commission_rules
  WHERE ambassador_id = v_sale.ambassador_id
    AND is_active = true
    AND effective_from <= v_sale.sale_date
    AND (effective_to IS NULL OR effective_to >= v_sale.sale_date)
    AND (venue_id IS NULL OR venue_id = v_sale.venue_id)
  ORDER BY
    (product_id = NEW.product_id)::INT DESC,
    (product_category IS NOT NULL)::INT DESC,
    (venue_id IS NOT NULL)::INT DESC
  LIMIT 1;

  -- 抓場域 profit rule
  SELECT * INTO v_vp FROM venue_profit_rules
  WHERE venue_id = v_sale.venue_id AND is_active = true
    AND effective_from <= v_sale.sale_date
    AND (effective_to IS NULL OR effective_to >= v_sale.sale_date)
  LIMIT 1;

  IF v_vp.id IS NOT NULL THEN
    SELECT * INTO v_vp_item FROM venue_profit_rule_items
    WHERE rule_id = v_vp.id
      AND (product_id = NEW.product_id OR (product_id IS NULL AND product_category IS NULL))
      AND is_active = true
    ORDER BY (product_id = NEW.product_id)::INT DESC LIMIT 1;
  END IF;

  -- 成本 = override / 商品成本
  v_cost := COALESCE(v_vp_item.cost_override, v_product.cost_price, 0) * NEW.quantity;

  -- 場域分潤
  IF v_vp.venue_share_type = 'percentage' THEN
    v_venue_share := (v_vp_item.venue_share_rate_override::NUMERIC * NEW.subtotal) * NEW.quantity / 100
      + (COALESCE(v_vp_item.venue_share_rate_override, v_vp.venue_share_rate, 0) * NEW.subtotal);
  ELSIF v_vp.venue_share_type = 'fixed_amount' THEN
    v_venue_share := COALESCE(v_vp.venue_share_fixed, 0);
  END IF;

  v_gross := NEW.subtotal - v_cost - v_venue_share;

  -- 抽成 rate 與 basis
  v_commission_rate := COALESCE(
    v_vp_item.commission_rate_override,
    v_rule.commission_rate,
    v_cp.default_commission_rate,
    0
  );
  v_basis := COALESCE(v_rule.commission_type, v_cp.default_commission_type, v_vp.ambassador_commission_basis, 'revenue');

  v_estimated_commission := CASE v_basis
    WHEN 'revenue' THEN NEW.subtotal * v_commission_rate
    WHEN 'gross_profit' THEN v_gross * v_commission_rate
    WHEN 'net_profit' THEN v_gross * v_commission_rate
    WHEN 'collected_amount' THEN 0   -- 收帳 verified 後才算
    ELSE 0
  END + COALESCE(v_rule.fixed_commission_amount, 0);

  INSERT INTO sales_profit_snapshots (
    sales_item_id, sales_daily_id, venue_id, ambassador_id, product_id, sale_date,
    quantity, revenue_amount,
    product_cost_snapshot, venue_share_snapshot, company_gross_profit, company_net_profit,
    commission_basis, commission_rate_snapshot, hourly_rate_snapshot,
    estimated_commission, payable_commission,
    venue_profit_rule_id, compensation_profile_id, commission_rule_id,
    collection_status_snapshot
  ) VALUES (
    NEW.id, NEW.sale_id, v_sale.venue_id, v_sale.ambassador_id, NEW.product_id, v_sale.sale_date,
    NEW.quantity, NEW.subtotal,
    v_cost, v_venue_share, v_gross, v_gross,
    v_basis, v_commission_rate, v_cp.hourly_rate,
    v_estimated_commission, 0,
    v_vp.id, v_cp.id, v_rule.id,
    'pending'
  )
  ON CONFLICT (sales_item_id) DO NOTHING;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_profit_snapshot ON venue_sales_items;
CREATE TRIGGER trg_profit_snapshot
  AFTER INSERT ON venue_sales_items
  FOR EACH ROW EXECUTE FUNCTION calculate_sales_profit_snapshot();

-- ---------------------------------------------------------------------------
-- 【I】收帳 verified → 更新 payable_commission（串接 hardening 的 hq_verify_collection）
-- 覆蓋 hq_verify_collection：verified 後把對應 snapshot 的 payable_commission 填上
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_collection_verified_to_payable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status = 'verified' AND OLD.status <> 'verified' THEN
    -- 依 collection 的 sale_id 更新所有 snapshot 的 payable_commission
    UPDATE sales_profit_snapshots sps
    SET payable_commission = sps.estimated_commission,
        collection_status_snapshot = 'verified'
    WHERE sps.sales_daily_id = NEW.sale_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_collection_payable ON collection_records;
CREATE TRIGGER trg_collection_payable
  AFTER UPDATE ON collection_records
  FOR EACH ROW EXECUTE FUNCTION trg_collection_verified_to_payable();

-- ---------------------------------------------------------------------------
-- 【D】核心：calculate_ambassador_payroll
--   輸入：期 id（或 period_start/end）
--   動作：為每位活躍大使建立/重算 payroll_item，匯總 snapshot + hourly_logs + adjustments
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION calculate_ambassador_payroll(p_period_id UUID, p_actor_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_period ambassador_payroll_periods%ROWTYPE;
  v_amb ambassadors%ROWTYPE;
  v_item_id UUID;
  v_count INT := 0;
BEGIN
  PERFORM assert_role(p_actor_id, ARRAY['staff','boss']);

  SELECT * INTO v_period FROM ambassador_payroll_periods WHERE id = p_period_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'period not found'; END IF;
  IF v_period.status NOT IN ('open','calculating','calculated') THEN
    RAISE EXCEPTION 'period must be open/calculating/calculated, got %', v_period.status;
  END IF;

  UPDATE ambassador_payroll_periods SET status='calculating' WHERE id=p_period_id AND status='open';

  -- 清掉未鎖定的舊 item（允許重算）
  DELETE FROM ambassador_payroll_items
   WHERE payroll_period_id = p_period_id
     AND status NOT IN ('paid','locked');

  FOR v_amb IN SELECT * FROM ambassadors WHERE is_active = true LOOP
    INSERT INTO ambassador_payroll_items (
      payroll_period_id, ambassador_id, compensation_profile_id,
      base_salary, hourly_rate_snapshot,
      approved_hours, hourly_pay,
      sales_amount, collected_amount, pending_collection_amount,
      gross_profit,
      commission_amount, pending_commission_amount, payable_commission_amount,
      bonus_amount, deduction_amount, adjustment_amount,
      total_estimated_pay, total_recognized_pay, total_payable_amount,
      status
    )
    SELECT
      p_period_id, v_amb.id, cp.id,
      COALESCE(cp.base_salary, 0),
      cp.hourly_rate,
      COALESCE(h.total_hours, 0),
      COALESCE(h.total_amount, 0),
      COALESCE(s.total_sales, 0),
      COALESCE(s.collected, 0),
      COALESCE(s.pending, 0),
      COALESCE(s.gross, 0),
      COALESCE(s.estimated_commission, 0),
      COALESCE(s.pending_commission, 0),
      COALESCE(s.payable_commission, 0),
      COALESCE(adj.bonus, 0),
      COALESCE(adj.deduction, 0),
      COALESCE(adj.total_adj, 0),
      -- estimated = base + hourly + est_commission + bonus - deduction
      COALESCE(cp.base_salary,0) + COALESCE(h.total_amount,0) + COALESCE(s.estimated_commission,0) + COALESCE(adj.bonus,0) - COALESCE(adj.deduction,0),
      -- recognized = base + hourly + snapshot commission (verified or not)
      COALESCE(cp.base_salary,0) + COALESCE(h.total_amount,0) + COALESCE(s.estimated_commission,0),
      -- payable = base + hourly + payable_commission + bonus - deduction + adjustment
      COALESCE(cp.base_salary,0) + COALESCE(h.total_amount,0) + COALESCE(s.payable_commission,0) + COALESCE(adj.bonus,0) - COALESCE(adj.deduction,0) + COALESCE(adj.total_adj,0),
      'calculated'
    FROM (SELECT 1) _
    LEFT JOIN ambassador_compensation_profiles cp ON cp.ambassador_id = v_amb.id AND cp.is_active = true AND cp.status = 'active'
    LEFT JOIN LATERAL (
      SELECT SUM(hours) AS total_hours, SUM(amount) AS total_amount
      FROM ambassador_hourly_logs
      WHERE ambassador_id = v_amb.id
        AND work_date BETWEEN v_period.period_start AND v_period.period_end
        AND status = 'approved'
    ) h ON true
    LEFT JOIN LATERAL (
      SELECT
        SUM(sps.revenue_amount) AS total_sales,
        SUM(sps.revenue_amount) FILTER (WHERE sps.collection_status_snapshot = 'verified') AS collected,
        SUM(sps.revenue_amount) FILTER (WHERE sps.collection_status_snapshot <> 'verified' OR sps.collection_status_snapshot IS NULL) AS pending,
        SUM(sps.company_gross_profit) AS gross,
        SUM(sps.estimated_commission) AS estimated_commission,
        SUM(sps.estimated_commission - sps.payable_commission) AS pending_commission,
        SUM(sps.payable_commission) AS payable_commission
      FROM sales_profit_snapshots sps
      WHERE sps.ambassador_id = v_amb.id
        AND sps.sale_date BETWEEN v_period.period_start AND v_period.period_end
    ) s ON true
    LEFT JOIN LATERAL (
      SELECT
        SUM(amount) FILTER (WHERE adjustment_type = 'bonus') AS bonus,
        SUM(amount) FILTER (WHERE adjustment_type = 'deduction') AS deduction,
        SUM(amount) FILTER (WHERE adjustment_type NOT IN ('bonus','deduction')) AS total_adj
      FROM payroll_adjustments
      WHERE ambassador_id = v_amb.id
        AND payroll_period_id = p_period_id
        AND approved_by IS NOT NULL
    ) adj ON true
    RETURNING id INTO v_item_id;

    v_count := v_count + 1;
  END LOOP;

  -- 更新 period 總計
  UPDATE ambassador_payroll_periods app
  SET status = 'calculated',
      total_payable = (SELECT COALESCE(SUM(total_payable_amount),0) FROM ambassador_payroll_items WHERE payroll_period_id = p_period_id),
      total_sales = (SELECT COALESCE(SUM(sales_amount),0) FROM ambassador_payroll_items WHERE payroll_period_id = p_period_id),
      total_commission = (SELECT COALESCE(SUM(commission_amount),0) FROM ambassador_payroll_items WHERE payroll_period_id = p_period_id),
      total_hourly_pay = (SELECT COALESCE(SUM(hourly_pay),0) FROM ambassador_payroll_items WHERE payroll_period_id = p_period_id)
  WHERE app.id = p_period_id;

  RETURN jsonb_build_object('success', true, 'items_created', v_count);
END $$;

-- ---------------------------------------------------------------------------
-- 【D】審核流程（boss → accounting → scheduled → paid → locked）
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION boss_approve_ambassador_payroll(p_period_id UUID, p_actor_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM assert_role(p_actor_id, ARRAY['boss']);
  UPDATE ambassador_payroll_periods
  SET status='boss_approved', boss_reviewed_by=p_actor_id, boss_reviewed_at=now()
  WHERE id=p_period_id AND status IN ('calculated','boss_reviewing');
  UPDATE ambassador_payroll_items SET status='boss_approved'
  WHERE payroll_period_id=p_period_id AND status IN ('calculated','boss_reviewing');
  RETURN jsonb_build_object('success', true);
END $$;

CREATE OR REPLACE FUNCTION accounting_confirm_payroll(p_period_id UUID, p_actor_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM assert_role(p_actor_id, ARRAY['boss','staff']); -- MVP: staff 代理會計；Phase 2 加 role_ext='accounting'
  UPDATE ambassador_payroll_periods
  SET status='accounting_confirmed', accounting_confirmed_by=p_actor_id, accounting_confirmed_at=now()
  WHERE id=p_period_id AND status='boss_approved';
  UPDATE ambassador_payroll_items SET status='accounting_confirmed'
  WHERE payroll_period_id=p_period_id AND status='boss_approved';
  RETURN jsonb_build_object('success', true);
END $$;

CREATE OR REPLACE FUNCTION schedule_payroll_payment(p_period_id UUID, p_actor_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM assert_role(p_actor_id, ARRAY['boss','staff']);
  UPDATE ambassador_payroll_periods SET status='payment_scheduled'
  WHERE id=p_period_id AND status='accounting_confirmed';
  UPDATE ambassador_payroll_items SET status='payment_scheduled'
  WHERE payroll_period_id=p_period_id AND status='accounting_confirmed';
  RETURN jsonb_build_object('success', true);
END $$;

CREATE OR REPLACE FUNCTION mark_payroll_paid(p_period_id UUID, p_actor_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM assert_role(p_actor_id, ARRAY['boss','staff']);
  UPDATE ambassador_payroll_periods SET status='paid', paid_by=p_actor_id, paid_at=now()
  WHERE id=p_period_id AND status='payment_scheduled';
  UPDATE ambassador_payroll_items SET status='paid'
  WHERE payroll_period_id=p_period_id AND status='payment_scheduled';
  RETURN jsonb_build_object('success', true);
END $$;

CREATE OR REPLACE FUNCTION lock_ambassador_payroll_period(p_period_id UUID, p_actor_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM assert_role(p_actor_id, ARRAY['boss']);
  UPDATE ambassador_payroll_periods SET status='locked', locked_by=p_actor_id, locked_at=now()
  WHERE id=p_period_id AND status='paid';
  UPDATE ambassador_payroll_items SET status='locked'
  WHERE payroll_period_id=p_period_id AND status='paid';
  RETURN jsonb_build_object('success', true);
END $$;

-- ---------------------------------------------------------------------------
-- 【D】payroll_adjustments: create + approve
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_payroll_adjustment(
  p_period_id UUID, p_ambassador_id UUID,
  p_type TEXT, p_amount NUMERIC, p_reason TEXT,
  p_actor_id UUID, p_idempotency_key TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_idem JSONB; v_adj_id UUID; BEGIN
  PERFORM assert_role(p_actor_id, ARRAY['boss','staff']);
  v_idem := claim_idempotency('create_payroll_adjustment', p_idempotency_key, p_actor_id);
  IF (v_idem->>'hit')::BOOLEAN THEN RETURN v_idem->'result'; END IF;

  INSERT INTO payroll_adjustments (
    payroll_period_id, ambassador_id, adjustment_type, amount, reason, created_by,
    requires_boss_approval
  ) VALUES (
    p_period_id, p_ambassador_id, p_type, p_amount, p_reason, p_actor_id,
    (p_type IN ('clawback','manual_adjustment','collection_discrepancy','inventory_shortage'))
  ) RETURNING id INTO v_adj_id;

  PERFORM complete_idempotency('create_payroll_adjustment', p_idempotency_key,
    jsonb_build_object('success', true, 'adjustment_id', v_adj_id));
  RETURN jsonb_build_object('success', true, 'adjustment_id', v_adj_id);
END $$;

-- ---------------------------------------------------------------------------
-- 【A】upsert_ambassador_compensation_profile（新版本策略：不改歷史，只新建）
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION upsert_ambassador_compensation_profile(
  payload JSONB, p_actor_id UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id UUID; v_amb_id UUID; v_eff_from DATE; BEGIN
  PERFORM assert_role(p_actor_id, ARRAY['boss']);
  v_amb_id := (payload->>'ambassador_id')::UUID;
  v_eff_from := (payload->>'effective_from')::DATE;

  -- 關閉舊 profile 的 effective_to（若有）
  UPDATE ambassador_compensation_profiles
  SET effective_to = v_eff_from - 1
  WHERE ambassador_id = v_amb_id
    AND is_active = true
    AND status = 'active'
    AND (effective_to IS NULL OR effective_to >= v_eff_from);

  INSERT INTO ambassador_compensation_profiles (
    ambassador_id, profile_name, employment_type,
    base_salary, hourly_rate,
    default_commission_type, default_commission_rate,
    minimum_guarantee, effective_from,
    status, is_active, created_by
  ) VALUES (
    v_amb_id,
    payload->>'profile_name',
    payload->>'employment_type',
    COALESCE((payload->>'base_salary')::NUMERIC, 0),
    COALESCE((payload->>'hourly_rate')::NUMERIC, 0),
    payload->>'default_commission_type',
    COALESCE((payload->>'default_commission_rate')::NUMERIC, 0),
    COALESCE((payload->>'minimum_guarantee')::NUMERIC, 0),
    v_eff_from,
    'draft',
    true,
    p_actor_id
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'profile_id', v_id);
END $$;

-- approve_compensation_profile
CREATE OR REPLACE FUNCTION approve_compensation_profile(p_profile_id UUID, p_actor_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM assert_role(p_actor_id, ARRAY['boss']);
  UPDATE ambassador_compensation_profiles
  SET status='active', approved_by=p_actor_id, approved_at=now()
  WHERE id=p_profile_id AND status='draft';
  RETURN jsonb_build_object('success', true);
END $$;

-- ---------------------------------------------------------------------------
-- 【B】upsert_venue_profit_rule
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION upsert_venue_profit_rule(payload JSONB, p_actor_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id UUID; v_vid UUID; v_from DATE; BEGIN
  PERFORM assert_role(p_actor_id, ARRAY['boss']);
  v_vid := (payload->>'venue_id')::UUID;
  v_from := (payload->>'effective_from')::DATE;

  UPDATE venue_profit_rules
  SET effective_to = v_from - 1
  WHERE venue_id = v_vid AND is_active = true
    AND (effective_to IS NULL OR effective_to >= v_from);

  INSERT INTO venue_profit_rules (
    venue_id, rule_name, settlement_type,
    effective_from, default_cost_basis, venue_share_type,
    venue_share_rate, venue_share_fixed, company_margin_rate,
    ambassador_commission_basis, settlement_cycle, payment_terms_days,
    note, created_by
  ) VALUES (
    v_vid, payload->>'rule_name', payload->>'settlement_type',
    v_from, payload->>'default_cost_basis', payload->>'venue_share_type',
    COALESCE((payload->>'venue_share_rate')::NUMERIC, 0),
    COALESCE((payload->>'venue_share_fixed')::NUMERIC, 0),
    COALESCE((payload->>'company_margin_rate')::NUMERIC, 0),
    payload->>'ambassador_commission_basis',
    payload->>'settlement_cycle',
    COALESCE((payload->>'payment_terms_days')::INT, 30),
    payload->>'note', p_actor_id
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'rule_id', v_id);
END $$;

-- ---------------------------------------------------------------------------
-- 【E】會計報表
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION generate_accounting_payroll_report(p_period_id UUID, p_actor_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_rid UUID; BEGIN
  PERFORM assert_role(p_actor_id, ARRAY['boss','staff']);

  INSERT INTO accounting_payroll_reports (payroll_period_id, generated_by, generated_at, status)
  VALUES (p_period_id, p_actor_id, now(), 'generated')
  RETURNING id INTO v_rid;

  INSERT INTO accounting_payroll_report_items (
    report_id, ambassador_id, payroll_item_id,
    hourly_pay, commission_amount, pending_commission, payable_commission,
    bonus_amount, deduction_amount, adjustment_amount, total_payable, payment_status
  )
  SELECT v_rid, api.ambassador_id, api.id,
         api.hourly_pay, api.commission_amount, api.pending_commission_amount, api.payable_commission_amount,
         api.bonus_amount, api.deduction_amount, api.adjustment_amount, api.total_payable_amount, api.status
  FROM ambassador_payroll_items api
  WHERE api.payroll_period_id = p_period_id;

  -- 匯總
  UPDATE accounting_payroll_reports SET
    total_payable = (SELECT COALESCE(SUM(total_payable),0) FROM accounting_payroll_report_items WHERE report_id = v_rid),
    total_pending = (SELECT COALESCE(SUM(pending_commission),0) FROM accounting_payroll_report_items WHERE report_id = v_rid),
    total_adjustments = (SELECT COALESCE(SUM(adjustment_amount),0) FROM accounting_payroll_report_items WHERE report_id = v_rid)
  WHERE id = v_rid;

  RETURN jsonb_build_object('success', true, 'report_id', v_rid);
END $$;

CREATE OR REPLACE FUNCTION finalize_accounting_payroll_report(p_report_id UUID, p_actor_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM assert_role(p_actor_id, ARRAY['boss']);
  UPDATE accounting_payroll_reports
  SET status='finalized', finalized_at=now()
  WHERE id=p_report_id AND status IN ('generated','boss_reviewed','accounting_confirmed');
  RETURN jsonb_build_object('success', true);
END $$;

-- ---------------------------------------------------------------------------
-- 【F】Onboarding
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_onboarding_profile(payload JSONB, p_actor_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id UUID; BEGIN
  PERFORM assert_role(p_actor_id, ARRAY['boss','staff']);
  INSERT INTO staff_onboarding_profiles (
    person_type, name, phone, email, id_number_masked,
    emergency_contact, emergency_phone, start_date,
    assigned_role, assigned_venue_id, assigned_supervisor_id,
    status, created_by
  ) VALUES (
    payload->>'person_type', payload->>'name', payload->>'phone', payload->>'email',
    payload->>'id_number_masked',
    payload->>'emergency_contact', payload->>'emergency_phone',
    NULLIF(payload->>'start_date','')::DATE,
    payload->>'assigned_role',
    NULLIF(payload->>'assigned_venue_id','')::UUID,
    NULLIF(payload->>'assigned_supervisor_id','')::UUID,
    'pending_documents', p_actor_id
  ) RETURNING id INTO v_id;

  -- 自動建立預設任務清單
  INSERT INTO staff_onboarding_tasks (onboarding_profile_id, task_type, title)
  VALUES
    (v_id, 'collect_documents', '收集文件'),
    (v_id, 'sign_contract', '簽訂合約'),
    (v_id, 'create_account', '建立系統帳號'),
    (v_id, 'assign_role', '分配角色權限'),
    (v_id, 'configure_compensation', '設定薪資規則'),
    (v_id, 'training', '教育訓練');

  RETURN jsonb_build_object('success', true, 'profile_id', v_id);
END $$;

CREATE OR REPLACE FUNCTION provision_staff_account(p_profile_id UUID, p_actor_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_p staff_onboarding_profiles%ROWTYPE;
  v_account_id UUID;
BEGIN
  PERFORM assert_role(p_actor_id, ARRAY['boss','staff']);
  SELECT * INTO v_p FROM staff_onboarding_profiles WHERE id = p_profile_id;

  IF v_p.person_type = 'ambassador' THEN
    -- 建立 ambassadors 列
    INSERT INTO ambassadors (ambassador_code, name, phone, default_venue_id, is_active)
    VALUES (
      COALESCE((SELECT MAX(ambassador_code) FROM ambassadors), 'A0000'),  -- MVP: 需前端指定
      v_p.name, v_p.phone, v_p.assigned_venue_id, false
    ) RETURNING id INTO v_account_id;
  ELSIF v_p.person_type IN ('employee','hq_staff','warehouse','supervisor') THEN
    -- 員工需在 employees 手動建；這邊只寫 provisioning 紀錄
    v_account_id := NULL;
  END IF;

  INSERT INTO staff_account_provisioning (
    onboarding_profile_id, target_system, account_id, role, status, created_by
  ) VALUES (
    p_profile_id,
    CASE v_p.person_type WHEN 'ambassador' THEN 'ambassador_app' ELSE 'staff_platform' END,
    v_account_id, v_p.assigned_role, 'created', p_actor_id
  );

  UPDATE staff_onboarding_profiles SET status='account_created' WHERE id = p_profile_id;

  RETURN jsonb_build_object('success', true, 'account_id', v_account_id);
END $$;

CREATE OR REPLACE FUNCTION activate_onboarding_profile(p_profile_id UUID, p_actor_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM assert_role(p_actor_id, ARRAY['boss']);
  -- 確認所有必要文件 verified、所有任務 done、薪資 profile 已設
  IF EXISTS (
    SELECT 1 FROM staff_onboarding_documents
    WHERE onboarding_profile_id = p_profile_id AND status <> 'verified'
  ) THEN
    RAISE EXCEPTION 'documents not all verified';
  END IF;
  IF EXISTS (
    SELECT 1 FROM staff_onboarding_tasks
    WHERE onboarding_profile_id = p_profile_id AND status <> 'done'
  ) THEN
    RAISE EXCEPTION 'tasks not all done';
  END IF;

  UPDATE staff_onboarding_profiles SET status='active' WHERE id=p_profile_id;

  -- 同步啟用 account
  UPDATE staff_account_provisioning SET status='active' WHERE onboarding_profile_id=p_profile_id;
  UPDATE ambassadors SET is_active = true
  WHERE id IN (SELECT account_id FROM staff_account_provisioning WHERE onboarding_profile_id=p_profile_id);

  RETURN jsonb_build_object('success', true);
END $$;

-- ---------------------------------------------------------------------------
-- 【戰情室】get_boss_payroll_dashboard（彙整給戰情室頁）
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_boss_payroll_dashboard()
RETURNS JSONB LANGUAGE sql SECURITY DEFINER AS $$
  SELECT jsonb_build_object(
    'current_period', (SELECT row_to_json(s) FROM ambassador_payroll_summary_view s
                       ORDER BY (SELECT period_start FROM ambassador_payroll_periods WHERE id = s.period_id) DESC LIMIT 1),
    'venue_profit_30d', (SELECT jsonb_agg(row_to_json(v) ORDER BY v.revenue DESC)
                         FROM venue_profit_summary_view v WHERE v.sale_date > now() - interval '30 days'),
    'collection_impact', (SELECT jsonb_agg(row_to_json(c)) FROM collection_payroll_impact_view c),
    'onboarding', (SELECT jsonb_agg(row_to_json(o)) FROM onboarding_dashboard_view o)
  );
$$;

-- ============================================================================
-- Phase 2（🟡）待做 RPC 清單：
--   upsert_ambassador_commission_rule / upsert_ambassador_commission_tier
--   get_ambassador_payroll_preview / get_ambassador_payroll_detail
--   mark_collection_verified (已在 hardening.sql 的 hq_verify_collection 處理)
--   update_payroll_payable_by_collection_status (已由 trg_collection_payable 處理)
--   get_pending_commission_due_to_uncollected
--   export_accounting_payroll_report_csv / _pdf
--   upload_onboarding_document / verify_onboarding_document / complete_onboarding_task
--   configure_onboarding_compensation
--   get_venue_profit_ranking / get_onboarding_dashboard
-- ============================================================================
