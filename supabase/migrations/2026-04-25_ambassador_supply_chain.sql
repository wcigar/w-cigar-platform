-- ============================================================================
-- Migration: ambassador_supply_chain (2026-04-25)
-- Scope: 大使 + 酒店銷售 + 補貨 + 總倉出貨 + 大使收貨 + 耗材 + 收帳 + 異常 + 戰情室
-- Status: DRAFT — DO NOT APPLY until explicit confirmation.
-- 原則：
--   - 不動既有表（除了 employees 加 role_ext）
--   - 所有新表 RLS OFF（草稿用註解保留 policy，未來 Phase 2 打開）
--   - audit 動作統一寫既有 audit_logs（不新建）
--   - 不用 wc_ prefix
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. employees: 加 role_ext（擴充角色，不影響既有 is_admin / role）
-- ---------------------------------------------------------------------------
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS role_ext TEXT NULL
  CHECK (role_ext IN ('warehouse', 'supervisor'));

-- ---------------------------------------------------------------------------
-- 1. ambassadors
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ambassadors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ambassador_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT UNIQUE,
  pin_hash TEXT,                        -- MVP: 可先存明碼 PIN；Phase 2 改 bcrypt
  default_venue_id UUID,
  supervisor_id UUID REFERENCES employees(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  hired_at DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ambassadors_phone ON ambassadors(phone);
CREATE INDEX IF NOT EXISTS idx_ambassadors_supervisor ON ambassadors(supervisor_id);

-- ---------------------------------------------------------------------------
-- 2. venues
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS venues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT CHECK (type IN ('hotel','bar','lounge','other')) DEFAULT 'hotel',
  address TEXT,
  contact_name TEXT,
  contact_phone TEXT,
  supervisor_id UUID REFERENCES employees(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_venues_supervisor ON venues(supervisor_id);

-- FK: ambassadors.default_venue_id → venues.id
ALTER TABLE ambassadors
  ADD CONSTRAINT ambassadors_default_venue_fk
  FOREIGN KEY (default_venue_id) REFERENCES venues(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 3. ambassador_assignments（多對多：大使 ↔ 場域）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ambassador_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ambassador_id UUID NOT NULL REFERENCES ambassadors(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  released_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ambassador_assignments_active
  ON ambassador_assignments(ambassador_id, venue_id)
  WHERE released_at IS NULL;

-- ---------------------------------------------------------------------------
-- 4. supervisor_venue_scope（督導 ↔ 場域）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS supervisor_venue_scope (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supervisor_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (supervisor_id, venue_id)
);

-- ---------------------------------------------------------------------------
-- 5. venue_sales_daily + venue_sales_items
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS venue_sales_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_date DATE NOT NULL,
  venue_id UUID NOT NULL REFERENCES venues(id),
  ambassador_id UUID REFERENCES ambassadors(id),
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  cash_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  transfer_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  monthly_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  unpaid_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('paid','partial','unpaid','monthly')),
  note TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','voided')),
  created_by UUID REFERENCES employees(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_venue_sales_date ON venue_sales_daily(sale_date);
CREATE INDEX IF NOT EXISTS idx_venue_sales_venue_date ON venue_sales_daily(venue_id, sale_date);
CREATE INDEX IF NOT EXISTS idx_venue_sales_amb_date ON venue_sales_daily(ambassador_id, sale_date);

CREATE TABLE IF NOT EXISTS venue_sales_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES venue_sales_daily(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES inventory_master(id),
  quantity INT NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(10,2) NOT NULL,
  subtotal NUMERIC(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  note TEXT
);
CREATE INDEX IF NOT EXISTS idx_venue_sales_items_sale ON venue_sales_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_venue_sales_items_product ON venue_sales_items(product_id);

-- ---------------------------------------------------------------------------
-- 6. venue_inventory + venue_inventory_ledger
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS venue_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES inventory_master(id),
  on_hand INT NOT NULL DEFAULT 0,
  safety_stock INT NOT NULL DEFAULT 0,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (venue_id, product_id)
);

CREATE TABLE IF NOT EXISTS venue_inventory_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id),
  product_id UUID NOT NULL REFERENCES inventory_master(id),
  change_type TEXT NOT NULL CHECK (change_type IN ('sale','shipment_in','discrepancy_adj','manual_adj')),
  change_qty INT NOT NULL,            -- 正數入庫、負數出庫
  ref_type TEXT,
  ref_id UUID,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ledger_venue_product ON venue_inventory_ledger(venue_id, product_id);

-- ---------------------------------------------------------------------------
-- 7. replenishment_runs + replenishment_items
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS replenishment_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','confirmed','picking','shipped','closed')),
  total_items INT DEFAULT 0,
  total_qty INT DEFAULT 0,
  note TEXT,
  created_by UUID REFERENCES employees(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_replenishment_runs_date ON replenishment_runs(run_date DESC);

CREATE TABLE IF NOT EXISTS replenishment_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES replenishment_runs(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES venues(id),
  product_id UUID NOT NULL REFERENCES inventory_master(id),
  sold_qty INT NOT NULL DEFAULT 0,
  suggested_qty INT NOT NULL DEFAULT 0,
  actual_shipped_qty INT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','picked','shipped','received','short')),
  note TEXT
);
CREATE INDEX IF NOT EXISTS idx_replenishment_items_run ON replenishment_items(run_id);

-- ---------------------------------------------------------------------------
-- 8. warehouse_shipments + warehouse_shipment_items
-- ---------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS warehouse_shipment_seq;

CREATE TABLE IF NOT EXISTS warehouse_shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_no TEXT UNIQUE NOT NULL,           -- trigger 產 WS-YYMMDD-####
  run_id UUID REFERENCES replenishment_runs(id),
  venue_id UUID REFERENCES venues(id),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','picking','shipped','received')),
  picked_by UUID REFERENCES employees(id),
  shipped_by UUID REFERENCES employees(id),
  shipped_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shipments_run ON warehouse_shipments(run_id);
CREATE INDEX IF NOT EXISTS idx_shipments_venue ON warehouse_shipments(venue_id);

CREATE TABLE IF NOT EXISTS warehouse_shipment_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES warehouse_shipments(id) ON DELETE CASCADE,
  replenishment_item_id UUID REFERENCES replenishment_items(id),
  product_id UUID NOT NULL REFERENCES inventory_master(id),
  qty INT NOT NULL,
  note TEXT
);

-- ---------------------------------------------------------------------------
-- 9. ambassador_receipts + ambassador_receipt_discrepancies
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ambassador_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES warehouse_shipments(id),
  ambassador_id UUID NOT NULL REFERENCES ambassadors(id),
  venue_id UUID NOT NULL REFERENCES venues(id),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','discrepancy')),
  confirmed_at TIMESTAMPTZ,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_receipts_amb ON ambassador_receipts(ambassador_id, status);

CREATE TABLE IF NOT EXISTS ambassador_receipt_discrepancies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id UUID NOT NULL REFERENCES ambassador_receipts(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES inventory_master(id),
  issue_type TEXT NOT NULL CHECK (issue_type IN ('qty_mismatch','wrong_item','damaged','not_received')),
  reported_qty INT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 10. collection_records + collection_payments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS collection_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES venue_sales_daily(id) ON DELETE CASCADE,
  supervisor_id UUID REFERENCES employees(id),
  due_amount NUMERIC(12,2) NOT NULL,
  collected_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','partial','collected','exception')),
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_collection_status ON collection_records(status, due_date);

CREATE TABLE IF NOT EXISTS collection_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES collection_records(id) ON DELETE CASCADE,
  method TEXT NOT NULL CHECK (method IN ('cash','transfer','monthly')),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  proof_url TEXT,
  paid_by UUID REFERENCES employees(id),
  note TEXT
);

-- ---------------------------------------------------------------------------
-- 11. supply_items（9 固定品項 + 自由填）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS supply_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL
    CHECK (category IN ('cedar','humidity_pack','zip_bag','gas','flat_cutter','v_cutter','drill','pin','other')),
  unit TEXT NOT NULL DEFAULT '個',
  is_high_risk BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT DEFAULT 0
);

INSERT INTO supply_items (code, name, category, unit, is_high_risk, sort_order) VALUES
  ('cedar', '雪松木', 'cedar', '包', false, 1),
  ('humidity_pack', '保濕包', 'humidity_pack', '個', false, 2),
  ('zip_bag', '夾鏈袋', 'zip_bag', '包', false, 3),
  ('gas', '瓦斯罐', 'gas', '罐', true, 4),
  ('flat_cutter', '平剪', 'flat_cutter', '支', true, 5),
  ('v_cutter', 'V 剪', 'v_cutter', '支', true, 6),
  ('drill', '鑽孔器', 'drill', '支', true, 7),
  ('pin', '通針', 'pin', '支', true, 8),
  ('other', '其他', 'other', '-', false, 99)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 12. ambassador_supply_requests + items
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ambassador_supply_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ambassador_id UUID NOT NULL REFERENCES ambassadors(id),
  venue_id UUID REFERENCES venues(id),
  request_date DATE NOT NULL DEFAULT current_date,
  urgency TEXT NOT NULL DEFAULT 'normal' CHECK (urgency IN ('normal','urgent')),
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('draft','submitted','approved','adjusted_approved','rejected',
                      'picking','shipped','received','discrepancy','closed')),
  reason TEXT NOT NULL,
  note TEXT,
  has_high_risk BOOLEAN NOT NULL DEFAULT false,
  reviewed_by UUID REFERENCES employees(id),
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_supply_req_amb_status ON ambassador_supply_requests(ambassador_id, status);
CREATE INDEX IF NOT EXISTS idx_supply_req_status ON ambassador_supply_requests(status, request_date DESC);

CREATE TABLE IF NOT EXISTS ambassador_supply_request_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES ambassador_supply_requests(id) ON DELETE CASCADE,
  supply_item_id UUID NOT NULL REFERENCES supply_items(id),
  custom_name TEXT,
  requested_qty INT NOT NULL CHECK (requested_qty > 0),
  approved_qty INT,
  shipped_qty INT,
  received_qty INT,
  note TEXT
);

