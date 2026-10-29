-- بند 79 — نسخة بيانات المحل على الجهاز + جلب التغييرات بس (المرحلة 1 في TASK-0003).
-- إضافة بس: مفيش أي عمود أو جدول موجود بيتغيّر أو يتمسح، ومفيش أي حساب مالي بيتلمس.
--
-- الفكرة: الجهاز بيشيل نسخة كاملة من بيانات المحل (عشان يفتح على طول ومن غير نت)، وبعد أول مرة
-- بيسأل "إيه اللي اتغيّر من آخر مرة؟" بدل ما ينزّل الجداول كاملة مع كل فتحة صفحة. ده محتاج حاجتين:
--   1) عمود `updated_at` على كل جدول بيتعرض في البرنامج: بياخد وقت الإضافة تلقائيًا، وبيتحدّث
--      لوحده مع أي تعديل (trigger قبل التعديل — سطر واحد، مالوش أي منطق تاني).
--   2) جدول `sync_deleted_rows`: لما صف يتمسح، رقمه بيتسجّل هنا عشان الأجهزة تشيله من نسختها.
--
-- لو الملف ده متطبّقش، البرنامج بيرجع لوحده يجيب الجداول كاملة زي دلوقتي بالظبط (src/lib/table-sync.ts).
-- ملف الرجوع: 0031_delta_sync.UNDO.sql (مش في مجلد التطبيق التلقائي — بيتشغّل بالإيد بس).

create table if not exists sync_deleted_rows (
  id bigserial primary key,
  tenant_id uuid not null,
  table_name text not null,
  row_id uuid not null,
  deleted_at timestamptz not null default now()
);
create index if not exists idx_sync_deleted_rows_tenant_time on sync_deleted_rows (tenant_id, deleted_at);

alter table sync_deleted_rows enable row level security;
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sync_deleted_rows' and policyname = 'sync_deleted_rows_select'
  ) then
    create policy sync_deleted_rows_select on sync_deleted_rows
      for select using (tenant_id = current_tenant_id());
  end if;
end $$;
-- مفيش policy إضافة/تعديل/مسح: الإضافة من الـtrigger بس (security definer تحت).

create or replace function sync_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function sync_log_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into sync_deleted_rows (tenant_id, table_name, row_id)
  values (old.tenant_id, tg_table_name, old.id);
  return old;
end;
$$;

do $$
declare
  t text;
  tables text[] := array[
    'customers', 'guarantors', 'products', 'product_categories', 'product_brands',
    'product_serials', 'inventory_movements',
    'sales', 'sale_returns', 'exchange_transactions', 'delivery_orders',
    'installment_plans', 'installment_contracts', 'installments', 'installment_payments',
    'promises_to_pay', 'restructure_events',
    'suppliers', 'purchases', 'supplier_payments',
    'treasury_accounts', 'treasury_movements', 'shifts', 'expenses', 'journal_entries',
    'partners', 'partner_transactions', 'roles', 'users'
  ];
begin
  foreach t in array tables loop
    if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = t) then
      continue;
    end if;
    -- الصفوف القديمة بتاخد وقت قديم ثابت (2000-01-01) مش وقت تطبيق الملف: كده أول "إيه اللي
    -- اتغيّر؟" بعد التطبيق بيرجّع التغييرات الحقيقية بس، مش الجدول كله. الصفوف الجديدة بعد كده
    -- بتاخد وقت إضافتها. (الاتنين من غير إعادة كتابة الجدول — تغيير في التعريف بس.)
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = 'updated_at'
    ) then
      execute format('alter table public.%I add column updated_at timestamptz not null default ''2000-01-01 00:00:00+00''', t);
      execute format('alter table public.%I alter column updated_at set default now()', t);
    end if;
    execute format('create index if not exists %I on public.%I (tenant_id, updated_at)', 'idx_' || t || '_tenant_updated', t);
    execute format('create or replace trigger sync_touch before update on public.%I for each row execute function sync_touch_updated_at()', t);
    execute format('create or replace trigger sync_log_delete after delete on public.%I for each row execute function sync_log_delete()', t);
  end loop;
end $$;
