# تقسيط (taqseet-erp) — سياق المشروع لجلسات Claude Code القادمة

اقرأ هذا الملف كاملًا، ثم `docs/ERP_SaaS_Requirements.md` (المواصفة الكاملة، 134 قسم، المرجع الملزم الوحيد) قبل أي تعديل.

## المشروع بإيجاز

**ERP SaaS متعدد المستأجرين (Multi-Tenant)** لمحلات بيع الأجهزة الكهربائية والمنزلية في مصر، محوره **البيع بالتقسيط**. واجهة عربية RTL بالكامل. راجع `docs/ERP_SaaS_Requirements.md` لكل تفصيلة — هذا الملف يلخص فقط الحالة والقرارات الهندسية.

المبدأ الحاكم للمنتج: **"Complexity belongs inside the system, not in front of the employee."**

## الستاك

TanStack Start + React 19 + TypeScript + Tailwind CSS v4 (`@theme inline`) + shadcn/ui (style: new-york) + TanStack Query/Router + Vite + Bun + Cloudflare Workers (deployment target) + Supabase (Auth/Postgres/RLS/Storage) + Zod.

```bash
bun i
bun run dev      # يجب أن يفضل شغال بعد أي تعديل
bun run build
bun run lint
```

## الحالة الحالية (حدّث هذا القسم بعد كل Phase فرعية — هذا هو المرجع الوحيد لمعرفة "وصلنا لفين")

**قاعدة عامة تنطبق على كل ما هو موجود حاليًا:** كل شيء مبني على **Mock data-store** (`src/lib/data-store.ts`، localStorage + subscribe/emit). لا يوجد اتصال Supabase حقيقي بعد (بانتظار بيانات اعتماد المستخدم في `.env`، انظر `.env.example`). كل الجداول/الحقول مطابقة بالاسم لـ`docs/ERP_SaaS_Requirements.md §118` و`supabase/migrations/*.sql` — الانتقال لاحقًا **drop-in replacement** لأجسام الدوال في `data-store.ts`، مش إعادة بناء. **⚠️ طالما البيانات Mock، لا Phase "جاهزة للإنتاج" بمعايير §134** — RLS/Tenant isolation/Server-side authorization الحقيقيين (§133) لا يتحققوا إلا بعد ربط Supabase فعليًا.

**بيانات الدخول التجريبية:** `owner@demo.local` / `owner123` (نظام دخول Mock بحت في `signIn`/`getSession`/`signOut`، سيُستبدل بالكامل بـSupabase Auth الحقيقي عند توفره — ليس قبل ذلك).

### منفّذ فعليًا (مبني، مُختبر بمتصفح حقيقي عبر Playwright، Build/Lint/tsc نظيفين)

- **Phase 0 — Bootstrap:** سكافولد تقني كامل (TanStack Start + Bun + Tailwind v4 + shadcn).
- **دخول/لوحة تحكم Mock:** `/login` → `/dashboard` (أرقام حقيقية: عدد عملاء/أجهزة).
- **Phase 1 — Foundation:**
  - `/settings` — إعدادات المحل + كل الحقول اللي هتحتاجها Phases 2-7 (طريقة تكلفة، حد خصم الموظف، أقل مقدم، Grace Period، Credit Hold Days، تفعيل غرامة تأخير، فترة إرجاع) — `TenantSettings` في `src/types/index.ts`.
  - `/users` — عرض المستخدمين + إنشاء مستخدم بدور + تفعيل/تعطيل (لا حذف).
  - `/audit` — سجل عمليات للقراءة فقط، يعرض كل الـmutations المسجّلة عبر `recordAudit`.
  - Roles/Permissions موجودة في الـdata layer (`getRoles`/`getUserPermissionKeys`) لكن مفيش UI لتعديل صلاحيات كل Role بعد — هيتعمل مع أول Feature محتاجه فعليًا (تفادي شاشة بلا استخدام).
