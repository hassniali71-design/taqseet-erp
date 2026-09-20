-- تفاصيل الصفقة كاملة محفوظة (Historical Snapshot) لكل sale_settlement — العميل طلب صراحة
-- يشوف لكل صفقة شريك: قيمة الصفقة كاملة، نسبة تقسيمه منها، ونسبة ربحه، مش بس الأرقام
-- النهائية (اتخصم منه / هيكسب). القيم دي بتتسجل وقت التسوية وتفضل ثابتة حتى لو الشريك غيّر
-- نسبة ربحه لاحقًا (profit_share_pct على partners نفسه ممكن يتغيّر بمرور الوقت — الـsnapshot
-- هنا يحافظ على دقة السجل التاريخي، نفس مبدأ plan_rate_pct المحفوظ على installment_contracts).
--
-- الأعمدة nullable عمدًا: صفوف funding/withdrawal/adjustment مش محتاجاها، وصفوف
-- sale_settlement القديمة (قبل هذا الـmigration) هتفضل NULL — العرض في الواجهة بيتعامل مع ده
-- (يعرض "—" بدل رقم لو القيمة غير موجودة)، مش بيحاول يعيد حسابها من بيانات حالية ممكن تكون
-- اتغيّرت.

alter table partner_transactions
  add column if not exists deal_value numeric(12, 2),
  add column if not exists split_pct numeric(5, 2),
  add column if not exists profit_share_pct_snapshot numeric(5, 2);
