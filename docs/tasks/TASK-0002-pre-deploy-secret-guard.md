# TASK-0002 — فحص يمنع وصول أي مفتاح سري لكود المتصفح

| | |
|---|---|
| **PROJECT** | taqseet-erp |
| **TYPE** | Security / Build tooling |
| **STATUS** | Done |
| **SOURCE** | Baseline C1 + TASK-0001 — طلب المالك 2026-10-09 |
| **CREATED** | 2026-10-09 |

## GOAL
الـbuild يفشل تلقائيًا (وبالتالي `bun run deploy` لا ينشر) لو أي مفتاح سري وصل لكود المتصفح.

## BUSINESS CONTEXT
في C1 وصل مفتاح service-role للمتصفح عبر متغير `VITE_*` في `.env` المحلي، واتنشر على Production بدون ما حد ياخد باله. المفتاح ده بيتخطى RLS ويكشف بيانات كل الـtenants.

## SCOPE
- In: سكربت فحص جديد + تشغيله بعد الـbuild (`postbuild`) + سطر تحذير في `.env.example` + سطر في `docs/03-STATE.md`.
- Out: أي تعديل في `src/`، الـdatabase، الـmigrations، الـdependencies.

## TARGET
- `scripts/check-no-secrets-in-bundle.ts` (جديد)
- `package.json` → `postbuild`
- `.env.example`
- `docs/03-STATE.md`

## CONSTRAINTS
- السكربت **لا يطبع أي قيمة سرية أبدًا** — أسماء متغيرات ومسارات ملفات فقط.
- لا يغيّر سلوك `fix-cloudflare-chunks.ts`.
- لا dependencies جديدة.

## EXPECTED RESULT
1. أي متغير اسمه `VITE_*` وفيه `SERVICE` / `SECRET` / `PRIVATE` → فشل.
2. أي `sb_secret_…` في ملفات المتصفح → فشل.
3. أي JWT دوره `service_role` (المفاتيح القديمة) في ملفات المتصفح → فشل.
4. قيمة أي متغير سيرفر سري (`*SERVICE_ROLE*`, `*SECRET*`, `*AUTH_TOKEN*`) موجودة حرفيًا في ملفات المتصفح → فشل.
5. Build نظيف → يعدي ويطبع سطر نجاح.

## VALIDATION
- [x] `bun run build` نظيف + الفحص يعدي
- [x] `bun run lint` نظيف
- [x] `tsc --noEmit` نظيف
- [x] اختبار سلبي: متغير `VITE_*SECRET*` وهمي → الفحص يفشل
- [x] اختبار سلبي: `sb_secret_` وهمي في ملف client → الفحص يفشل
- [x] اختبار سلبي: JWT وهمي بدور `service_role` → الفحص يفشل
- [x] التأكد أن رسائل الفشل لا تحتوي القيمة

## DONE WHEN
- [x] Validation كلها ✅
- [x] Report: `docs/reports/REPORT-TASK-0002.md`
- [x] `docs/03-STATE.md` محدث بسطر
