# اقرا ده بس أول كل جلسة (20 سطر)

**taqseet-erp**: ERP SaaS متعدد المستأجرين للبيع بالتقسيط (مصر)، عربي RTL بالكامل.
Stack: TanStack Start + React 19 + Tailwind v4 + Bun + Cloudflare Workers + **Supabase حقيقي** (مش Mock).

**قوانين القراءة (توفير):**
- متقراش أي ملف تاني من `docs/` غير اللي هقولك عليه بـ `@docs/NN-NAME.md` صراحة.
- استثناء دائم: اقرا `docs/03-STATE.md` مع أي طلب تعديل كود (فيه الحالة الحقيقية الآن).
- متقراش `node_modules/` أو `.output/` أبدًا.

**خريطة الملفات المرجعية** (`@` عليها وقت الحاجة بس):
`docs/01-BRIEF.md` فكرة المشروع · `docs/02-STACK.md` أوامر التشغيل · `docs/03-STATE.md` الحالة الحقيقية دلوقتي · `docs/04-BRAND.md` الهوية البصرية · `docs/05-IMPLEMENTED.md` جرد الفيتشرز المنفذة فعليًا · `docs/06-PLAN.md` الباقي/المؤجَّل بقرار واعٍ · `docs/07-RULES.md` قواعد حوكمة صارمة · `docs/08-FINANCE.md` معادلة محرك التقسيط · `docs/09-WORKFLOW.md` قواعد عمل + Routing gotcha.

**خريطة سريعة:** `/src/routes` = الصفحات (TanStack Router file-based، مش `/src/app`) · `/src/lib/supabase-queries.ts` = طبقة البيانات الحقيقية (مش `data-store.ts` القديم) · `/supabase/migrations/*.sql` = الـSchema (مش `schema.sql`).

**بعد كل تعديل:** حدّث `docs/03-STATE.md` بسطر واحد (رقم بند جديد + إيه اللي اتغيّر).

`bun run build`/`lint` لازم يفضلوا نظيفين بعد أي تعديل.
