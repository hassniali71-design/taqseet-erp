# قواعد عمل عامة + Routing

- لا تغير الستاك الاساسي بدون سبب قوي وموافقة صريحة.
- لا تخترع Business Rules غير مذكورة في Spec - عند الشك، استخدم اعداد قابل للتعديل او علم القرار كـ "يحتاج تأكيد".
- حافظ على RTL/العربي في كل مكان (dir="rtl" و lang="ar" في src/routes/__root.tsx).
- لا تكسر bun run dev/build بعد اي تعديل.
- Commits صغيرة ومتكررة بوصف واضح - لا commit ضخم يجمع عدة Phases.
- لا تضف مكتبات جديدة بدون داعي واضح.
- عند الشك في نمط State مشترك، اتبع نمط src/lib/data-store.ts الموجود - لا تخترع نمطا موازيا.

**⚠ ملاحظة راوتنج مهمة:**
لو عندك foo.tsx ومحتاج /foo/$id، لازم تسمي الملف foo_.$id.tsx (شرطة تحتية _ قبل النقطة) - مش foo.$id.tsx. من غيرها TanStack Router بيعتبر foo.tsx Layout ضمني للـ$id (لازم <Outlet/> فيه)، فالـURL يتغير بس المحتوى يفضل صفحة القائمة.
طبق على /customers/$id, /contracts/$id, /suppliers/$id, /products/$id

**ملفات الراوتنج الخاصة:**
- platform_.login.tsx
- platform_.support.$tenantId.tsx
- products_.$id.tsx, customers_.$id.tsx, contracts_.$id.tsx, suppliers_.$id.tsx
