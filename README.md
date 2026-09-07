# تقسيط — ERP SaaS لمحلات الأجهزة الكهربائية

نظام ERP SaaS متعدد المستأجرين (Multi-Tenant) لمحلات بيع الأجهزة الكهربائية والمنزلية في مصر، محوره البيع بالتقسيط: التزامات ائتمانية، محرك تمويل، تحصيل، مخزون بسيريالات، مشتريات وموردين، خزينة ومحاسبة، وSaaS Control Center لإدارة المحلات المشتركة.

واجهة عربية RTL بالكامل.

## المرجع الكامل

- [`docs/ERP_SaaS_Requirements.md`](docs/ERP_SaaS_Requirements.md) — المواصفة التقنية والتجارية الكاملة (134 قسم)، المرجع الملزم الوحيد.
- [`CLAUDE.md`](CLAUDE.md) — سياق العمل والحالة الحالية لأي جلسة تطوير قادمة.

## الستاك

TanStack Start · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui · TanStack Query/Router · Vite · Bun · Cloudflare Workers · Supabase (Auth/Postgres/RLS/Storage) · Zod.

## التشغيل

```bash
bun i
bun run dev
```

افتح `http://localhost:8080` — لو مفيش جلسة نشطة هتتوجه تلقائيًا لصفحة `/login`.

### بيانات الدخول التجريبية (Mock)

```
owner@demo.local / owner123
```

⚠️ هذه بيانات Mock بحتة (تخزين محلي في `localStorage`، بدون تشفير وبدون Supabase Auth حقيقي) لأغراض التجربة المحلية فقط — راجع `CLAUDE.md` قبل الاعتماد عليها في أي شيء إنتاجي.

## الشاشات المتاحة الآن

- `/login` → `/dashboard` — دخول Mock (بيانات تجريبية أعلاه).
- `/customers` — قائمة عملاء + إضافة/تعديل (بدون حذف — إيقاف/تفعيل فقط).
- `/products` — قائمة أجهزة/منتجات + إضافة/تعديل (بدون حذف — إيقاف/تفعيل فقط).

## الحالة

**Phase 0 — تأسيس + شريحة تجريبية من Customers/Products.** سكافولد تقني كامل + تدفق دخول وهمي + شاشات عملاء وأجهزة مبسّطة (subset من §14/§19 في الـSpec، وليست Phase 2/3 كاملة — لا سيريالات فعلية، لا Categories/Brands ككيانات، لا Guarantors/Credit Profile). قاعدة البيانات الحالية Mock مؤقت (`localStorage`) ريثما تتوفر بيانات اتصال Supabase حقيقية. راجع `CLAUDE.md` للتفاصيل والخطوة التالية.
