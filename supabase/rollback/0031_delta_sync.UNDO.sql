-- رجوع بند 79 (ملف التحديث 0031): بيشيل كل اللي الملف ضافه، ويرجّع القاعدة زي ما كانت قبله.
-- بيتشغّل بالإيد بس من SQL Editor لو احتجنا نرجع. مبيلمسش أي بيانات أصلية: العمود اللي بيتشال
-- (`updated_at`) كان فيه أوقات بس اتضافت مع الملف، والجدول اللي بيتشال (`sync_deleted_rows`) سجل
-- مساعد للمزامنة. البرنامج بيرجع لوحده لجلب الجداول كاملة لما يلاقي العمود مش موجود.

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
    execute format('drop trigger if exists sync_touch on public.%I', t);
    execute format('drop trigger if exists sync_log_delete on public.%I', t);
    execute format('drop index if exists public.%I', 'idx_' || t || '_tenant_updated');
    execute format('alter table public.%I drop column if exists updated_at', t);
  end loop;
end $$;

drop function if exists sync_log_delete();
drop function if exists sync_touch_updated_at();
drop table if exists sync_deleted_rows;
