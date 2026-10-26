-- بند 78 — فهارس للجلب على صفحات (للمراجعة، مش متطبّق). آمنة: بتضيف فهارس بس، مبتغيّرش أي بيانات.
--
-- كل قايمة في النظام بتتجاب دلوقتي بـ: where tenant_id = X order by <created_at|name|...>, id
-- على صفحات (src/lib/fetch-all.ts). الفهارس دي بتخلي قاعدة البيانات تقرا كل صفحة بالترتيب
-- مباشرة بدل ما ترتّب الجدول كله مع كل صفحة — فرق ملحوظ لما الجداول توصل لعشرات الآلاف.
-- بتاخد مساحة صغيرة (فهرس على 3 أعمدة) — راجع المساحة في Database → Usage بعد التطبيق.
--
-- `if not exists` = آمن تشغيله أكتر من مرة. على جداول صغيرة (زي دلوقتي) بيتعمل في ثواني.

-- جداول بتتجاب بترتيب created_at (تنازلي) + id
create index if not exists idx_installment_contracts_tenant_created_id on installment_contracts (tenant_id, created_at desc, id);
create index if not exists idx_installment_payments_tenant_created_id on installment_payments (tenant_id, created_at desc, id);
create index if not exists idx_sales_tenant_created_id on sales (tenant_id, created_at desc, id);
create index if not exists idx_customers_tenant_created_id on customers (tenant_id, created_at desc, id);
create index if not exists idx_treasury_movements_tenant_created_id on treasury_movements (tenant_id, created_at desc, id);
create index if not exists idx_inventory_movements_tenant_created_id on inventory_movements (tenant_id, created_at desc, id);
create index if not exists idx_journal_entries_tenant_created_id on journal_entries (tenant_id, created_at desc, id);
create index if not exists idx_partner_transactions_tenant_created_id on partner_transactions (tenant_id, created_at desc, id);
create index if not exists idx_promises_to_pay_tenant_created_id on promises_to_pay (tenant_id, created_at desc, id);

-- جداول بتتجاب من غير ترتيب مخصوص (بالـid بس) — الأقساط أكبر جدول في المحل
create index if not exists idx_installments_tenant_id_id on installments (tenant_id, id);
create index if not exists idx_product_serials_tenant_id_id on product_serials (tenant_id, id);

-- رصيد خزينة واحدة (قبل/بعد كل حركة) وإغلاق الوردية
create index if not exists idx_treasury_movements_account_created on treasury_movements (account_id, created_at);
