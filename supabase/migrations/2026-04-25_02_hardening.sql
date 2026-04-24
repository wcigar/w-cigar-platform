-- ============================================================================
-- Migration 02 · HARDENING (2026-04-25)
-- 依賴：必須先 apply 2026-04-25_ambassador_supply_chain.sql
-- 範圍：10 類漏洞修補（資料真實性／補貨／庫存／登入／權限／收帳／耗材／統計／單據／冪等）
-- Status: DRAFT — DO NOT APPLY until reviewed.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 【1】資料真實性 · venue_sales_daily 狀態機
-- ---------------------------------------------------------------------------
ALTER TABLE venue_sales_daily DROP CONSTRAINT IF EXISTS venue_sales_daily_status_check;
ALTER TABLE venue_sales_daily
  ALTER COLUMN status SET DEFAULT 'draft',
  ADD CONSTRAINT venue_sales_daily_status_check CHECK (
    status IN ('draft','submitted','locked','adjusted','cancelled')
  );

ALTER TABLE venue_sales_daily
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked_by UUID REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES employees(id);

-- venue_sales_items 防重複：同 sale_id + product_id 僅能有 1 筆（除非 split）
ALTER TABLE venue_sales_items
  ADD COLUMN IF NOT EXISTS split_reason TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_venue_sales_items_sale_product_no_split
  ON venue_sales_items(sale_id, product_id)
  WHERE split_reason IS NULL;

-- 銷售送出後鎖定：locked / cancelled 禁改
CREATE OR REPLACE FUNCTION trg_block_locked_sales()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IN ('locked','cancelled') THEN
    -- 唯一容許：由 locked → adjusted（表示做過修正，見 sales_corrections）
    IF NOT (OLD.status = 'locked' AND NEW.status = 'adjusted') THEN
      RAISE EXCEPTION 'Locked / cancelled sale cannot be modified directly. Use sales_corrections RPC.';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_venue_sales_lock_guard ON venue_sales_daily;
CREATE TRIGGER trg_venue_sales_lock_guard
  BEFORE UPDATE ON venue_sales_daily
  FOR EACH ROW EXECUTE FUNCTION trg_block_locked_sales();