-- ---------------------------------------------------------------------------
-- 13. supply_shipments + items + receipt_discrepancies + inventory_ledger
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS supply_shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_no TEXT UNIQUE NOT NULL,           -- SS-YYMMDD-####
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','shipped','received','discrepancy')),
  shipped_by UUID REFERENCES employees(id),
  shipped_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS supply_shipment_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES supply_shipments(id) ON DELETE CASCADE,
  request_id UUID NOT NULL REFERENCES ambassador_supply_requests(id),
  request_item_id UUID REFERENCES ambassador_supply_request_items(id),
  qty INT NOT NULL
);

CREATE TABLE IF NOT EXISTS supply_receipt_discrepancies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES supply_shipments(id),
  request_item_id UUID REFERENCES ambassador_supply_request_items(id),
  issue_type TEXT NOT NULL CHECK (issue_type IN ('qty_mismatch','wrong_item','damaged','not_received')),
  reported_qty INT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS supply_inventory_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES venues(id),
  supply_item_id UUID NOT NULL REFERENCES supply_items(id),
  change_type TEXT NOT NULL CHECK (change_type IN ('shipment_in','manual_adj','discrepancy_adj')),
  change_qty INT NOT NULL,
  ref_type TEXT,
  ref_id UUID,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 14. exception_events（新表，不沿用 abnormal_reports）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS exception_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL CHECK (category IN (
    'shipment_qty_mismatch','receipt_qty_mismatch','venue_inventory',
    'collection_short','replenishment_overdue','receipt_overdue',
    'collection_overdue','supply_receipt','high_risk_supply'
  )),
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('critical','warning','info')),
  title TEXT NOT NULL,
  message TEXT,
  ref_type TEXT,
  ref_id UUID,
  venue_id UUID REFERENCES venues(id),
  ambassador_id UUID REFERENCES ambassadors(id),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','resolved','dismissed')),
  resolution TEXT,
  resolved_by UUID REFERENCES employees(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_exceptions_status ON exception_events(status, severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_exceptions_venue ON exception_events(venue_id);

-- ---------------------------------------------------------------------------
-- 15. updated_at 共用 trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE t TEXT; BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'ambassadors','venues','venue_sales_daily',
    'replenishment_runs','collection_records',
    'ambassador_supply_requests'
  ])
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_touch ON %s;', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_touch BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION touch_updated_at();', t, t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 16. Views（戰情室 / 排行）
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW boss_war_room_daily_view AS
SELECT
  s.sale_date,
  SUM(s.total_amount) AS total_amount,
  SUM(s.cash_amount) AS cash,
  SUM(s.transfer_amount) AS transfer,
  SUM(s.monthly_amount) AS monthly_pending,
  SUM(s.unpaid_amount) AS unpaid,
  COUNT(*) AS sale_count
