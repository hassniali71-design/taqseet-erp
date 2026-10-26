-- بند 74 — تحديث تلقائي لحظي بين الأجهزة (طلب المالك: "البيانات تتجدد لوحدها").
--
-- بيضيف جداول المحل لـpublication بتاع Supabase Realtime (`supabase_realtime`). الواجهة
-- (src/hooks/use-realtime-sync.ts) بتشترك في التغييرات دي لمحل المستخدم بس (filter بـtenant_id،
-- وRLS بتتطبق على Realtime كمان)، وأول ما أي صف يتضاف/يتعدل من أي جهاز، الصفحات المفتوحة على
-- كل الأجهزة التانية بتعيد جلب الجدول ده لوحدها — من غير Refresh.
--
-- آمن تشغيله أكتر من مرة: بيضيف بس الجداول اللي لسه مش في الـpublication. لو الـpublication
-- نفسه مش موجود (مشروع Supabase قديم جدًا) بيتعمل.

do $$
declare
  t text;
  tables text[] := array[
    'customers', 'guarantors', 'products', 'product_serials', 'inventory_movements',
    'sales', 'sale_returns', 'exchange_transactions', 'delivery_orders',
    'installment_plans', 'installment_contracts', 'installments', 'installment_payments',
    'promises_to_pay', 'restructure_events',
    'suppliers', 'purchases', 'supplier_payments',
    'treasury_accounts', 'treasury_movements', 'shifts', 'expenses', 'journal_entries',
    'partners', 'partner_transactions'
  ];
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array tables loop
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = t)
       and not exists (
         select 1 from pg_publication_tables
         where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
       ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
