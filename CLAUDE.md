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

## الحالة الحالية (حدّث هذا القسم بعد كل Phase)

- **Phase 0 (تأسيس) — منفّذة جزئيًا:** سكافولد تقني كامل (نفس بنية مشروع شقيق يستخدم نفس الستاك)، بدون أي منطق تجاري بعد.
- **إضافة: تدفق دخول Mock للتجربة المحلية** (`src/routes/login.tsx` + `src/routes/dashboard.tsx` + `signIn`/`getSession`/`signOut` في `data-store.ts`). بيانات تجريبية: `owner@demo.local` / `owner123`. **هذا ليس Supabase Auth ولن يصبح كذلك** — Phase 1 الحقيقية ستستبدله بالكامل (Supabase Auth + JWT + RLS)، وهذه الشاشة موجودة فقط عشان يبقى فيه حاجة "تتفتح" أثناء التطوير المحلي قبل ربط Supabase.
- **قاعدة البيانات: Mock مؤقت فقط.** لا يوجد اتصال Supabase حقيقي حتى الآن — بانتظار بيانات اعتماد المستخدم (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` في `.env`، انظر `.env.example`). كل ما هو مبني الآن مصمَّم عمدًا ليكون **drop-in replaceable**: نفس أسماء الجداول/الحقول المستخدمة في `docs/ERP_SaaS_Requirements.md §118` تُستخدم في المخزن الوهمي، ونفس التوقيعات ستُستخدم عند الاتصال بـSupabase الحقيقي.
- **⚠️ تنبيه صريح لأي جلسة قادمة:** طالما البيانات Mock، لا تعتبر أي Phase "منتهية" أو "جاهزة للإنتاج" بمعايير §134 (Definition of Done) — RLS الحقيقية وTenant isolation الحقيقي شرطان أساسيان غير قابلين للتفاوض (§133) ولا يتحققان إلا بعد ربط Supabase فعليًا وتفعيل RLS policies من `supabase/migrations/`.
- طبقة البيانات المركزية: `src/lib/data-store.ts` (localStorage + subscribe/emit، نمط ثابت — لا تخترع نمطًا موازيًا).
- Migration SQL أولية جاهزة (غير مُطبَّقة بعد) في `supabase/migrations/` تغطي: tenants, tenant_settings, users, roles, permissions, role_permissions, user_roles, audit_logs.

## ترتيب العمل (§131 في المواصفة — التزم به بالحرف)

Phase 1 Foundation (Auth/Tenant/RLS/Roles/Permissions/Audit/Settings) ← **التالي** → Phase 2 Products & Inventory → Phase 3 Customers & Sales → Phase 4 Installments (الأعقد، محرك التمويل) → Phase 5 Purchasing → Phase 6 Finance/Accounting → Phase 7 After Sales → Phase 8 Reports & Notifications → Phase 9 SaaS Control Center.

لا تبني أي Phase فوق Phase سابقة غير مكتملة أو غير مُختبرة. كل تعديل = مهمة هندسية واحدة محددة، تشغيل `bun run dev`/`build`، commit واضح، ثم الانتقال للتالي.

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
