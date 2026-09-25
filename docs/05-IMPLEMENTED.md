# جرد الفيتشرز المنفذة فعليًا — كل حاجة هنا حقيقية على Supabase، مفيش Mock

ملخص مختصر لكل وحدة، بأسماء الملفات/الدوال الحقيقية — للتفاصيل الدقيقة ارجع للملف نفسه، مش
للنص هنا (النص هنا بيتقادم، الكود لأ).

**الهوية:** `/login`, `/platform/login` — Supabase Auth حقيقي (`supabase.auth.signInWithPassword`).
`validateSession` (`data-store.ts`) بيتحقق دوريًا من الجلسة الحقيقية (mount + window focus) ويعمل
signOut تلقائي لو باظت. `/users` — إنشاء موظف بحساب Auth حقيقي (`createTenantUserWithAuth`).
`/platform` — غرفة تحكم المنصة، `is_platform_owner`، إنشاء تينانت جديد بحساب Owner حقيقي
(`provisionTenantServer`). كل دوال السيرفر الحساسة بتتحقق من الهوية فعليًا (`resolveServerCaller`).

**العملاء/المنتجات/المخزون:** `/customers`, `/customers/$id` (360 + ضامنون + Risk Score حقيقي).
`/products`, `/products/$id` — فئات/ماركات/وحدات كقوائم مُدارة، سيريال lifecycle كامل
(available/sold/returned/inspection/damaged)، `inventory_movements` ledger (`computeProductStock`
المصدر الوحيد للكمية). `/stock-count` — جرد موحّد.

**المبيعات:** `/sales/new` (نقدي) — عميل/منتج بحث (SearchPicker)، خصم بحد أقصى، منتج/عميل جديد
inline، تمويل شريك اختياري، رقم `INV-YYYY-NNNNNN` (عدّاد ذري). `/sales/$id` — إيصال + إرجاع.

**التقسيط:** `src/lib/finance-engine.ts` (`calculateFinance`+`generateSchedule`، نقي، مُختبَر
بـ`scripts/verify-finance-engine.ts`). `/sales/new-installment` — خطة من `/settings` أو خطة
مخصصة لمرة واحدة، مقدّم، معاينة جدول، تمويل شريك. `/contracts/$id` — تحصيل/تسوية مبكرة/إعادة
هيكلة/وعد بالدفع/**إلغاء كامل** (بس قبل أي تحصيل، بباسورد الأونر). `/collections` — Workbench
(Oldest-Due-First) + زرار تذكيرات SMS/WhatsApp.

**المشتريات:** `/suppliers`, `/purchases/new` — استلام فوري + سيريالات + تحديث تكلفة مرجّحة +
دفعة فورية اختيارية + إنشاء منتج جديد inline.

**المالية:** `/treasury` — عدّاد Dashboard احترافي (بند 54-56): مؤشرات رئيسية (رصيد/داخل/خارج/صافي)،
"دليل الخزينة" تبويبي (`TreasuryGuide.tsx`) بدل شرح نصي طويل، إقفال يومي ملوّن باتجاه الحركة، وردية
كاشير (فتح/إقفال بسبب موثّق لأي فرق). `/expenses` (تحميل على خزينة أو شركاء + اعتماد فوق حد معيّن).
`/accounting` — قيود تلقائية (دليل 7 حسابات) لكل عملية بيع/تحصيل/شراء/مصروف.

**الشركاء (فيتشر منفصل، migration 0014+):** `/partners`, `/partners/$id` — تمويل/سحب/تسوية صفقة
بيع (نسبة تقسيم × نسبة ربح لكل شريك)/صرف أرباح حقيقي من خزينة/نصيب من مصروف — دفتر مستقل تمامًا
عن `treasury_movements` بتصميم متعمَّد، النوع الوحيد اللي بيلمس الخزينة هو صرف الأرباح.

**ما بعد البيع:** `/sales/$id` (إرجاع)، `/exchanges/new` (استبدال بفرق سعر)، `/deliveries`،
`/warranty` (محسوب من السيريال + `warranty_months`، بدون كيان مخزَّن).

**التقارير/الإشعارات:** `/dashboard` (9 كروت حقيقية)، `/reports` (مبيعات/عقود/كشف حساب/بطيئة
الحركة/مالي/تحليل أسعار)، `/notifications` (مشتقة حيًّا، فئات متعددة).

**Routing gotcha مهم:** `foo.tsx` + تفاصيل `/foo/$id` لازم يبقى اسم الملف `foo_.$id.tsx` (شرطة
تحتية قبل النقطة) — غيرها TanStack يعتبره Layout ضمني. مطبَّق على customers/contracts/suppliers
/products/platform.support.

**Migrations:** `supabase/migrations/0001` → `0024` (متتالية، بدون فجوات) — راجع `docs/03-STATE.md`
لآخر رقم migration مُطبَّق فعليًا.
