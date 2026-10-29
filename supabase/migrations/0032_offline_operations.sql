-- بند 80 — البيع بالتقسيط والتحصيل من غير نت (المرحلة 2 في TASK-0003).
-- إضافة بس: مفيش أي عمود أو جدول موجود بيتغيّر أو يتمسح، ودالة التحصيل بتاعة 0029 زي ما هي.
--
-- الفكرة: الجهاز اللي النت فاصل عنده بيحفظ العملية في طابور على الجهاز، ولما النت يرجع بيبعتها
-- لواحدة من الدالتين دول. الاتنين:
--   • محميين من التكرار: نفس العملية لو وصلت مرتين بتتسجّل مرة واحدة.
--   • بيسجّلوا العملية بوقتها الحقيقي (الساعة اللي اتعملت فيها على الجهاز)، بشرط ميكونش أقدم من
--     3 أيام، ولو ساعة الجهاز قدّام بيتاخد وقت السيرفر (مفيش عملية في المستقبل).
--   • بيسجّلوا وقت الوصول الفعلي في عمود `synced_at`.
--
-- لو الملف ده متطبّقش: التحصيل من غير نت بيتبعت لدالة 0029 مباشرة، وعقود التقسيط اللي اتعملت من
-- غير نت بتفضل مستنية على الجهاز لحد ما الملف يتطبّق (مبتضيعش ومبتترفضش). البيع بالنت شغال زي
-- دلوقتي بالظبط. ملف الرجوع: supabase/rollback/0032_offline_operations.UNDO.sql

-- وقت الوصول الفعلي. الصفوف القديمة بتفضل فاضية (ماعرفناش وقت وصولها)، والجديدة بتاخد وقت الإضافة.
do $$
declare
  t text;
begin
  foreach t in array array['installment_contracts', 'installment_payments'] loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = 'synced_at'
    ) then
      execute format('alter table public.%I add column synced_at timestamptz', t);
      execute format('alter table public.%I alter column synced_at set default now()', t);
    end if;
  end loop;
end $$;

-- وقت العملية من الجهاز: مش أقدم من 3 أيام، ومش في المستقبل.
create or replace function offline_operation_time(p_at timestamptz)
returns timestamptz
language plpgsql
stable
set search_path = public
as $$
begin
  if p_at is null then
    return now();
  end if;
  if p_at < now() - interval '72 hours' then
    raise exception 'العملية دي اتعملت من غير نت من أكتر من 3 أيام — اعملها تاني دلوقتي';
  end if;
  return least(p_at, now());
end;
$$;

