-- 補單入庫：貨先到、後補採購單。一次建單 + 收貨 + 入庫，不經「已叫貨」，
-- 所以不會觸發 _po_notify_boss_to_pay（貨都到了，不該再 LINE 通知老闆匯款）。
-- 同時加 inventory_master.needs_label：標示入庫時要不要貼標籤。

alter table public.inventory_master
  add column if not exists needs_label boolean not null default false;

-- 預設規則：雪茄（古巴 / 非古）、整瓶酒類、零售配件（category = 其他）要貼；其餘不用。
-- 即飲飲品、糖漿茶包、營運耗材、火鍋食材、餐飲、杯裝 POS 品項皆不貼。
update public.inventory_master
   set needs_label = true
 where category in ('古巴雪茄', '非古雪茄', '其他')
    or (category = '酒類' and unit = '瓶');

create or replace function public.po_quick_receive(
  p_supplier_id uuid,
  p_items jsonb,
  p_note text default null,
  p_paid boolean default false,
  p_client_id text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_who text; v_actor text; s inventory_suppliers%rowtype; v_po purchase_orders%rowtype; m inventory_master%rowtype;
  e jsonb; q numeric; pr numeric; v_unit text; v_no text; v_total numeric := 0; v_n int := 0;
  v_labels jsonb := '[]'::jsonb; v_dup text;
begin
  v_who := _require_staff_inv('po_quick_receive'); v_actor := _po_actor(v_who);

  -- 防連點：同一個 client id 只入庫一次
  if nullif(p_client_id, '') is not null then
    select reference_no into v_dup from stock_transactions where client_tx_id like p_client_id || ':%' limit 1;
    if found then
      return jsonb_build_object('ok', true, 'duplicate', true, 'po_no', v_dup);
    end if;
  end if;

  select * into s from inventory_suppliers where id = p_supplier_id;
  if not found then raise exception '找不到廠商'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception '請至少加一個品項'; end if;

  -- 先全部驗證，避免寫一半
  for e in select * from jsonb_array_elements(p_items) loop
    q := coalesce(nullif(e->>'qty', '')::numeric, 0);
    if q <= 0 then raise exception '數量要大於 0'; end if;
    if q > 100000 then raise exception '收貨數量不對'; end if;
    if not exists (select 1 from inventory_master where id = e->>'item_id' and enabled) then
      raise exception '請從庫存品項挑選（找不到：%）', coalesce(e->>'item_id', '未選品項');
    end if;
  end loop;

  perform pg_advisory_xact_lock(hashtext('po_no'));
  v_no := 'PO' || to_char(now() at time zone 'Asia/Taipei', 'YYMMDD') || '-' ||
          lpad(((select count(*) from purchase_orders where po_no like 'PO' || to_char(now() at time zone 'Asia/Taipei', 'YYMMDD') || '-%') + 1)::text, 2, '0');

  insert into purchase_orders (po_no, supplier_id, supplier_name, region, channel, status, created_by,
                               ordered_by, ordered_at, received_by, received_at, note, pay_status, paid_at)
  values (v_no, s.id, s.name, s.region,
          case when s.kind in ('platform', 'online') or s.region = 'CN' then 'online' when s.kind = 'store' then 'store' else 'line' end,
          'received', v_actor, v_actor, now(), v_actor, now(),
          '補單入庫' || coalesce('：' || nullif(trim(p_note), ''), ''),
          case when p_paid then 'paid' else 'unpaid' end,
          case when p_paid then now() end)
  returning * into v_po;

  for e in select * from jsonb_array_elements(p_items) loop
    q := (e->>'qty')::numeric;
    pr := nullif(e->>'unit_price', '')::numeric;
    select * into m from inventory_master where id = e->>'item_id';
    v_unit := coalesce(nullif(e->>'unit', ''), m.unit);
    v_n := v_n + 1;

    insert into purchase_order_items (po_id, item_id, name, unit, qty_order, unit_price, qty_received, buy_url, note, sort_order)
    values (v_po.id, m.id, m.name, v_unit, q, pr, q, nullif(m.purchase_url, ''), nullif(trim(coalesce(e->>'note', '')), ''), v_n);
    v_total := v_total + q * coalesce(pr, 0);

    -- 庫存由 trg_stock_tx_sync_master 依 direction='in' 自動加總
    insert into stock_transactions (inv_master_id, channel, direction, quantity, unit, reference_no, notes, handled_by, store_id, client_tx_id)
    values (m.id, 'supplier_in', 'in', q, v_unit, v_po.po_no, '補單入庫 ' || v_po.po_no || '（' || s.name || '）', v_actor,
            coalesce(m.store_id, 'DA_AN'), case when nullif(p_client_id, '') is not null then p_client_id || ':' || v_n end);

    update inventory_master
       set is_low = (coalesce(safe_stock, 0) > 0 and coalesce(current_stock, 0) < safe_stock), last_update = now()
     where id = m.id;

    v_labels := v_labels || jsonb_build_object('item_id', m.id, 'name', m.name, 'qty', q, 'needs_label', m.needs_label);
  end loop;

  update purchase_orders set total_amount = v_total, updated_at = now() where id = v_po.id;
  perform log_audit('po_quick_receive', v_po.po_no || ' 補單入庫 ' || v_n || ' 項（' || s.name || '）', v_actor);

  return jsonb_build_object('ok', true, 'duplicate', false, 'po_id', v_po.id, 'po_no', v_po.po_no,
                            'received_items', v_n, 'total_amount', v_total, 'labels', v_labels);
end $function$;