-- sales_corrections：銷售送出後的修正紀錄（所有修改走這張）
CREATE TABLE IF NOT EXISTS sales_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES venue_sales_daily(id) ON DELETE RESTRICT,
  correction_type TEXT NOT NULL CHECK (correction_type IN (
    'amount_adjust','item_add','item_remove','item_qty_change','payment_adjust','full_void'
  )),
  reason TEXT NOT NULL,
  before_snapshot JSONB NOT NULL,      -- 修改前完整快照
  after_snapshot JSONB NOT NULL,       -- 修改後完整快照
  delta_amount NUMERIC(12,2),
  approved_by UUID REFERENCES employees(id),
  created_by UUID NOT NULL REFERENCES employees(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sales_corrections_sale ON sales_corrections(sale_id);

-- ---------------------------------------------------------------------------
-- 【1】異常偵測（單品 3 倍 / 日營收 3 倍 / 金額不符）
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION detect_sale_anomalies(p_sale_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  s venue_sales_daily%ROWTYPE;
  v_7day_avg NUMERIC;
  v_payment_sum NUMERIC;
BEGIN
  SELECT * INTO s FROM venue_sales_daily WHERE id = p_sale_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- 1. 收款總和 vs 銷售總額
  v_payment_sum := s.cash_amount + s.transfer_amount + s.monthly_amount + s.unpaid_amount;
  IF ABS(v_payment_sum - s.total_amount) > 1 THEN
    INSERT INTO exception_events (category, severity, title, message, ref_type, ref_id, venue_id, ambassador_id)
    VALUES ('shipment_qty_mismatch','critical',
            '銷售收款總和不等於銷售金額',
            format('total=%s, sum_payments=%s', s.total_amount, v_payment_sum),
            'venue_sales_daily', p_sale_id, s.venue_id, s.ambassador_id);
  END IF;

  -- 2. 單日酒店營收 vs 近 7 日平均（超過 3 倍）
  SELECT AVG(total_amount) INTO v_7day_avg
  FROM venue_sales_daily
  WHERE venue_id = s.venue_id
    AND sale_date BETWEEN s.sale_date - interval '7 days' AND s.sale_date - interval '1 day'
    AND status IN ('submitted','locked','adjusted');

  IF v_7day_avg > 0 AND s.total_amount > v_7day_avg * 3 THEN
    INSERT INTO exception_events (category, severity, title, message, ref_type, ref_id, venue_id)
    VALUES ('venue_inventory','warning',
            '酒店單日營收超過近 7 日平均 3 倍',
            format('today=%s, 7d_avg=%s', s.total_amount, round(v_7day_avg,0)),
            'venue_sales_daily', p_sale_id, s.venue_id);
  END IF;

  -- 3. 單品數量超平均 3 倍（注：需至少 5 筆歷史樣本才跑，避免新品誤判）
  -- Phase 2 再做（需聚合計算，放 view 較合適）
END $$;

-- ---------------------------------------------------------------------------
-- 【2】補貨狀態機
-- ---------------------------------------------------------------------------
ALTER TABLE replenishment_runs DROP CONSTRAINT IF EXISTS replenishment_runs_status_check;
ALTER TABLE replenishment_runs
  ALTER COLUMN status SET DEFAULT 'generated',
  ADD CONSTRAINT replenishment_runs_status_check CHECK (
    status IN ('generated','reviewed','picking','shipped','partially_received','received','discrepancy','closed','cancelled')
  ),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS picked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS picked_by UUID REFERENCES employees(id);

-- replenishment_items 補 actual/received + 原因
ALTER TABLE replenishment_items
  ADD COLUMN IF NOT EXISTS received_qty INT,
  ADD COLUMN IF NOT EXISTS shipped_reason TEXT,          -- 實出 ≠ 建議時必填
  ADD COLUMN IF NOT EXISTS discrepancy_note TEXT;

-- 禁止從 draft/cancelled 直接跳 shipped（要經 reviewed / picking）
CREATE OR REPLACE FUNCTION trg_replenishment_transition()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  allowed_from TEXT[];
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status <> NEW.status THEN
    allowed_from := CASE NEW.status
      WHEN 'reviewed'            THEN ARRAY['generated']
      WHEN 'picking'             THEN ARRAY['reviewed']
      WHEN 'shipped'             THEN ARRAY['picking']
      WHEN 'partially_received'  THEN ARRAY['shipped']
      WHEN 'received'            THEN ARRAY['shipped','partially_received']
      WHEN 'discrepancy'         THEN ARRAY['shipped','partially_received']
      WHEN 'closed'              THEN ARRAY['received','discrepancy']
      WHEN 'cancelled'           THEN ARRAY['generated','reviewed']
      ELSE NULL
    END;
    IF allowed_from IS NOT NULL AND NOT (OLD.status = ANY(allowed_from)) THEN
      RAISE EXCEPTION 'Invalid replenishment transition: % -> %', OLD.status, NEW.status;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_replenishment_transition ON replenishment_runs;
CREATE TRIGGER trg_replenishment_transition
  BEFORE UPDATE ON replenishment_runs
  FOR EACH ROW EXECUTE FUNCTION trg_replenishment_transition();

-- ---------------------------------------------------------------------------
-- 【3】庫存 · ledger 是唯一真實
-- ---------------------------------------------------------------------------
-- venue_inventory_ledger 強化欄位
ALTER TABLE venue_inventory_ledger
  ADD COLUMN IF NOT EXISTS reason TEXT,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES employees(id);

-- 擴充 change_type enum
ALTER TABLE venue_inventory_ledger DROP CONSTRAINT IF EXISTS venue_inventory_ledger_change_type_check;
ALTER TABLE venue_inventory_ledger ADD CONSTRAINT venue_inventory_ledger_change_type_check CHECK (
  change_type IN ('sale','replenishment','shipment','receipt','adjustment','damage','missing','correction')
);

-- Trigger：ledger 新增後自動更新 venue_inventory 快照
CREATE OR REPLACE FUNCTION trg_apply_ledger_to_inventory()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO venue_inventory (venue_id, product_id, on_hand, last_updated)
  VALUES (NEW.venue_id, NEW.product_id, NEW.change_qty, now())
  ON CONFLICT (venue_id, product_id) DO UPDATE
    SET on_hand = venue_inventory.on_hand + EXCLUDED.on_hand,
        last_updated = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_ledger_apply ON venue_inventory_ledger;
CREATE TRIGGER trg_ledger_apply
  AFTER INSERT ON venue_inventory_ledger
  FOR EACH ROW EXECUTE FUNCTION trg_apply_ledger_to_inventory();

-- 禁止直接 UPDATE venue_inventory.on_hand（除了 trigger 內部）
CREATE OR REPLACE FUNCTION trg_block_direct_inventory_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- 允許 last_updated 更新但要與 ledger 寫入同 tx；這裡只擋「無配對 ledger」的直改
  -- 實務建議：以 SECURITY DEFINER RPC 包裝所有庫存異動
  IF NEW.on_hand <> OLD.on_hand
     AND NOT EXISTS (
       SELECT 1 FROM venue_inventory_ledger
       WHERE venue_id = NEW.venue_id AND product_id = NEW.product_id
       AND created_at > now() - interval '5 seconds'
     ) THEN
    RAISE EXCEPTION 'Direct on_hand modification forbidden. Insert into venue_inventory_ledger instead.';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_inventory_direct_guard ON venue_inventory;
CREATE TRIGGER trg_inventory_direct_guard
  BEFORE UPDATE ON venue_inventory
  FOR EACH ROW EXECUTE FUNCTION trg_block_direct_inventory_update();

-- 異常調整（damage / missing）自動寫 exception_events
CREATE OR REPLACE FUNCTION trg_ledger_anomaly_event()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.change_type IN ('damage','missing') OR
     (NEW.change_type = 'adjustment' AND ABS(NEW.change_qty) > 10) THEN
    INSERT INTO exception_events (category, severity, title, message, ref_type, ref_id, venue_id)
    VALUES ('venue_inventory',
            CASE WHEN NEW.change_type = 'missing' THEN 'critical' ELSE 'warning' END,
            format('庫存異常：%s %s (%s)', NEW.change_type, NEW.change_qty, COALESCE(NEW.reason,'無原因')),
            NEW.reason, 'venue_inventory_ledger', NEW.id, NEW.venue_id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_ledger_anomaly ON venue_inventory_ledger;
CREATE TRIGGER trg_ledger_anomaly
  AFTER INSERT ON venue_inventory_ledger
  FOR EACH ROW EXECUTE FUNCTION trg_ledger_anomaly_event();

-- ---------------------------------------------------------------------------
-- 【4】大使登入安全強化
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE ambassadors
  ADD COLUMN IF NOT EXISTS failed_login_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_failed_login_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pin_set_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_login_ip TEXT;

-- pin_hash 欄位既有（前份 migration 已建），改用 crypt()
-- 遷移策略（你手動跑）：
--   UPDATE ambassadors SET pin_hash = crypt(pin_hash, gen_salt('bf'))
--   WHERE pin_hash IS NOT NULL AND pin_hash !~ '^\$2[aby]\$';

-- ---------------------------------------------------------------------------
-- 【5】權限 · RLS policy 草稿（全部 commented，等 Supabase Auth 上線再打開）
-- ---------------------------------------------------------------------------
-- ALTER TABLE ambassadors ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY amb_self ON ambassadors USING (id = auth.uid()::uuid);

-- ALTER TABLE ambassador_supply_requests ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY asr_self ON ambassador_supply_requests FOR SELECT
--   USING (ambassador_id = auth.uid()::uuid OR auth_is_hq_or_boss());

-- ALTER TABLE ambassador_receipts ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY ar_self ON ambassador_receipts FOR SELECT
--   USING (ambassador_id = auth.uid()::uuid OR auth_is_hq_or_boss());

-- ALTER TABLE collection_records ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY col_supervisor ON collection_records FOR SELECT
--   USING (
--     auth_is_boss() OR
--     EXISTS (
--       SELECT 1 FROM venue_sales_daily vsd
--       JOIN supervisor_venue_scope svs ON svs.venue_id = vsd.venue_id
--       WHERE vsd.id = sale_id AND svs.supervisor_id = auth.uid()::uuid
--     )
--   );

-- ALTER TABLE venue_sales_daily ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY vsd_hq ON venue_sales_daily USING (auth_is_hq_or_boss());

-- 輔助函式（未來可用，本輪不啟用）：
-- CREATE OR REPLACE FUNCTION auth_is_boss() RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
--   SELECT EXISTS (SELECT 1 FROM employees WHERE id::text = auth.uid()::text AND is_admin = true)
-- $$;
-- CREATE OR REPLACE FUNCTION auth_is_hq_or_boss() RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
--   SELECT EXISTS (SELECT 1 FROM employees WHERE id::text = auth.uid()::text AND (is_admin = true OR role_ext IS NULL))
-- $$;

-- ---------------------------------------------------------------------------
-- 【6】收帳 · 狀態機擴充 + verified 分層
-- ---------------------------------------------------------------------------
ALTER TABLE collection_records DROP CONSTRAINT IF EXISTS collection_records_status_check;
ALTER TABLE collection_records
  ALTER COLUMN status SET DEFAULT 'pending',
  ADD CONSTRAINT collection_records_status_check CHECK (
    status IN ('pending','partially_collected','collected','verified','discrepancy','overdue','cancelled')
  ),
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS expected_cash NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expected_transfer NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expected_monthly NUMERIC(12,2) DEFAULT 0;

ALTER TABLE collection_payments DROP CONSTRAINT IF EXISTS collection_payments_method_check;
ALTER TABLE collection_payments
  ADD CONSTRAINT collection_payments_method_check CHECK (
    method IN ('cash','bank_transfer','monthly_settlement','partial_payment')
  ),
  ADD COLUMN IF NOT EXISTS collected_by UUID REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS collected_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS reference_no TEXT,
  ADD COLUMN IF NOT EXISTS is_cleared BOOLEAN NOT NULL DEFAULT false;

-- 現金 / 匯款分開聚合（check：單筆付款方法 ≠ mixed，不可合算）
-- 由 RPC supervisor_submit_collection 端做強制分流，這裡只做欄位定義。

-- ---------------------------------------------------------------------------
-- 【7】耗材 · 分類 + 工具追蹤
-- ---------------------------------------------------------------------------
ALTER TABLE supply_items
  ADD COLUMN IF NOT EXISTS usage_type TEXT NOT NULL DEFAULT 'consumable'
    CHECK (usage_type IN ('consumable','tool','hazardous','custom')),
  ADD COLUMN IF NOT EXISTS is_returnable_tool BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_manager_approval BOOLEAN NOT NULL DEFAULT false;

-- 初始分類更新
UPDATE supply_items SET usage_type = 'consumable', is_returnable_tool = false
  WHERE code IN ('cedar','humidity_pack','zip_bag');
UPDATE supply_items SET usage_type = 'hazardous', is_returnable_tool = false,
       requires_manager_approval = true
  WHERE code = 'gas';
UPDATE supply_items SET usage_type = 'tool', is_returnable_tool = true,
       requires_manager_approval = true
  WHERE code IN ('flat_cutter','v_cutter','drill','pin');
UPDATE supply_items SET usage_type = 'custom', requires_manager_approval = true
  WHERE code = 'other';

-- 工具指派表（工具類需追蹤在誰手上）
CREATE TABLE IF NOT EXISTS supply_tool_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supply_item_id UUID NOT NULL REFERENCES supply_items(id),
  serial_no TEXT,                       -- 若有序號
  assigned_to_ambassador UUID REFERENCES ambassadors(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  returned_at TIMESTAMPTZ,
  damaged_at TIMESTAMPTZ,
  damage_note TEXT,
  retired_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'in_use'
    CHECK (status IN ('in_use','returned','damaged','retired','lost')),
  note TEXT
);
CREATE INDEX IF NOT EXISTS idx_tool_assign_amb ON supply_tool_assignments(assigned_to_ambassador) WHERE status = 'in_use';

-- 耗材濫用偵測：同大使 14 天內重複申請工具類 → exception_events
CREATE OR REPLACE FUNCTION trg_supply_abuse_detect()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_recent_count INT;
  v_is_tool BOOLEAN;
BEGIN
  IF TG_OP <> 'INSERT' THEN RETURN NEW; END IF;

  SELECT usage_type IN ('tool','hazardous') INTO v_is_tool
  FROM supply_items WHERE id = NEW.supply_item_id;

  IF v_is_tool THEN
    SELECT COUNT(*) INTO v_recent_count
    FROM ambassador_supply_request_items asri
    JOIN ambassador_supply_requests asr ON asr.id = asri.request_id
    WHERE asr.ambassador_id = (SELECT ambassador_id FROM ambassador_supply_requests WHERE id = NEW.request_id)
      AND asri.supply_item_id = NEW.supply_item_id
      AND asr.created_at > now() - interval '14 days'
      AND asr.status NOT IN ('rejected','cancelled');

    IF v_recent_count >= 2 THEN
      INSERT INTO exception_events (category, severity, title, message, ref_type, ref_id, ambassador_id)
      VALUES (
        'high_risk_supply','warning',
        '大使短期重複申請工具／高風險耗材',
        format('14 天內第 %s 次申請同品項', v_recent_count),
        'ambassador_supply_request_items', NEW.id,
        (SELECT ambassador_id FROM ambassador_supply_requests WHERE id = NEW.request_id)
      );
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_supply_abuse_detect ON ambassador_supply_request_items;
CREATE TRIGGER trg_supply_abuse_detect
  AFTER INSERT ON ambassador_supply_request_items
  FOR EACH ROW EXECUTE FUNCTION trg_supply_abuse_detect();

-- ---------------------------------------------------------------------------
-- 【8】戰情室統計規則 · 改寫 view 過濾狀態
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS boss_war_room_daily_view CASCADE;
CREATE VIEW boss_war_room_daily_view AS
SELECT
  (s.sale_date AT TIME ZONE 'Asia/Taipei')::date AS sale_date,
  SUM(s.total_amount) AS total_amount,
  SUM(s.cash_amount) AS cash,
  SUM(s.transfer_amount) AS transfer,
  SUM(s.monthly_amount) AS monthly_pending,
  SUM(s.unpaid_amount) AS unpaid,
  COUNT(*) AS sale_count
FROM venue_sales_daily s
WHERE s.status IN ('submitted','locked','adjusted')
GROUP BY (s.sale_date AT TIME ZONE 'Asia/Taipei')::date;

DROP VIEW IF EXISTS venue_sales_ranking_view CASCADE;
CREATE VIEW venue_sales_ranking_view AS
SELECT v.id AS venue_id, v.name AS venue_name, s.sale_date,
       SUM(s.total_amount) AS amount,
       SUM(COALESCE(vi.quantity,0)) AS qty
FROM venue_sales_daily s
JOIN venues v ON v.id = s.venue_id
LEFT JOIN venue_sales_items vi ON vi.sale_id = s.id
WHERE s.status IN ('submitted','locked','adjusted')
GROUP BY v.id, v.name, s.sale_date;

DROP VIEW IF EXISTS ambassador_ranking_view CASCADE;
CREATE VIEW ambassador_ranking_view AS
SELECT a.id AS ambassador_id, a.name, s.sale_date,
       SUM(s.total_amount) AS amount,
       SUM(COALESCE(vi.quantity,0)) AS qty
FROM venue_sales_daily s
JOIN ambassadors a ON a.id = s.ambassador_id
LEFT JOIN venue_sales_items vi ON vi.sale_id = s.id
WHERE s.status IN ('submitted','locked','adjusted')
GROUP BY a.id, a.name, s.sale_date;

DROP VIEW IF EXISTS product_sales_ranking_view CASCADE;
CREATE VIEW product_sales_ranking_view AS
SELECT im.id AS product_id, im.name AS product_name, s.sale_date,
       SUM(vi.quantity) AS qty,
       SUM(vi.subtotal) AS amount
FROM venue_sales_items vi
JOIN venue_sales_daily s ON s.id = vi.sale_id
JOIN inventory_master im ON im.id = vi.product_id
WHERE s.status IN ('submitted','locked','adjusted')
GROUP BY im.id, im.name, s.sale_date;

-- 補貨完成率：只計 received / closed
CREATE OR REPLACE VIEW replenishment_completion_view AS
SELECT run_date,
  COUNT(*) FILTER (WHERE status IN ('received','closed')) AS completed,
  COUNT(*) FILTER (WHERE status NOT IN ('cancelled')) AS total
FROM replenishment_runs
GROUP BY run_date;

-- 收帳完成率：只計 verified
CREATE OR REPLACE VIEW collection_completion_view AS
SELECT (created_at AT TIME ZONE 'Asia/Taipei')::date AS col_date,
  COUNT(*) FILTER (WHERE status = 'verified') AS verified,
  COUNT(*) FILTER (WHERE status NOT IN ('cancelled')) AS total
FROM collection_records
GROUP BY (created_at AT TIME ZONE 'Asia/Taipei')::date;

-- 異常未結案：status = 'open' 或 'investigating' 持續顯示
CREATE OR REPLACE VIEW open_exceptions_view AS
SELECT * FROM exception_events
WHERE status IN ('open','investigating')
ORDER BY severity DESC, created_at DESC;

-- ---------------------------------------------------------------------------
-- 【9】單據防偽與追蹤 · document_no / batch_no / version
-- ---------------------------------------------------------------------------
-- 通用 document_no 產生器（格式：PREFIX-YYMMDD-####）
CREATE SEQUENCE IF NOT EXISTS doc_seq_replenishment;
CREATE SEQUENCE IF NOT EXISTS doc_seq_warehouse;
CREATE SEQUENCE IF NOT EXISTS doc_seq_supply_ship;
CREATE SEQUENCE IF NOT EXISTS doc_seq_collection;
CREATE SEQUENCE IF NOT EXISTS doc_seq_correction;

CREATE OR REPLACE FUNCTION gen_doc_no(p_prefix TEXT, p_seq TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE v_num BIGINT; BEGIN
  EXECUTE format('SELECT nextval(''%I'')', p_seq) INTO v_num;
  RETURN p_prefix || '-' || to_char(now() AT TIME ZONE 'Asia/Taipei','YYMMDD') || '-' || lpad(v_num::text, 4, '0');
END $$;

-- 給既有 / 未來表加 document_no / version 欄位
ALTER TABLE replenishment_runs
  ADD COLUMN IF NOT EXISTS document_no TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;

ALTER TABLE warehouse_shipments
  ADD COLUMN IF NOT EXISTS document_no TEXT,       -- = shipment_no 也可；保留通用欄位
  ADD COLUMN IF NOT EXISTS batch_no TEXT,          -- 跨單合併批次
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;

ALTER TABLE supply_shipments
  ADD COLUMN IF NOT EXISTS document_no TEXT,
  ADD COLUMN IF NOT EXISTS batch_no TEXT,
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;

ALTER TABLE collection_records
  ADD COLUMN IF NOT EXISTS document_no TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;

ALTER TABLE sales_corrections
  ADD COLUMN IF NOT EXISTS document_no TEXT UNIQUE;

-- 觸發器：insert 時自動填 document_no
CREATE OR REPLACE FUNCTION trg_fill_document_no()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.document_no IS NULL THEN
    NEW.document_no := CASE TG_TABLE_NAME
      WHEN 'replenishment_runs' THEN gen_doc_no('RP','doc_seq_replenishment')
      WHEN 'warehouse_shipments' THEN gen_doc_no('WS','doc_seq_warehouse')
      WHEN 'supply_shipments'    THEN gen_doc_no('SS','doc_seq_supply_ship')
      WHEN 'collection_records'  THEN gen_doc_no('CL','doc_seq_collection')
      WHEN 'sales_corrections'   THEN gen_doc_no('SC','doc_seq_correction')
    END;
  END IF;
  RETURN NEW;
END $$;

DO $$ DECLARE t TEXT; BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'replenishment_runs','warehouse_shipments','supply_shipments',
    'collection_records','sales_corrections'
  ])
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_docno ON %s;', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_docno BEFORE INSERT ON %s FOR EACH ROW EXECUTE FUNCTION trg_fill_document_no();', t, t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 【10】Idempotency · 重複送出防護
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS idempotency_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL,                 -- e.g. 'hq_submit_venue_sales'
  key TEXT NOT NULL,                   -- 前端產生的 uuid
  actor_id UUID,                       -- 執行者 employee/ambassador id
  result JSONB,                        -- 成功後保存，下次同 key 直接回傳
  status TEXT NOT NULL DEFAULT 'in_flight' CHECK (status IN ('in_flight','completed','failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
  UNIQUE (scope, key)
);
CREATE INDEX IF NOT EXISTS idx_idem_expires ON idempotency_keys(expires_at);

-- 用法（由 RPC 內部呼叫）：
-- SELECT result FROM idempotency_keys WHERE scope=? AND key=? AND status='completed';

-- 清除過期 key（週期性 cron，可放 Phase 2）
-- DELETE FROM idempotency_keys WHERE expires_at < now();

-- ---------------------------------------------------------------------------
-- 【*】audit_logs 寫入規則（sales/collection/ledger/supply 全部都要寫）
-- ---------------------------------------------------------------------------
-- audit_logs 沿用既有表，不新建；RPC 層統一呼叫 INSERT。
-- 觸發表清單（建議）：
--   venue_sales_daily status change
--   sales_corrections insert
--   replenishment_runs status change
--   warehouse_shipments status change
--   collection_records status change → verified
--   ambassador_supply_requests review
--   venue_inventory_ledger insert (adjustment/damage/missing/correction)

-- 通用 audit trigger（只記關鍵表的 UPDATE）
CREATE OR REPLACE FUNCTION trg_audit_status_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO audit_logs (
      entity_type, entity_id, action,
      before_state, after_state, created_at
    ) VALUES (
      TG_TABLE_NAME, NEW.id,
      'status_change: ' || COALESCE(OLD.status,'null') || ' -> ' || COALESCE(NEW.status,'null'),
      to_jsonb(OLD), to_jsonb(NEW), now()
    );
  END IF;
  RETURN NEW;
END $$;

-- 注意：audit_logs 的 schema 需符合既有欄位；若現有欄位名不同，請先核對再啟用：
-- SELECT column_name FROM information_schema.columns WHERE table_name='audit_logs';
-- （已由 proposal 驗證後再 uncomment 以下）
-- CREATE TRIGGER trg_audit_venue_sales AFTER UPDATE ON venue_sales_daily
--   FOR EACH ROW EXECUTE FUNCTION trg_audit_status_change();
-- CREATE TRIGGER trg_audit_replenishment AFTER UPDATE ON replenishment_runs
--   FOR EACH ROW EXECUTE FUNCTION trg_audit_status_change();
-- CREATE TRIGGER trg_audit_collection AFTER UPDATE ON collection_records
--   FOR EACH ROW EXECUTE FUNCTION trg_audit_status_change();
-- CREATE TRIGGER trg_audit_supply_request AFTER UPDATE ON ambassador_supply_requests
--   FOR EACH ROW EXECUTE FUNCTION trg_audit_status_change();

COMMIT;

-- ============================================================================
-- Rollback guide (manual)
-- ============================================================================
-- 所有 ALTER/ADD COLUMN 都是 nullable 追加，rollback 複雜；
-- 最簡單：DROP TABLE sales_corrections, supply_tool_assignments, idempotency_keys;
-- 其餘 ADD COLUMN 不 drop（保留就好）。
-- 新 trigger 若要撤除：手動 DROP TRIGGER 名稱見上。