-- التحصيل من الطابور: نفس دالة 0029 بالظبط (نفس التوزيع على الأقدم والقفل والحماية من التكرار)،
-- بس بوقت العملية الحقيقي.
create or replace function collect_installment_payment_offline(
  p_contract_id uuid,
  p_amount numeric,
  p_offline_at timestamptz,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_idempotency_key is null then
    raise exception 'مفتاح العملية مطلوب';
  end if;
  -- لو نفس العملية وصلت قبل كده، نرجّعها زي ما هي حتى لو بقت أقدم من 3 أيام.
  if exists (
    select 1 from installment_payments
    where tenant_id = current_tenant_id() and idempotency_key = p_idempotency_key
  ) then
    return collect_installment_payment(p_contract_id, p_amount, null, p_idempotency_key);
  end if;
  return collect_installment_payment(
    p_contract_id, p_amount, offline_operation_time(p_offline_at), p_idempotency_key
  );
end;
$$;

-- عقد التقسيط كله في عملية واحدة: يا كله يتسجّل يا ولا حاجة.
-- الأرقام (الأصناف، المقدّم، الفايدة، جدول الأقساط) بتتحسب على الجهاز بنفس معادلة البرنامج
-- بالظبط، والدالة بتتأكد إنها متسقة مع بعضها، وبتتأكد من السيريالات والمخزون على السيرفر
-- (لو السيريال اتباع من جهاز تاني، العقد بيترفض والبيّاع بيشوف السبب).
create or replace function create_installment_contract_offline(
  p_contract jsonb,
  p_new_customer jsonb default null,
  p_new_plan jsonb default null,
  p_offline_at timestamptz default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tenant uuid := current_tenant_id();
  v_id uuid := (p_contract->>'id')::uuid;
  v_existing installment_contracts%rowtype;
  v_contract installment_contracts%rowtype;
  v_customer customers%rowtype;
  v_plan installment_plans%rowtype;
  v_product products%rowtype;
  v_created_at timestamptz;
  v_year int := extract(year from now())::int;
  v_number text;
  v_user uuid := (select id from users where auth_user_id = auth.uid() limit 1);
  v_item jsonb;
  v_line jsonb;
  v_serial product_serials%rowtype;
  v_serial_ids uuid[] := '{}';
  v_stock int;
  v_qty int;
  v_items_total numeric := 0;
  v_schedule_total numeric := 0;
  v_schedule_count int := 0;
  v_cash_subtotal numeric := (p_contract->>'cash_subtotal')::numeric;
  v_down numeric := (p_contract->>'down_payment')::numeric;
  v_principal numeric := (p_contract->>'principal')::numeric;
  v_finance numeric := (p_contract->>'finance_amount')::numeric;
  v_total numeric := (p_contract->>'total_amount')::numeric;
  v_new_customer customers%rowtype;
  v_stock_by_product jsonb := '{}'::jsonb;
  v_movements jsonb := '[]'::jsonb;
begin
  if v_tenant is null then
    raise exception 'لا توجد جلسة نشطة';
  end if;
  if v_id is null then
    raise exception 'رقم العقد المؤقت مطلوب';
  end if;

  -- نفس العقد وصل قبل كده (النت قطع بعد ما اتسجّل): نرجّعه من غير أي تسجيل جديد.
  select * into v_existing from installment_contracts where id = v_id;
  if found then
    if v_existing.tenant_id <> v_tenant then
      raise exception 'العقد غير موجود';
    end if;
    return jsonb_build_object('contract', to_jsonb(v_existing), 'replayed', true);
  end if;

  v_created_at := coalesce(
    (p_contract->>'created_at')::timestamptz,  -- تاريخ مفتوح اختاره البيّاع بإيده (زي دلوقتي)
    offline_operation_time(p_offline_at)
  );

  -- عميل جديد اتعمل جوه الفاتورة من غير نت.
  if p_new_customer is not null then
    select * into v_new_customer from customers where id = (p_new_customer->>'id')::uuid;
    if not found then
      insert into customers (id, tenant_id, code, name, phone, address, notes, ledger_book, status)
      values (
        (p_new_customer->>'id')::uuid,
        v_tenant,
        'CUST-' || lpad(next_tenant_code_counter(v_tenant, 'customers')::text, 4, '0'),
        p_new_customer->>'name',
        nullif(p_new_customer->>'phone', ''),
        nullif(p_new_customer->>'address', ''),
        nullif(p_new_customer->>'notes', ''),
        nullif(p_new_customer->>'ledger_book', ''),
        'active'
      )
      returning * into v_new_customer;
    end if;
  end if;

  -- خطة مخصصة للصفقة دي بس (مش بتظهر في قايمة الخطط).
  if p_new_plan is not null then
    select * into v_plan from installment_plans where id = (p_new_plan->>'id')::uuid;
    if not found then
      insert into installment_plans (id, tenant_id, duration_months, rate_pct, active)
      values (
        (p_new_plan->>'id')::uuid,
        v_tenant,
        (p_new_plan->>'duration_months')::int,
        (p_new_plan->>'rate_pct')::numeric,
        false
      )
      returning * into v_plan;
    end if;
  end if;

  select * into v_customer from customers
  where id = (p_contract->>'customer_id')::uuid and tenant_id = v_tenant;
  if not found then
    raise exception 'العميل غير موجود';
  end if;
  if v_customer.status <> 'active' then
    raise exception 'العميل غير نشط';
  end if;

  select * into v_plan from installment_plans
  where id = (p_contract->>'plan_id')::uuid and tenant_id = v_tenant;
  if not found then
    raise exception 'خطة التقسيط غير موجودة';
  end if;
  if not v_plan.active and (p_new_plan is null or v_plan.id <> (p_new_plan->>'id')::uuid) then
    raise exception 'خطة التقسيط غير مفعّلة';
  end if;
  if v_plan.duration_months <> (p_contract->>'plan_duration_months')::int
     or v_plan.rate_pct <> (p_contract->>'plan_rate_pct')::numeric then
    raise exception 'خطة التقسيط اتغيّرت — اعمل العقد تاني';
  end if;

  -- اتساق الأرقام: نفس المعادلة اللي على الجهاز، ولو فيه فرق قرش العقد بيترفض.
  if jsonb_array_length(coalesce(p_contract->'items', '[]'::jsonb)) = 0 then
    raise exception 'لازم تضيف صنف واحد على الأقل';
  end if;
  for v_item in select * from jsonb_array_elements(p_contract->'items') loop
    v_items_total := v_items_total + (v_item->>'line_total')::numeric;
  end loop;
  for v_line in select * from jsonb_array_elements(coalesce(p_contract->'schedule', '[]'::jsonb)) loop
    v_schedule_total := v_schedule_total + (v_line->>'amount')::numeric;
    v_schedule_count := v_schedule_count + 1;
  end loop;
  if round(v_items_total, 2) <> round(v_cash_subtotal, 2)
     or v_down < 0 or v_down >= v_cash_subtotal
     or round(v_cash_subtotal - v_down, 2) <> round(v_principal, 2)
     or round(v_principal + v_finance, 2) <> round(v_total, 2)
     or round(v_schedule_total, 2) <> round(v_total, 2)
     or v_schedule_count <> v_plan.duration_months then
    raise exception 'أرقام العقد مش متسقة — اعمل العقد تاني';
  end if;

  -- الأصناف: السيريالات بتتقفل وتتأكد إنها لسه متاحة، والمخزون بيتحسب على السيرفر دلوقتي —
  -- نفس طريقة البرنامج سطر بسطر (لو نفس الجهاز متكرر في العقد، "قبل" السطر التاني = "بعد" الأول).
  for v_item in select * from jsonb_array_elements(p_contract->'items') loop
    select * into v_product from products
    where id = (v_item->>'product_id')::uuid and tenant_id = v_tenant
    for update;
    if not found then
      raise exception 'منتج غير موجود';
    end if;
    if not v_product.active then
      raise exception 'المنتج "%" غير نشط', v_product.name;
    end if;
    v_qty := (v_item->>'quantity')::int;
    if v_stock_by_product ? v_product.id::text then
      v_stock := (v_stock_by_product->>v_product.id::text)::int;
    elsif v_product.serial_required then
      select count(*) into v_stock from product_serials
      where product_id = v_product.id and status = 'available';
    else
      select coalesce(sum(quantity), 0) into v_stock from inventory_movements
      where product_id = v_product.id;
    end if;

    if v_product.serial_required then
      if v_qty <> 1 then
        raise exception 'المنتج "%" يُباع سيريال واحد لكل سطر', v_product.name;
      end if;
      select * into v_serial from product_serials
      where id = (v_item->>'serial_id')::uuid and product_id = v_product.id and tenant_id = v_tenant
      for update;
      if not found then
        raise exception 'السيريال غير موجود';
      end if;
      if v_serial.status <> 'available' or v_serial.id = any(v_serial_ids) then
        raise exception 'السيريال "%" اتباع خلاص (غالبًا من جهاز تاني) — العقد ماتسجّلش', v_serial.serial_number;
      end if;
      v_serial_ids := v_serial_ids || v_serial.id;
    else
      if v_qty <= 0 then
        raise exception 'كمية غير صحيحة للمنتج "%"', v_product.name;
      end if;
      if v_qty > v_stock then
        raise exception 'المخزون غير كافٍ للمنتج "%" (متاح %)', v_product.name, v_stock;
      end if;
    end if;
    v_movements := v_movements || jsonb_build_object(
      'product_id', v_product.id, 'quantity', -v_qty, 'before', v_stock, 'after', v_stock - v_qty
    );
    v_stock_by_product := v_stock_by_product || jsonb_build_object(v_product.id::text, v_stock - v_qty);
  end loop;

  v_number := 'CNT-' || v_year || '-' ||
    lpad(next_tenant_code_counter(v_tenant, 'installment_contracts:' || v_year)::text, 6, '0');

  insert into installment_contracts (
    id, tenant_id, contract_number, customer_id, customer_name, items, cash_subtotal,
    down_payment, principal, plan_id, plan_duration_months, plan_rate_pct, finance_amount,
    total_amount, installment_amount, status, user_id, created_at
  ) values (
    v_id, v_tenant, v_number, v_customer.id, v_customer.name, p_contract->'items', v_cash_subtotal,
    v_down, v_principal, v_plan.id, v_plan.duration_months, v_plan.rate_pct, v_finance,
    v_total, (p_contract->>'installment_amount')::numeric, 'active', v_user, v_created_at
  )
  returning * into v_contract;

  insert into installments (tenant_id, contract_id, seq, due_date, amount, paid_amount, status)
  select v_tenant, v_id, (l->>'seq')::int, (l->>'due_date')::timestamptz, (l->>'amount')::numeric, 0, 'scheduled'
  from jsonb_array_elements(p_contract->'schedule') l;

  if array_length(v_serial_ids, 1) > 0 then
    update product_serials set status = 'sold' where id = any(v_serial_ids);
  end if;

  insert into inventory_movements
    (tenant_id, product_id, type, quantity, before, after, user_id, reference, created_at)
  select v_tenant, (m->>'product_id')::uuid, 'sale', (m->>'quantity')::int, (m->>'before')::int,
         (m->>'after')::int, v_user, v_number, v_created_at
  from jsonb_array_elements(v_movements) with ordinality as x(m, n)
  order by n;

  return jsonb_build_object(
    'contract', to_jsonb(v_contract),
    'replayed', false,
    'customer', case when p_new_customer is null then null else to_jsonb(v_new_customer) end
  );
end;
$$;

revoke all on function offline_operation_time(timestamptz) from public, anon;
grant execute on function offline_operation_time(timestamptz) to authenticated;
revoke all on function collect_installment_payment_offline(uuid, numeric, timestamptz, uuid) from public, anon;
grant execute on function collect_installment_payment_offline(uuid, numeric, timestamptz, uuid) to authenticated;
revoke all on function create_installment_contract_offline(jsonb, jsonb, jsonb, timestamptz) from public, anon;
grant execute on function create_installment_contract_offline(jsonb, jsonb, jsonb, timestamptz) to authenticated;