- **Phase 3 — Customers & Sales (تكملة فوق `/customers`) — منفّذة:**
  - `/customers/$id` (الملف: `customers_.$id.tsx`) — Customer 360 مبسّطة: إجمالي مشتريات، عدد فواتير، حد ائتمان، **الضامنون** (§15، إضافة فقط) + **سجل المشتريات** (روابط لفواتير حقيقية).
  - **POS/بيع نقدي فعلي (§32,§34):** `/sales/new` — عميل (أو عميل نقدي) → إضافة أصناف (منتج غير سيريال بكمية، أو منتج سيريال باختيار سيريال محدد — سطر واحد بالضبط لكل سيريال) → خصم % **محدود فعليًا بحد الموظف من الإعدادات** (تجاوزه مرفوض صراحة من `createSale`، مش "pending" وهمي — تجاوز الحد الفعلي بصلاحية مدير مؤجَّل لمحرك الاعتماد الحقيقي §105) → تأكيد.
  - `createSale` (في `data-store.ts`): يتحقق من كل سطر قبل ما يكتب أي حاجة (منتج نشط، مخزون كافٍ، سيريال متاح فعلًا ومش مستخدم مرتين في نفس الفاتورة) → عند النجاح: يحوّل حالة السيريال لـ`sold`، ينشئ Inventory Movement (type=`sale`) لكل صنف، يولّد رقم فاتورة تسلسلي `INV-YYYY-NNNNNN` (§91)، يسجّل Audit.
  - `/sales/$id` — إيصال الفاتورة (نمط طباعة بسيط)، الرابط من صفحة الـPOS بعد التأكيد ومن Customer 360.
  - `Sale.items` **متداخلة داخل مستند البيع نفسه** (مش جدول `sale_items` منفصل) — تبسيط متعمد لمرحلة الـMock، موثّق في تعليق النوع بـ`types/index.ts`. أي قارئ يمر بـ`getSales()` واحدة، فترقية الشكل لاحقًا مع Supabase مش هتغيّر أي Call Site.
  - Sale State Machine (§33) **مبسّطة لأقصى درجة الآن:** بيع نقدي يوصل لـ`completed` مباشرة — Draft/Pending Approval/Delivered هتظهر فعليًا مع محرك الاعتماد الحقيقي وPhase 7 (توصيل/تركيب).
- **شريحة Customers (§14) — subset مبسّط:**
  - `/customers` — list+add+edit، فيها `credit_limit` (تمهيدًا لـPhase 4)، لا حذف. Customer 360/Guarantors بقوا فعليين (فوق). الناقص عمدًا: Risk Score (§17، Phase 4 حقيقي).
