-- بند 69 — طلب العميل الصريح (بعد استخدام فعلي):
--
-- 1) customers.ledger_book — "الدفتر": نص حر اختياري (رقم/اسم الدفتر الورقي اللي العميل متسجّل
--    فيه في المحل). بيتكتب وقت إضافة العميل أو من جوه فاتورة البيع (نقدي/تقسيط)، ويتعدّل بعدين
--    من صفحة العملاء، وبيظهر كعمود في جدول العملاء.
--
-- 2) installment_payments بقت قابلة للتعديل/الحذف — كانت append-only بقرار سابق (§55 في 0005)،
--    والعميل طلب صراحة إن التحصيل المتسجّل بالغلط يتعدّل أو يتحذف من كشف حساب العميل ويتزامن مع
--    النظام كله. الحوكمة بقت في التطبيق بدل قاعدة البيانات: باسورد الأونر + سبب إلزامي + سطر
--    audit_logs فيه الإيصال القديم كامل (old_value)، والأثر المالي بيتعكس بحركة خزينة/قيد عكسي
--    (treasury_movements/journal_entries يفضلوا append-only زي ما هم — مفيش حذف لأي حركة مالية).
--    انظر useEditInstallmentPayment/useDeleteInstallmentPayment في src/lib/supabase-queries.ts.

alter table customers add column if not exists ledger_book text;

drop policy if exists installment_payments_update on installment_payments;
create policy installment_payments_update on installment_payments
  for update
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

drop policy if exists installment_payments_delete on installment_payments;
create policy installment_payments_delete on installment_payments
  for delete
  using (tenant_id = current_tenant_id());
