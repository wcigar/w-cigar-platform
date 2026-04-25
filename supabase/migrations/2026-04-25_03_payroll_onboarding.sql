-- ============================================================================
-- Migration 03 · PAYROLL + ONBOARDING (2026-04-25)
-- 依賴：2026-04-25_ambassador_supply_chain.sql、2026-04-25_02_hardening.sql
-- 範圍：
--   A. 大使薪資規則（profile / commission rules / tiers / hourly logs）
--   B. 場域利潤規則（venue profit rules + items）
--   C. 銷售利潤薪資快照（sales_profit_snapshots）
--   D. 薪資週期與薪資單（periods / items / item_details / adjustments）
--   E. 會計報表（accounting_payroll_reports / items）
--   F. 新進人員 onboarding（profiles / documents / tasks / account_provisioning）
-- Status: DRAFT — DO NOT APPLY.
-- ============================================================================

BEGIN;

-- ============================================================================
-- A. 大使薪資規則
-- ============================================================================

-- A1. ambassador_compensation_profiles
CREATE TABLE IF NOT EXISTS ambassador_compensation_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ambassador_id UUID NOT NULL REFERENCES ambassadors(id) ON DELETE RESTRICT,
  profile_name TEXT NOT NULL,
  employment_type TEXT NOT NULL
    CHECK (employment_type IN ('hourly','commission_only','base_plus_commission','contractor','custom')),
  base_salary NUMERIC(12,2) DEFAULT 0,
  hourly_rate NUMERIC(10,2) DEFAULT 0,
  default_commission_type TEXT
    CHECK (default_commission_type IN ('revenue','gross_profit','net_profit','collected_amount')),
  default_commission_rate NUMERIC(6,4),        -- 0.0250 = 2.5%
  minimum_guarantee NUMERIC(12,2) DEFAULT 0,
  effective_from DATE NOT NULL,
  effective_to DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  created_by UUID REFERENCES employees(id),
  approved_by UUID REFERENCES employees(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comp_profile_amb ON ambassador_compensation_profiles(ambassador_id, is_active);
CREATE INDEX IF NOT EXISTS idx_comp_profile_effective ON ambassador_compensation_profiles(effective_from, effective_to);

-- 同一大使在同一日期區間只能有一個 active profile
CREATE UNIQUE INDEX IF NOT EXISTS uq_comp_profile_active_per_amb
  ON ambassador_compensation_profiles(ambassador_id)
  WHERE is_active = true AND effective_to IS NULL AND status = 'active';

-- A2. ambassador_commission_rules（細部場域 / 品類 / 商品）
CREATE TABLE IF NOT EXISTS ambassador_commission_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compensation_profile_id UUID REFERENCES ambassador_compensation_profiles(id) ON DELETE CASCADE,
  ambassador_id UUID NOT NULL REFERENCES ambassadors(id),
  venue_id UUID REFERENCES venues(id),
  product_category TEXT
    CHECK (product_category IN ('cuban_cigar','non_cuban_cigar','accessory','drink','other')),
  product_id UUID REFERENCES inventory_master(id),
  brand TEXT,
  commission_type TEXT NOT NULL
    CHECK (commission_type IN ('revenue','gross_profit','net_profit','collected_amount')),
  commission_rate NUMERIC(6,4),
  fixed_commission_amount NUMERIC(10,2),
  effective_from DATE NOT NULL,
  effective_to DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comm_rule_amb ON ambassador_commission_rules(ambassador_id, is_active);
CREATE INDEX IF NOT EXISTS idx_comm_rule_scope ON ambassador_commission_rules(ambassador_id, venue_id, product_category, product_id);

-- A3. ambassador_commission_tiers（階梯）
CREATE TABLE IF NOT EXISTS ambassador_commission_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compensation_profile_id UUID REFERENCES ambassador_compensation_profiles(id) ON DELETE CASCADE,
  ambassador_id UUID NOT NULL REFERENCES ambassadors(id),
  tier_basis TEXT NOT NULL
    CHECK (tier_basis IN ('monthly_revenue','monthly_gross_profit','monthly_collected_amount','monthly_quantity')),
  min_amount NUMERIC(12,2) NOT NULL,
  max_amount NUMERIC(12,2),                    -- NULL = 無上限
  commission_rate NUMERIC(6,4),
  bonus_amount NUMERIC(10,2),
  effective_from DATE NOT NULL,
  effective_to DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tier_amb ON ambassador_commission_tiers(ambassador_id, is_active);

-- A4. ambassador_hourly_logs（工時，**非打卡**，由 HQ 登錄/班表/固定/任務）
CREATE TABLE IF NOT EXISTS ambassador_hourly_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ambassador_id UUID NOT NULL REFERENCES ambassadors(id),
  venue_id UUID REFERENCES venues(id),
  work_date DATE NOT NULL,
  hours NUMERIC(5,2) NOT NULL CHECK (hours > 0),
  hourly_rate_snapshot NUMERIC(10,2) NOT NULL,
  amount NUMERIC(12,2) GENERATED ALWAYS AS (hours * hourly_rate_snapshot) STORED,
  source_type TEXT NOT NULL
    CHECK (source_type IN ('manual','schedule','approved_task','monthly_fixed')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','submitted','reviewed','approved','rejected')),
  submitted_by UUID REFERENCES employees(id),
  reviewed_by UUID REFERENCES employees(id),
  approved_by UUID REFERENCES employees(id),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hourly_amb_date ON ambassador_hourly_logs(ambassador_id, work_date);
CREATE INDEX IF NOT EXISTS idx_hourly_status ON ambassador_hourly_logs(status);
-- 防重複：同大使同場域同日 approved 工時唯一
CREATE UNIQUE INDEX IF NOT EXISTS uq_hourly_approved
  ON ambassador_hourly_logs(ambassador_id, venue_id, work_date, source_type)
  WHERE status = 'approved';

-- ============================================================================
-- B. 場域利潤規則
-- ============================================================================

-- B1. venue_profit_rules
CREATE TABLE IF NOT EXISTS venue_profit_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id),
  rule_name TEXT NOT NULL,
  settlement_type TEXT NOT NULL
    CHECK (settlement_type IN ('consignment','revenue_share','wholesale','fixed_margin','monthly_settlement','custom')),
  effective_from DATE NOT NULL,
  effective_to DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  default_cost_basis TEXT
    CHECK (default_cost_basis IN ('product_cost','fixed_cost','manual_cost')),
  venue_share_type TEXT
    CHECK (venue_share_type IN ('percentage','fixed_amount','none')),
  venue_share_rate NUMERIC(6,4),           -- 若 percentage
  venue_share_fixed NUMERIC(10,2),         -- 若 fixed_amount
  company_margin_rate NUMERIC(6,4),
  ambassador_commission_basis TEXT
    CHECK (ambassador_commission_basis IN ('revenue','gross_profit','net_profit','collected_amount')),
  settlement_cycle TEXT
    CHECK (settlement_cycle IN ('daily','weekly','monthly','custom')),
  payment_terms_days INT DEFAULT 30,
  note TEXT,
  created_by UUID REFERENCES employees(id),
  approved_by UUID REFERENCES employees(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_venue_profit_venue ON venue_profit_rules(venue_id, is_active);
CREATE UNIQUE INDEX IF NOT EXISTS uq_venue_profit_active
  ON venue_profit_rules(venue_id)
  WHERE is_active = true AND effective_to IS NULL;

-- B2. venue_profit_rule_items（同場域不同商品/品類 override）
CREATE TABLE IF NOT EXISTS venue_profit_rule_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES venue_profit_rules(id) ON DELETE CASCADE,
  product_id UUID REFERENCES inventory_master(id),
  product_category TEXT,
  brand TEXT,
  cost_override NUMERIC(10,2),
  venue_share_rate_override NUMERIC(6,4),
  company_margin_rate_override NUMERIC(6,4),
  commission_rate_override NUMERIC(6,4),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vp_rule_items_rule ON venue_profit_rule_items(rule_id);

-- ============================================================================
-- C. 銷售利潤薪資快照（歷史凍結）
-- ============================================================================
CREATE TABLE IF NOT EXISTS sales_profit_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_item_id UUID NOT NULL UNIQUE REFERENCES venue_sales_items(id) ON DELETE CASCADE,
  sales_daily_id UUID NOT NULL REFERENCES venue_sales_daily(id),
  venue_id UUID NOT NULL REFERENCES venues(id),
  ambassador_id UUID REFERENCES ambassadors(id),
  product_id UUID NOT NULL REFERENCES inventory_master(id),
  sale_date DATE NOT NULL,
  quantity INT NOT NULL,
  revenue_amount NUMERIC(12,2) NOT NULL,
  product_cost_snapshot NUMERIC(12,2),
  venue_share_snapshot NUMERIC(12,2),
  company_gross_profit NUMERIC(12,2),
  company_net_profit NUMERIC(12,2),
  commission_basis TEXT,
  commission_rate_snapshot NUMERIC(6,4),
  hourly_rate_snapshot NUMERIC(10,2),
  estimated_commission NUMERIC(12,2),
  payable_commission NUMERIC(12,2) DEFAULT 0,   -- 初始 0，收帳 verified 後由 RPC 填
  venue_profit_rule_id UUID REFERENCES venue_profit_rules(id),
  compensation_profile_id UUID REFERENCES ambassador_compensation_profiles(id),
  commission_rule_id UUID REFERENCES ambassador_commission_rules(id),
  collection_status_snapshot TEXT,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sps_amb_date ON sales_profit_snapshots(ambassador_id, sale_date);
CREATE INDEX IF NOT EXISTS idx_sps_venue_date ON sales_profit_snapshots(venue_id, sale_date);
CREATE INDEX IF NOT EXISTS idx_sps_period ON sales_profit_snapshots(sale_date);

-- ============================================================================
-- D. 薪資週期與薪資單
-- ============================================================================

-- D1. ambassador_payroll_periods
CREATE TABLE IF NOT EXISTS ambassador_payroll_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_name TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL CHECK (period_end >= period_start),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN (
      'open','calculating','calculated','boss_reviewing','boss_approved',
      'accounting_reviewing','accounting_confirmed','payment_scheduled','paid','locked','cancelled'
    )),
  total_sales NUMERIC(14,2) DEFAULT 0,
  total_collected NUMERIC(14,2) DEFAULT 0,
  total_gross_profit NUMERIC(14,2) DEFAULT 0,
  total_commission NUMERIC(14,2) DEFAULT 0,
  total_hourly_pay NUMERIC(14,2) DEFAULT 0,
  total_bonus NUMERIC(14,2) DEFAULT 0,
  total_deductions NUMERIC(14,2) DEFAULT 0,
  total_adjustments NUMERIC(14,2) DEFAULT 0,
  total_payable NUMERIC(14,2) DEFAULT 0,
  boss_reviewed_by UUID REFERENCES employees(id),
  boss_reviewed_at TIMESTAMPTZ,
  accounting_confirmed_by UUID REFERENCES employees(id),
  accounting_confirmed_at TIMESTAMPTZ,
  paid_by UUID REFERENCES employees(id),
  paid_at TIMESTAMPTZ,
  locked_by UUID REFERENCES employees(id),
  locked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (period_start, period_end)
);
CREATE INDEX IF NOT EXISTS idx_payroll_period_status ON ambassador_payroll_periods(status);

