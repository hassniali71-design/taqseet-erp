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
- **شريحة Customers (§14) وProducts (§19) — subset مبسّط، مش Phase 2/3 كاملة:**
  - `/customers` — list+add+edit، فيها الآن `credit_limit` (تمهيدًا لـPhase 4)، لا حذف.
  - `/products` — list+add+edit، `serial_required` مجرد Flag بدون Lifecycle فعلي بعد.
  - الناقص عمدًا هنا: Serial lifecycle فعلي، Categories/Brands ككيانات، Guarantors، Customer 360/Risk Score، Multiple Units، تسعير خاص بعميل — هيتضافوا مع Phase 2/3 الحقيقية أدناه.
- **بنية مشتركة يُعاد استخدامها في كل صفحة محمية جديدة (لا تخترع نمطًا موازيًا):**
  - `src/components/AppHeader.tsx` — Nav + Sign out.
  - `src/hooks/use-session.ts` — `useSession`/`useRequireSession` (نمط SSR-آمن لقراءة الجلسة).
  - نمط الصفحة القياسي: `useRequireSession()` → `if (!session) return null` → استخراج `actorUserId`/`tenantId` كمتغيرات منفصلة (تفادي مشكلة TS closure narrowing) → `<AppHeader session={session} />` + محتوى الصفحة.
- **Migrations:** `0001_foundation.sql` (tenants/tenant_settings/users/roles/permissions/role_permissions/user_roles/audit_logs) + `0002_customers_products.sql` (customers بـcredit_limit، products) — كلاهما بـRLS كاملة جاهزة، غير مُطبَّقين بعد.

### التالي مباشرة (بالترتيب — راجع خطة التنفيذ الكاملة أدناه لكل Phase بالتفصيل)

**Phase 2 — Products & Inventory (تكملة)** ← نحن هنا الآن.

## خطة التنفيذ الكاملة (كل الـPhases 1→9 — المرجع الوحيد الدائم، الجلسة دي ممكن تنقطع فالملف ده اللي بيرجّعك بالظبط لمطرح ما وقفت)

الترتيب مطابق لـ§131 في الـSpec. كل Phase فرعية = تعديل محدد → build/lint/tsc نظيفين → اختبار Playwright فعلي → لقطة شاشة لو فيها قيمة بصرية → تحديث قسم "الحالة الحالية" أعلاه → commit محدد + push. **مفيش وقفات للسؤال إلا عند Blocker حقيقي** (قرار مالي حساس الـSpec نفسها تقول "يحتاج تأكيد" — يتسجل كإعداد قابل للتفعيل بدل ما يُخترع).

**Phase 2 — Products & Inventory (تكملة فوق `/products`):**
Categories/Brands كـcollections بسيطة قابلة للإضافة (مش full entities) · Serial Number lifecycle فعلي (§21: Available→Sold→...، منع بيع نفس السيريال مرتين) · `inventory_movements` ledger فعلي (§29: أي تغيير كمية = Movement، الكمية = مجموع الـMovements) · شاشة Stock Count مبسطة (§30).

**Phase 3 — Customers & Sales (تكملة فوق `/customers`):**
Guarantors (§15) مرتبطين بعميل · Customer 360 مبسّطة `/customers/$id` (§14) · **POS/بيع نقدي فعلي** `/sales/new` (§32,§34: عميل→منتج/سيريال→خصم بحد الموظف→تأكيد→Sale+Inventory Movement+Audit+إيصال INV-YYYY-NNNNNN) · State machine مبسّطة (confirmed→completed للبيع النقدي، التوصيل/التركيب منفصلين في Phase 7).

**Phase 4 — Installments (الأعقد، أهم فيتشر):**
`/settings/installment-plans` · محرك تمويل كدالة نقية مُختبرة (`Finance = Principal × Rate`, Acceptance Test: 15,000@40%/12شهر=21,000/1,750×12) · بيع تقسيط فعلي `/sales/new-installment` (§35: Credit Check `Available Credit = credit_limit - exposure`→Snapshot النسبة وقت الإنشاء، **تغيير الخطة لاحقًا لا يمس عقودًا قديمة أبدًا**) · `/contracts/$id` · Collections Workbench `/collections` (§52، Oldest-Due-First) · Overdue/Credit Hold تلقائي · Promise to Pay · Early Settlement/Restructuring (Event جديد بدون حذف الجدول الأصلي).

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