- **Phase 2 — Products & Inventory (تكملة فوق `/products`) — منفّذة:**
  - `/products` — list+add+edit + عمود مخزون حقيقي (`getProductStock`)، رابط لكل جهاز.
  - `/products/$id` (الملف: `products_.$id.tsx` — **لاحظ الـ`_` قبل النقطة**، انظر ملاحظة الراوتنج أدناه) — تفاصيل الجهاز، قائمة السيريالات بحالتها، زر "استلام كمية" (يطابق ما ستستدعيه Phase 5's Goods Receipt لاحقًا — نفس الدالة `receiveStock`، مش مسار موازٍ)، سجل حركة المخزون كامل.
  - `/stock-count` (§30) — جرد للمنتجات غير المرتبطة بسيريال فقط (منتجات السيريال دقتها من قائمة السيريالات نفسها، مش رقم عدّ).
  - **Serial lifecycle فعلي (§21):** `ProductSerial` بحالة `available/sold/returned/inspection/damaged`، منع تسجيل نفس السيريال مرتين (`receiveStock` يتحقق فعليًا). حالة `sold` ستُستخدم أول مرة في Phase 3 (البيع).
  - **Inventory Ledger فعلي (§29):** `InventoryMovement`، `getProductStock` هو المصدر الوحيد للكمية (سيريال: عدّ `available`؛ غير سيريال: مجموع الحركات) — **لا يوجد حقل كمية منفصل في أي مكان، لا تضِف واحدًا**.
  - الناقص عمدًا: Categories/Brands ككيانات منفصلة (استُبدلت بحقول نص حر بسيطة — قرار تبسيط متعمد، مذكور في تعليق `Product` بـ`types/index.ts`)، Multiple Units، تسعير خاص بعميل.
- **بنية مشتركة يُعاد استخدامها في كل صفحة محمية جديدة (لا تخترع نمطًا موازيًا):**
  - `src/components/AppHeader.tsx` — Nav + Sign out.
  - `src/hooks/use-session.ts` — `useSession`/`useRequireSession` (نمط SSR-آمن لقراءة الجلسة).
  - نمط الصفحة القياسي: `useRequireSession()` → `if (!session) return null` → استخراج `actorUserId`/`tenantId` كمتغيرات منفصلة (تفادي مشكلة TS closure narrowing) → `<AppHeader session={session} />` + محتوى الصفحة.
  - **⚠️ ملاحظة راوتنج مهمة (باگ حقيقي اتصلح في Phase 2):** لو عندك صفحة قائمة `foo.tsx` ومحتاج صفحة تفاصيل ديناميكية `/foo/$id`، **لازم** تسمي الملف `foo_.$id.tsx` (شرطة تحتية `_` قبل النقطة) — مش `foo.$id.tsx`. من غيرها، TanStack Router بيعتبر `foo.tsx` Layout ضمني للـ`$id` (لازم `<Outlet/>` فيه)، فالـURL يتغير بس المحتوى يفضل صفحة القائمة (باگ صامت، اتسبب فيه ولاحظته بس بمتصفح فعلي). طبّق ده على `/customers/$id`، `/contracts/$id`، إلخ في الـPhases الجاية.
- **Phase 4 — Installments (الأعقد، أهم فيتشر في المنتج) — منفّذة بالكامل:**
  - `src/lib/finance-engine.ts` — دالتان نقيتان (لا I/O، لا اعتماد على `data-store.ts`): `calculateFinance(principal, ratePct)` (§37: `Finance = Principal × Rate` مرة واحدة، غير مركّب) و`generateSchedule(totalAmount, durationMonths, startDate?)` (§41: تواريخ استحقاق شهرية ثابتة، القسط الأخير يمتص فرق التقريب). **أول اختبار حقيقي في المشروع:** `scripts/verify-finance-engine.ts` (`bun run scripts/verify-finance-engine.ts`) يتحقق من مثال القبول في §128 حرفيًا (15,000@40%/12 شهر = 21,000 إجمالي / 12×1,750) + حالة أرقام غير مضبوطة (تقريب). أي تعديل على `finance-engine.ts` لازم يعيد تشغيل السكريبت ده قبل الثقة فيه.
  - `/settings` قسم "خطط التقسيط" (§38) — إضافة خطة (مدة+نسبة) وإيقاف/تفعيل، **بدون حذف**. تعطيل خطة **لا يغيّر** عقودًا أنشئت بيها من قبل (Snapshot في العقد نفسه، §114 — اتحقق منه فعليًا بمتصفح: عقد فضل بنفس الأرقام بعد تعطيل خطته).
  - **بيع بالتقسيط فعلي (§35):** `/sales/new-installment` — عميل مسجّل إلزامي (مفيش "عميل نقدي" هنا) → أصناف بسعر `installment_price` (مش `cash_price`) → عرض حد الائتمان المتاح والحالة (Credit Hold) قبل التأكيد → مقدّم (تحقق فعلي من الحد الأدنى `min_down_payment_pct`) → خطة → معاينة الجدول كامل قبل التأكيد.
  - `createInstallmentContract` (في `data-store.ts`): يتحقق بالترتيب — عميل نشط، خطة نشطة، Credit Hold (§56)، حد أدنى للمقدّم، **Credit Check فعلي** (`Available Credit = credit_limit - Current Exposure`, §57 — رفض حقيقي لو تجاوز، مُختبر بمتصفح) — ثم يحسب `principal = cash_subtotal - down_payment`، يستدعي `calculateFinance`/`generateSchedule`، يولّد رقم عقد `CON-YYYY-NNNNNN` (§91)، وينشئ الأقساط + يطبّق تأثير المخزون (سيريال→sold، Movement) بنفس نمط `createSale`.
  - `/contracts/$id` (الملف: `contracts_.$id.tsx`) — بيانات العقد، جدول الأقساط بحالته **الفعلية المحسوبة وقت العرض** (`getEffectiveInstallmentStatus`/`getDaysOverdue` — لا تُخزَّن أبدًا، نفس مبدأ عدم تخزين حالة تعتمد على الوقت)، فورم تحصيل دفعة، سجل التحصيلات (إيصالات)، أزرار تسوية مبكرة/إعادة هيكلة/تسجيل وعد، سجل الوعود، سجل إعادة الهيكلة.
  - **التحصيل (§46, §52, §54/§55):** `collectPayment` — يرفض أي مبلغ أكبر من إجمالي المتبقي على العقد قبل ما يكتب أي حاجة، يوزّع Oldest-Due-First، يصدر إيصال `REC-YYYY-NNNNNN` تسلسلي وغير قابل للتعديل، يحدّث حالة العقد تلقائيًا (`partially_paid`/`settled`). `/collections` — Collections Workbench: كل العقود المفتوحة، القسط القادم وحالته، فلاتر (الكل/مستحق اليوم/متأخر)، تحصيل مباشر من الصف. **ملاحظة تصميم مهمة اتكشفت بالاختبار الفعلي:** رسالة نجاح التحصيل في `/collections` لازم تكون على مستوى الصفحة مش الصف — عقد بيتحصّل بالكامل بيختفي فورًا من فلتر "متأخر" فياخد الصف معاه أي مؤشر داخله.
  - **Overdue/Credit Hold (§49/§56):** `getEffectiveInstallmentStatus`/`getDaysOverdue`/`isCustomerOnCreditHold` كلها Computed-on-read (زي حالة القسط)، مفيش Cron ولا مهمة خلفية.
  - **Promise to Pay (§51):** `recordPromise` ينشئ وعد بحالة `pending`؛ `collectPayment` بيحوّله تلقائيًا لـ`kept` لو دفعة حصلت قبل أو في تاريخ الوعد؛ `getEffectivePromiseStatus` بيقرأه كـ`failed` لو التاريخ فات وهو لسه `pending` — بدون تخزين، نفس نمط تأخر الأقساط.
  - **Early Settlement (§47):** `earlySettleContract` بيسدد كل المتبقي دفعة واحدة عبر نفس مسار `collectPayment` (نفس الإيصال/التدقيق)، وبعدين يميّز العقد `settled_early` عن `settled` العادي.
  - **Restructuring (§48):** `restructureContract` **لا يعدّل ولا يحذف الجدول الأصلي أبدًا** — الأقساط المتبقية تتحول `rescheduled` (تُحفظ للأبد كتاريخ) وتُنشأ أقساط جديدة على نفس العقد بمدة جديدة (بدون تمويل إضافي)، مع `RestructureEvent` يربط القديم بالجديد. اتحقق فعليًا بمتصفح: 6 أقساط قديمة اتحولت `rescheduled`، 9 أقساط جديدة اتولدت.
  - **Migration:** `0005_installments.sql` (installment_plans/installment_contracts/installments/installment_payments/promises_to_pay/restructure_events) بـRLS كاملة، `installment_payments`/`restructure_events` بدون policy تعديل/حذف (Append-only زي `audit_logs`).
- **Migrations:** `0001_foundation.sql` (tenants/tenant_settings/users/roles/permissions/role_permissions/user_roles/audit_logs) + `0002_customers_products.sql` (customers بـcredit_limit، products) + `0003_inventory.sql` (product_serials، inventory_movements) + `0004_sales.sql` (guarantors، sales بـ`items jsonb`) + `0005_installments.sql` (تقسيط كامل) — كلها بـRLS كاملة جاهزة، غير مُطبَّقة بعد.

### التالي مباشرة (بالترتيب — راجع خطة التنفيذ الكاملة أدناه لكل Phase بالتفصيل)

**Phase 5 — Purchasing** ← نحن هنا الآن (راجع تفاصيلها كاملة تحت).

## خطة التنفيذ الكاملة (كل الـPhases 1→9 — المرجع الوحيد الدائم، الجلسة دي ممكن تنقطع فالملف ده اللي بيرجّعك بالظبط لمطرح ما وقفت)

الترتيب مطابق لـ§131 في الـSpec. كل Phase فرعية = تعديل محدد → build/lint/tsc نظيفين → اختبار Playwright فعلي → لقطة شاشة لو فيها قيمة بصرية → تحديث قسم "الحالة الحالية" أعلاه → commit محدد + push. **مفيش وقفات للسؤال إلا عند Blocker حقيقي** (قرار مالي حساس الـSpec نفسها تقول "يحتاج تأكيد" — يتسجل كإعداد قابل للتفعيل بدل ما يُخترع).

**Phase 5 — Purchasing:**
`/suppliers` CRUD · `/purchases/new` (طلب→استلام يحدّث المخزون وينشئ سيريالات) · Supplier Payments.

**Phase 6 — Finance:**
Treasury accounts (خزينة رئيسية+كاشير، أرصدة فعلية) · Shift open/close (§70) · Expenses (§73) · محاسبة مبسّطة (§74/75: Chart of Accounts أساسي + قيد تلقائي لكل بيع/تحصيل/شراء/مصروف) · Daily Close Snapshot (عرض فقط، بدون قفل فترات فعلي).

**Phase 7 — After Sales:**
Returns (§79/81، Inspection مش Available مباشرة) · Exchange مبسّط (§82) · Delivery Orders (§84) · Warranty للقراءة (§86، من warranty_months).

**Phase 8 — Reports & Notifications:**
`/dashboard` بأرقام حقيقية كاملة (مبيعات اليوم/تحصيلات مستحقة/متأخرات/مخزون منخفض) · `/reports` (مبيعات، عقود، كشف حساب، بطيء الحركة) · Notification Center داخلي مُشتق (§92، بدون WhatsApp/SMS فعلي — Feature Flag متوقف، §93).

**Phase 9 — SaaS Control Center:**
`/platform` (دور Platform Owner) · إنشاء Tenant جديد فعليًا (أول استخدام حقيقي لتعدد الـTenants) + توليد Owner وكلمة سر (الصور المرفقة من المستخدم مرجع بصري لشكل بطاقة الـTenant/الـCredentials) · تفعيل/تعليق/تجديد اشتراك · Support Access مبسّط (عرض بيانات Tenant للدعم + Audit كامل، بدون Impersonation حرفي).

**تعريف "المشروع جاهز للتسليم":** كل الشاشات أعلاه شغالة ومُختبرة بمتصفح حقيقي، Build/Lint/TypeScript نظيفين، التوثيق يعكس الواقع بدقة، **ولسه Mock وليس Production-Ready بمعايير §134 حتى يتم ربط Supabase الحقيقي** — هذا يُذكر صراحة في كل تسليم نهائي.

## قواعد صارمة غير قابلة للتفاوض (ملخص §133 — التفاصيل الكاملة في الـSpec)

1. لا وصول عبر Tenants أبدًا. RLS إلزامية بمجرد ربط Supabase.
2. Server-side authorization إلزامي — لا Business Logic حساس في الـFrontend فقط.
3. **لا Hard Delete** لأي عملية حساسة (بيع/تحصيل/تقسيط/مخزون/محاسبة) — فقط Cancel/Reverse/Adjustment/Archive/Deactivate.
4. لا تعديل مباشر لرصيد عميل — فقط عبر Financial Adjustment مسجّل.
5. لا تعديل صامت للمخزون — كل تغيير كمية = Movement مسجّل.
6. لا بيع نفس السيريال مرتين.
7. لا اعتماد تحويل غير موثّق (Payment Proof) كدفعة قبل Approval.
8. **Historical Snapshot إلزامي**: أي تغيير إعداد (نسبة تمويل، سياسة مقدم، سياسة إرجاع) لا يغيّر العمليات القديمة — يُحفظ Snapshot وقت التنفيذ (انظر §37, §38, §114).
9. كل Override يحتاج صلاحية + سبب + Audit، ويظهر في Overrides Report.
10. الضرائب/VAT خارج نطاق V1 تمامًا — لا تُضاف حسابات ضريبية.
11. التوصيل والتركيب خدمتان منفصلتان تمامًا عن قيمة البيع/التقسيط في V1.

## محرك التقسيط — المعادلة المرجعية (§37, §128)

```
Finance Amount = Principal × Plan Rate   (مرة واحدة، غير مركّب شهريًا)
Total = Principal + Finance Amount
```

Acceptance Test من الـSpec: Principal=15,000، خطة 12 شهر @40% → Finance=6,000 → Total=21,000 → 12 قسط × 1,750. تغيير الخطة لاحقًا لـ35% **لا يغيّر** عقودًا قديمة استخدمت 40%.

## قواعد عمل عامة

- لا تغيّر الستاك الأساسي بدون سبب قوي وموافقة صريحة.
- لا تخترع Business Rules غير مذكورة في الـSpec — عند الشك، استخدم إعداد قابل للتعديل أو علّم القرار كـ"يحتاج تأكيد من المستخدم".
- حافظ على RTL/العربي في كل مكان (`dir="rtl"` و`lang="ar"` في `src/routes/__root.tsx`).
- لا تكسر `bun run dev`/`build` بعد أي تعديل.
- Commits صغيرة ومتكررة بوصف واضح — لا commit ضخم يجمع عدة Phases.
- لا تضف مكتبات جديدة بدون داعي واضح.
- عند الشك في نمط State مشترك، اتبع نمط `src/lib/data-store.ts` الموجود — لا تخترع نمطًا موازيًا.