-- D2. ambassador_payroll_items
CREATE TABLE IF NOT EXISTS ambassador_payroll_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_period_id UUID NOT NULL REFERENCES ambassador_payroll_periods(id) ON DELETE CASCADE,
  ambassador_id UUID NOT NULL REFERENCES ambassadors(id),
  compensation_profile_id UUID REFERENCES ambassador_compensation_profiles(id),
  base_salary NUMERIC(12,2) DEFAULT 0,
  hourly_rate_snapshot NUMERIC(10,2),
  approved_hours NUMERIC(8,2) DEFAULT 0,
  hourly_pay NUMERIC(12,2) DEFAULT 0,
  sales_amount NUMERIC(14,2) DEFAULT 0,
  collected_amount NUMERIC(14,2) DEFAULT 0,
  pending_collection_amount NUMERIC(14,2) DEFAULT 0,
  gross_profit NUMERIC(14,2) DEFAULT 0,
  commission_amount NUMERIC(14,2) DEFAULT 0,
  pending_commission_amount NUMERIC(14,2) DEFAULT 0,
  payable_commission_amount NUMERIC(14,2) DEFAULT 0,
  bonus_amount NUMERIC(12,2) DEFAULT 0,
  deduction_amount NUMERIC(12,2) DEFAULT 0,
  adjustment_amount NUMERIC(12,2) DEFAULT 0,
  total_estimated_pay NUMERIC(14,2) DEFAULT 0,
  total_recognized_pay NUMERIC(14,2) DEFAULT 0,
  total_payable_amount NUMERIC(14,2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending','calculated','boss_reviewing','boss_approved',
      'accounting_reviewing','accounting_confirmed','payment_scheduled',
      'paid','disputed','adjusted','locked'
    )),
  boss_note TEXT,
  accounting_note TEXT,
  payment_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (payroll_period_id, ambassador_id)
);
CREATE INDEX IF NOT EXISTS idx_payroll_items_period ON ambassador_payroll_items(payroll_period_id);
CREATE INDEX IF NOT EXISTS idx_payroll_items_amb ON ambassador_payroll_items(ambassador_id);