FROM venue_sales_daily s
WHERE s.status = 'active'
GROUP BY s.sale_date;

CREATE OR REPLACE VIEW venue_sales_ranking_view AS
SELECT v.id AS venue_id, v.name AS venue_name, s.sale_date,
       SUM(s.total_amount) AS amount,
       SUM(vi.quantity) AS qty
FROM venue_sales_daily s
JOIN venues v ON v.id = s.venue_id
LEFT JOIN venue_sales_items vi ON vi.sale_id = s.id
WHERE s.status = 'active'
GROUP BY v.id, v.name, s.sale_date;

CREATE OR REPLACE VIEW ambassador_ranking_view AS
SELECT a.id AS ambassador_id, a.name, s.sale_date,
       SUM(s.total_amount) AS amount,
       SUM(vi.quantity) AS qty
FROM venue_sales_daily s
JOIN ambassadors a ON a.id = s.ambassador_id
LEFT JOIN venue_sales_items vi ON vi.sale_id = s.id
WHERE s.status = 'active'
GROUP BY a.id, a.name, s.sale_date;

CREATE OR REPLACE VIEW product_sales_ranking_view AS
SELECT im.id AS product_id, im.name AS product_name, s.sale_date,
       SUM(vi.quantity) AS qty,
       SUM(vi.subtotal) AS amount
