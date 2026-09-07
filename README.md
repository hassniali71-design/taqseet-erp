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

## الحالة

**Phase 0 — تأسيس.** سكافولد تقني فقط، بدون منطق تجاري بعد. قاعدة البيانات الحالية Mock مؤقت (`localStorage`) ريثما تتوفر بيانات اتصال Supabase حقيقية. راجع `CLAUDE.md` للتفاصيل والخطوة التالية.
