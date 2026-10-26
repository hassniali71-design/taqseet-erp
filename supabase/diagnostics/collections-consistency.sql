-- فحص تشخيصي (بند 71) — قراءة بس، مبيعدّلش أي حاجة. يتشغّل في Supabase → SQL Editor.
-- مش migration: متحطوش في supabase/migrations.
--
-- الهدف: نفرّق بين (أ) مشكلة عرض بس — البيانات في القاعدة سليمة والمتصفح كان مش بيجيبها كلها
-- (حد الـ1000 صف)، و(ب) مشكلة بيانات فعلية — إيصال اتسجل والأقساط ماتحدّثتش، أو إيصال اتكرر.
-- النتايج فيها أرقام عقود وإيصالات بس، من غير أسماء أو تليفونات عملاء.

-- 1) حجم البيانات لكل محل — أي رقم فوق 1000 معناه إن المحل ده كان متأثر بمشكلة العرض.
select
  t.name                                                                as "المحل",
  (select count(*) from installments i where i.tenant_id = t.id)        as "صفوف الأقساط",
  (select count(*) from installment_payments p where p.tenant_id = t.id) as "إيصالات التحصيل",
  (select count(*) from treasury_movements m where m.tenant_id = t.id)  as "حركات الخزينة",
  (select count(*) from inventory_movements m where m.tenant_id = t.id) as "حركات المخزون",
  (select count(*) from product_serials s where s.tenant_id = t.id)     as "السيريالات"
from tenants t
order by 2 desc;

-- 2) عقود فيها فرق حقيقي بين مجموع الإيصالات ومجموع المدفوع على الأقساط.
--    لو الاستعلام ده رجّع صفر صفوف → البيانات سليمة والمشكلة كانت عرض بس (اتصلحت في بند 71).
--    لو رجّع صفوف → فيه بيانات محتاجة مراجعة يدوية قبل أي تصحيح (متصلحش جماعي).
with receipts as (
  select contract_id, sum(amount) as received, count(*) as n
  from installment_payments group by contract_id
), paid as (
  select contract_id, sum(paid_amount) as paid
  from installments group by contract_id
)
select
  t.name                                         as "المحل",
  c.contract_number                              as "العقد",
  c.status                                       as "حالة العقد",
  c.total_amount                                 as "إجمالي العقد",
  coalesce(r.received, 0)                        as "مجموع الإيصالات",
  coalesce(p.paid, 0)                            as "مجموع المدفوع على الأقساط",
  coalesce(r.received, 0) - coalesce(p.paid, 0)  as "الفرق",
  coalesce(r.n, 0)                               as "عدد الإيصالات"
from installment_contracts c
join tenants t on t.id = c.tenant_id
left join receipts r on r.contract_id = c.id
left join paid p on p.contract_id = c.id
where abs(coalesce(r.received, 0) - coalesce(p.paid, 0)) > 0.01
order by abs(coalesce(r.received, 0) - coalesce(p.paid, 0)) desc;

-- 3) إيصالات محتمل تكون متكررة: نفس العقد ونفس المبلغ في خلال دقيقتين.
--    ده مش دليل على غلط — ممكن العميل دفع فعلًا مرتين. لازم المحل يأكد مع العميل قبل أي حذف
--    (الحذف/التعديل بقى متاح من كشف حساب العميل، بباسورد المالك وسبب).
select
  t.name            as "المحل",
  c.contract_number as "العقد",
  a.receipt_number  as "إيصال 1",
  b.receipt_number  as "إيصال 2",
  a.amount          as "المبلغ",
  a.created_at      as "وقت 1",
  b.created_at      as "وقت 2"
from installment_payments a
join installment_payments b
  on b.contract_id = a.contract_id
 and b.id <> a.id
 and b.amount = a.amount
 and b.created_at > a.created_at
 and b.created_at - a.created_at < interval '2 minutes'
join installment_contracts c on c.id = a.contract_id
join tenants t on t.id = a.tenant_id
order by a.created_at desc;

-- 4) هل الـmigrations الأخيرة متطبّقة؟ (true = متطبّق)
select
  exists (select 1 from information_schema.columns
          where table_name = 'customers' and column_name = 'ledger_book')            as "0025 الدفتر",
  exists (select 1 from pg_policies
          where tablename = 'installment_payments' and policyname = 'installment_payments_update') as "0025 تعديل التحصيل",
  exists (select 1 from pg_proc where proname = 'delete_customer_permanently')         as "0026 الحذف النهائي";
