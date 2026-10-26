-- متابعة استهلاك قاعدة البيانات (بند 78) — قراءة بس، مبيعدّلش أي حاجة.
-- يتشغّل في Supabase → SQL Editor كل أسبوع، وتتسجّل النتيجة (انظر docs/OPERATIONS-FREE-PLAN.md).

-- 1) حجم قاعدة البيانات كلها — حد الخطة المجانية 500 MB (اتأكد من الرقم الحالي في صفحة الأسعار).
--    إنذار مبكر: فوق 300 MB. خطر: فوق 400 MB.
select
  pg_size_pretty(pg_database_size(current_database())) as "حجم القاعدة",
  round(pg_database_size(current_database()) / 1024.0 / 1024.0, 1) as "بالميجا";

-- 2) أكبر الجداول (البيانات + الفهارس) وعدد صفوفها التقريبي.
select
  c.relname as "الجدول",
  pg_size_pretty(pg_total_relation_size(c.oid)) as "الحجم الكلي",
  c.reltuples::bigint as "صفوف (تقريبي)"
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by pg_total_relation_size(c.oid) desc
limit 15;

-- 3) نمو البيانات لكل محل (عدد صفوف الجداول اللي بتكبر مع الشغل) — قارنها بالأسبوع اللي فات.
select
  t.name as "المحل",
  (select count(*) from customers x where x.tenant_id = t.id)            as "العملاء",
  (select count(*) from installment_contracts x where x.tenant_id = t.id) as "العقود",
  (select count(*) from installments x where x.tenant_id = t.id)          as "الأقساط",
  (select count(*) from installment_payments x where x.tenant_id = t.id)  as "الإيصالات",
  (select count(*) from treasury_movements x where x.tenant_id = t.id)    as "حركات الخزينة",
  (select count(*) from inventory_movements x where x.tenant_id = t.id)   as "حركات المخزون",
  (select count(*) from audit_logs x where x.tenant_id = t.id)            as "سجل العمليات",
  (select count(*) from message_logs x where x.tenant_id = t.id)          as "رسائل التذكير"
from tenants t
order by 4 desc;

-- 4) هل الـmigrations المهمة متطبّقة؟
select
  exists (select 1 from information_schema.columns where table_name = 'customers' and column_name = 'ledger_book') as "0025",
  exists (select 1 from pg_proc where proname = 'delete_customer_permanently' and prosecdef)                     as "0027",
  (select count(*) from pg_publication_tables where pubname = 'supabase_realtime')                              as "0028 (جداول = 25)",
  exists (select 1 from pg_proc where proname = 'collect_installment_payment')                                   as "0029",
  exists (select 1 from pg_indexes where indexname = 'idx_installments_tenant_id_id')                           as "0030";
