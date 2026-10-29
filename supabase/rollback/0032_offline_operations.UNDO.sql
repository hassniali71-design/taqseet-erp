-- رجوع بند 80 (ملف التحديث 0032): بيشيل الدوال اللي الملف ضافها وعمود وقت الوصول.
-- بيتشغّل بالإيد بس من محرر الأوامر لو احتجنا نرجع. مبيلمسش أي عقد أو تحصيل اتسجّل — العقود
-- والإيصالات اللي اتسجلت من الطابور بتفضل زي ما هي (بيتشال بس عمود وقت وصولها).
-- بعد الرجوع: التحصيل من غير نت بيتبعت لدالة 0029 مباشرة، وعقود التقسيط من غير نت بتستنى على
-- الجهاز لحد ما الملف يتطبّق تاني.

drop function if exists create_installment_contract_offline(jsonb, jsonb, jsonb, timestamptz);
drop function if exists collect_installment_payment_offline(uuid, numeric, timestamptz, uuid);
drop function if exists offline_operation_time(timestamptz);
alter table installment_contracts drop column if exists synced_at;
alter table installment_payments drop column if exists synced_at;