-- D3. ambassador_payroll_item_details
CREATE TABLE IF NOT EXISTS ambassador_payroll_item_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_item_id UUID NOT NULL REFERENCES ambassador_payroll_items(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL
    CHECK (source_type IN ('sale','hourly','bonus','deduction','adjustment','clawback')),
  sales_daily_id UUID REFERENCES venue_sales_daily(id),
  sales_item_id UUID REFERENCES venue_sales_items(id),
  hourly_log_id UUID REFERENCES ambassador_hourly_logs(id),
  venue_id UUID REFERENCES venues(id),
  product_id UUID REFERENCES inventory_master(id),
  sale_date DATE,
  quantity INT,
  revenue_amount NUMERIC(12,2),
  collected_amount NUMERIC(12,2),
  gross_profit NUMERIC(12,2),
  commission_rate_snapshot NUMERIC(6,4),
  commission_amount NUMERIC(12,2),
  hourly_rate_snapshot NUMERIC(10,2),
  hours NUMERIC(5,2),
  hourly_amount NUMERIC(12,2),
  status TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payroll_details_item ON ambassador_payroll_item_details(payroll_item_id);

-- D4. payroll_adjustments
CREATE TABLE IF NOT EXISTS payroll_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_period_id UUID REFERENCES ambassador_payroll_periods(id),
  payroll_item_id UUID REFERENCES ambassador_payroll_items(id),
  ambassador_id UUID NOT NULL REFERENCES ambassadors(id),
  adjustment_type TEXT NOT NULL
    CHECK (adjustment_type IN (
      'bonus','deduction','correction','clawback','manual_adjustment',
      'collection_discrepancy','inventory_shortage'
    )),
  amount NUMERIC(12,2) NOT NULL,       -- 正負皆可
  reason TEXT NOT NULL,
  related_source_type TEXT,
  related_source_id UUID,
  requires_boss_approval BOOLEAN NOT NULL DEFAULT true,
  approved_by UUID REFERENCES employees(id),
  approved_at TIMESTAMPTZ,
  created_by UUID REFERENCES employees(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payroll_adj_period ON payroll_adjustments(payroll_period_id);
CREATE INDEX IF NOT EXISTS idx_payroll_adj_amb ON payroll_adjustments(ambassador_id);

-- ============================================================================
-- E. 會計報表
-- ============================================================================
CREATE SEQUENCE IF NOT EXISTS doc_seq_accounting_report;

CREATE TABLE IF NOT EXISTS accounting_payroll_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_no TEXT UNIQUE,
  payroll_period_id UUID NOT NULL REFERENCES ambassador_payroll_periods(id),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','generated','boss_reviewed','accounting_confirmed','finalized')),
  total_payable NUMERIC(14,2) DEFAULT 0,
  total_paid NUMERIC(14,2) DEFAULT 0,
  total_pending NUMERIC(14,2) DEFAULT 0,
  total_adjustments NUMERIC(14,2) DEFAULT 0,
  generated_by UUID REFERENCES employees(id),
  generated_at TIMESTAMPTZ,
  boss_reviewed_by UUID REFERENCES employees(id),
  boss_reviewed_at TIMESTAMPTZ,
  accounting_confirmed_by UUID REFERENCES employees(id),
  accounting_confirmed_at TIMESTAMPTZ,
  finalized_at TIMESTAMPTZ,
  report_version INT NOT NULL DEFAULT 1,
  file_url TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_acc_report_period ON accounting_payroll_reports(payroll_period_id);

-- 自動 report_no
CREATE OR REPLACE FUNCTION trg_fill_report_no()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.report_no IS NULL THEN
    NEW.report_no := gen_doc_no('APR','doc_seq_accounting_report');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_accounting_report_no ON accounting_payroll_reports;
CREATE TRIGGER trg_accounting_report_no BEFORE INSERT ON accounting_payroll_reports
  FOR EACH ROW EXECUTE FUNCTION trg_fill_report_no();

CREATE TABLE IF NOT EXISTS accounting_payroll_report_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES accounting_payroll_reports(id) ON DELETE CASCADE,
  ambassador_id UUID NOT NULL REFERENCES ambassadors(id),
  payroll_item_id UUID REFERENCES ambassador_payroll_items(id),
  hourly_pay NUMERIC(12,2) DEFAULT 0,
  commission_amount NUMERIC(12,2) DEFAULT 0,
  pending_commission NUMERIC(12,2) DEFAULT 0,
  payable_commission NUMERIC(12,2) DEFAULT 0,
  bonus_amount NUMERIC(12,2) DEFAULT 0,
  deduction_amount NUMERIC(12,2) DEFAULT 0,
  adjustment_amount NUMERIC(12,2) DEFAULT 0,
  total_payable NUMERIC(12,2) DEFAULT 0,
  payment_status TEXT,
  accounting_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_acc_report_items_report ON accounting_payroll_report_items(report_id);

-- ============================================================================
-- F. 新進人員 onboarding
-- ============================================================================

-- F1. staff_onboarding_profiles
CREATE TABLE IF NOT EXISTS staff_onboarding_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_type TEXT NOT NULL
    CHECK (person_type IN ('employee','ambassador','supervisor','warehouse','hq_staff')),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  id_number_masked TEXT,                -- 僅存遮罩後末 4 碼等
  emergency_contact TEXT,
  emergency_phone TEXT,
  start_date DATE,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft','pending_documents','pending_review','approved','account_created',
      'compensation_configured','training','active','rejected','resigned'
    )),
  assigned_role TEXT,                   -- 'boss'/'staff'/'warehouse'/'supervisor'/'ambassador'
  assigned_venue_id UUID REFERENCES venues(id),
  assigned_supervisor_id UUID REFERENCES employees(id),
  compensation_profile_id UUID REFERENCES ambassador_compensation_profiles(id),
  created_by UUID REFERENCES employees(id),
  reviewed_by UUID REFERENCES employees(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_onboarding_status ON staff_onboarding_profiles(status);
CREATE INDEX IF NOT EXISTS idx_onboarding_type ON staff_onboarding_profiles(person_type);

-- F2. staff_onboarding_documents
CREATE TABLE IF NOT EXISTS staff_onboarding_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_profile_id UUID NOT NULL REFERENCES staff_onboarding_profiles(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL
    CHECK (document_type IN (
      'id_card','bank_book','contract','nda','personal_data_consent',
      'training_acknowledgement','compensation_agreement','other'
    )),
  file_url TEXT,
  status TEXT NOT NULL DEFAULT 'missing'
    CHECK (status IN ('missing','uploaded','verified','rejected')),
  verified_by UUID REFERENCES employees(id),
  verified_at TIMESTAMPTZ,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_onboarding_docs_profile ON staff_onboarding_documents(onboarding_profile_id);

-- F3. staff_onboarding_tasks
CREATE TABLE IF NOT EXISTS staff_onboarding_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_profile_id UUID NOT NULL REFERENCES staff_onboarding_profiles(id) ON DELETE CASCADE,
  task_type TEXT NOT NULL
    CHECK (task_type IN (
      'collect_documents','sign_contract','create_account','assign_role',
      'assign_venue','configure_compensation','training','system_permission',
      'uniform','equipment'
    )),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','in_progress','done','blocked')),
  assigned_to UUID REFERENCES employees(id),
  due_date DATE,
  completed_by UUID REFERENCES employees(id),
  completed_at TIMESTAMPTZ,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_onboarding_tasks_profile ON staff_onboarding_tasks(onboarding_profile_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_tasks_status ON staff_onboarding_tasks(status);

-- F4. staff_account_provisioning
CREATE TABLE IF NOT EXISTS staff_account_provisioning (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_profile_id UUID NOT NULL REFERENCES staff_onboarding_profiles(id) ON DELETE CASCADE,
  target_system TEXT NOT NULL
    CHECK (target_system IN ('staff_platform','ambassador_app','warehouse','supervisor_collection','pos')),
  account_id UUID,                      -- 指向 employees.id 或 ambassadors.id
  role TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','created','active','disabled')),
  created_by UUID REFERENCES employees(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_provisioning_profile ON staff_account_provisioning(onboarding_profile_id);

-- ============================================================================
-- G. updated_at trigger 統一
-- ============================================================================
DO $$ DECLARE t TEXT; BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'ambassador_compensation_profiles','ambassador_commission_rules','ambassador_commission_tiers',
    'ambassador_hourly_logs','venue_profit_rules','venue_profit_rule_items',
    'ambassador_payroll_periods','ambassador_payroll_items',
    'staff_onboarding_profiles','staff_account_provisioning'
  ])
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_touch ON %s;', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_touch BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION touch_updated_at();', t, t);
  END LOOP;
END $$;

-- ============================================================================
-- H. Views
-- ============================================================================

-- H1. 大使每期薪資統計（給老闆戰情室用）
CREATE OR REPLACE VIEW ambassador_payroll_summary_view AS
SELECT
  app.id AS period_id,
  app.period_name,
  app.status AS period_status,
  COUNT(api.*) AS ambassador_count,
  COUNT(api.*) FILTER (WHERE api.status = 'accounting_confirmed') AS confirmed_count,
  COUNT(api.*) FILTER (WHERE api.status IN ('pending','calculated','boss_reviewing')) AS pending_count,
  COUNT(api.*) FILTER (WHERE api.status = 'disputed') AS disputed_count,
  SUM(api.total_payable_amount) AS total_payable,
  SUM(api.pending_commission_amount) AS total_pending_commission
FROM ambassador_payroll_periods app
LEFT JOIN ambassador_payroll_items api ON api.payroll_period_id = app.id
GROUP BY app.id, app.period_name, app.status;

-- H2. 場域利潤總表（會議憑據）
CREATE OR REPLACE VIEW venue_profit_summary_view AS
SELECT
  v.id AS venue_id,
  v.name AS venue_name,
  sps.sale_date,
  SUM(sps.revenue_amount) AS revenue,
  SUM(sps.product_cost_snapshot) AS cost,
  SUM(sps.venue_share_snapshot) AS venue_share,
  SUM(sps.company_gross_profit) AS company_gross,
  SUM(sps.estimated_commission) AS ambassador_commission_cost,
  SUM(sps.company_gross_profit - sps.estimated_commission) AS company_net_est
FROM sales_profit_snapshots sps
JOIN venues v ON v.id = sps.venue_id
GROUP BY v.id, v.name, sps.sale_date;

-- H3. 收帳 × 薪資關聯（戰情室用：哪些店未收 → 影響哪些大使獎金）
CREATE OR REPLACE VIEW collection_payroll_impact_view AS
SELECT
  v.id AS venue_id,
  v.name AS venue_name,
  v.supervisor_id,
  cr.status AS collection_status,
  cr.due_amount,
  cr.collected_amount,
  (cr.due_amount - COALESCE(cr.collected_amount,0)) AS outstanding,
  COUNT(DISTINCT sps.ambassador_id) AS affected_ambassadors,
  SUM(sps.estimated_commission) AS pending_commission_total
FROM collection_records cr
JOIN venue_sales_daily vsd ON vsd.id = cr.sale_id
JOIN venues v ON v.id = vsd.venue_id
LEFT JOIN sales_profit_snapshots sps ON sps.sales_daily_id = vsd.id
WHERE cr.status IN ('pending','partially_collected','collected','discrepancy','overdue')
GROUP BY v.id, v.name, v.supervisor_id, cr.id, cr.status, cr.due_amount, cr.collected_amount;

-- H4. Onboarding dashboard
CREATE OR REPLACE VIEW onboarding_dashboard_view AS
SELECT
  status,
  person_type,
  COUNT(*) AS count
FROM staff_onboarding_profiles
GROUP BY status, person_type;

-- ============================================================================
-- I. 薪資期鎖定 trigger（paid / locked 後禁改明細）
-- ============================================================================
CREATE OR REPLACE FUNCTION trg_block_locked_payroll_item()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_period_status TEXT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IN ('paid','locked') AND OLD.status = NEW.status THEN
      RAISE EXCEPTION 'Payroll item % is % — only clawback allowed via next period adjustment', OLD.id, OLD.status;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_payroll_item_lock ON ambassador_payroll_items;
CREATE TRIGGER trg_payroll_item_lock
  BEFORE UPDATE ON ambassador_payroll_items
  FOR EACH ROW EXECUTE FUNCTION trg_block_locked_payroll_item();

-- 薪資期狀態轉移驗證
CREATE OR REPLACE FUNCTION trg_payroll_period_transition()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE allowed TEXT[];
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status <> NEW.status THEN
    allowed := CASE NEW.status
      WHEN 'calculating'           THEN ARRAY['open']
      WHEN 'calculated'            THEN ARRAY['calculating']
      WHEN 'boss_reviewing'        THEN ARRAY['calculated']
      WHEN 'boss_approved'         THEN ARRAY['boss_reviewing']
      WHEN 'accounting_reviewing'  THEN ARRAY['boss_approved']
      WHEN 'accounting_confirmed'  THEN ARRAY['accounting_reviewing']
      WHEN 'payment_scheduled'     THEN ARRAY['accounting_confirmed']
      WHEN 'paid'                  THEN ARRAY['payment_scheduled']
      WHEN 'locked'                THEN ARRAY['paid']
      WHEN 'cancelled'             THEN ARRAY['open','calculating','calculated']
      ELSE NULL
    END;
    IF allowed IS NOT NULL AND NOT (OLD.status = ANY(allowed)) THEN
      RAISE EXCEPTION 'Invalid payroll period transition: % -> %', OLD.status, NEW.status;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_payroll_period_trans ON ambassador_payroll_periods;
CREATE TRIGGER trg_payroll_period_trans
  BEFORE UPDATE ON ambassador_payroll_periods
  FOR EACH ROW EXECUTE FUNCTION trg_payroll_period_transition();

-- ============================================================================
-- J. RLS 草稿（commented，等 Supabase Auth 上線再打開）
-- ============================================================================
-- ALTER TABLE ambassador_payroll_items ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY payroll_item_amb_self ON ambassador_payroll_items FOR SELECT
--   USING (ambassador_id = auth.uid()::uuid OR auth_is_boss());
--
-- ALTER TABLE ambassador_compensation_profiles ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY comp_profile_amb_self_read ON ambassador_compensation_profiles FOR SELECT
--   USING (ambassador_id = auth.uid()::uuid OR auth_is_boss());
-- -- 大使禁止看到完整毛利：ambassador_payroll_items 只暴露 total_payable_amount 等
-- -- 公司完整毛利 / commission_amount 要靠後端 RPC 依角色回不同欄位

COMMIT;

-- ============================================================================
-- Rollback（手動）
-- ============================================================================
-- DROP VIEW IF EXISTS collection_payroll_impact_view, venue_profit_summary_view,
--   ambassador_payroll_summary_view, onboarding_dashboard_view;
-- DROP TABLE IF EXISTS
--   staff_account_provisioning, staff_onboarding_tasks, staff_onboarding_documents, staff_onboarding_profiles,
--   accounting_payroll_report_items, accounting_payroll_reports,
--   payroll_adjustments, ambassador_payroll_item_details,
--   ambassador_payroll_items, ambassador_payroll_periods,
--   sales_profit_snapshots,
--   venue_profit_rule_items, venue_profit_rules,
--   ambassador_hourly_logs, ambassador_commission_tiers,
--   ambassador_commission_rules, ambassador_compensation_profiles CASCADE;