FROM venue_sales_items vi
JOIN venue_sales_daily s ON s.id = vi.sale_id
JOIN inventory_master im ON im.id = vi.product_id
WHERE s.status = 'active'
GROUP BY im.id, im.name, s.sale_date;

CREATE OR REPLACE VIEW boss_supply_dashboard_view AS
SELECT status, COUNT(*) AS count
FROM ambassador_supply_requests
GROUP BY status;

CREATE OR REPLACE VIEW supply_usage_ranking_view AS
SELECT si.id AS supply_item_id, si.name,
       SUM(asri.received_qty) AS received_qty,
       COUNT(DISTINCT asr.ambassador_id) AS distinct_ambassadors
FROM ambassador_supply_request_items asri
JOIN ambassador_supply_requests asr ON asr.id = asri.request_id
JOIN supply_items si ON si.id = asri.supply_item_id
WHERE asr.status IN ('received','closed')
GROUP BY si.id, si.name;

CREATE OR REPLACE VIEW supply_exception_view AS
SELECT * FROM exception_events
WHERE category IN ('supply_receipt','high_risk_supply') AND status = 'open';

-- ---------------------------------------------------------------------------
-- 17. RLS policy 草稿（預設 OFF，未來 Phase 2 打開）
-- ---------------------------------------------------------------------------
-- ALTER TABLE ambassadors ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY ambassador_self_read ON ambassadors
--   FOR SELECT USING (auth.uid()::uuid = id);
-- CREATE POLICY ambassador_self_update ON ambassadors
--   FOR UPDATE USING (auth.uid()::uuid = id);
--
-- ALTER TABLE ambassador_supply_requests ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY asr_amb_own ON ambassador_supply_requests
--   FOR SELECT USING (ambassador_id = auth.uid()::uuid);
--
-- ALTER TABLE collection_records ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY col_supervisor_scope ON collection_records
--   FOR SELECT USING (
--     EXISTS (
--       SELECT 1 FROM supervisor_venue_scope svs
--       JOIN venue_sales_daily vsd ON vsd.id = sale_id
--       WHERE svs.venue_id = vsd.venue_id
--         AND svs.supervisor_id = auth.uid()::uuid
--     )
--   );

-- audit_logs 沿用既有表，無需新建

COMMIT;

-- ============================================================================
-- Rollback（手動執行）
-- ============================================================================
-- DROP VIEW IF EXISTS supply_exception_view, supply_usage_ranking_view,
--   boss_supply_dashboard_view, product_sales_ranking_view,
--   ambassador_ranking_view, venue_sales_ranking_view, boss_war_room_daily_view;
-- DROP TABLE IF EXISTS exception_events, supply_inventory_ledger,
--   supply_receipt_discrepancies, supply_shipment_items, supply_shipments,
--   ambassador_supply_request_items, ambassador_supply_requests, supply_items,
--   collection_payments, collection_records,
--   ambassador_receipt_discrepancies, ambassador_receipts,
--   warehouse_shipment_items, warehouse_shipments,
--   replenishment_items, replenishment_runs,
--   venue_inventory_ledger, venue_inventory,
--   venue_sales_items, venue_sales_daily,
--   supervisor_venue_scope, ambassador_assignments,
--   ambassadors, venues CASCADE;
-- ALTER TABLE employees DROP COLUMN IF EXISTS role_ext;
