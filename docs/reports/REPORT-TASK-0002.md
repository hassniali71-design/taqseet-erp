# REPORT — TASK-0002: فحص يمنع وصول الأسرار لكود المتصفح

```text
TASK:              TASK-0002 — Pre-deploy secret guard (follow-up to Baseline C1)
STATUS:            Completed (not deployed — no runtime change; takes effect on next build/deploy)
DATE:              2026-10-09
BRANCH / COMMIT:   claude/quirky-shannon-3fv54p · not committed

SUMMARY:
سكربت جديد بيشتغل تلقائيًا بعد كل build. لو لقى أي سر سيرفر رايح للمتصفح، الـbuild بيفشل،
و`bun run deploy` (= build && nitro deploy) بيقف قبل النشر. السكربت لا يطبع أي قيمة سرية.

FILES CHANGED:
- package.json — postbuild: أُضيف `&& bun run scripts/check-no-secrets-in-bundle.ts`
- .env.example — سطر تحذير إن الـbuild هيفشل لو اتحط VITE_ على المفتاح السري
- docs/03-STATE.md — بند 68

FILES CREATED:
- scripts/check-no-secrets-in-bundle.ts
- docs/tasks/TASK-0002-pre-deploy-secret-guard.md
- docs/reports/REPORT-TASK-0002.md

FILES DELETED:
- لا شيء

DATABASE CHANGES:   لا يوجد
API CHANGES:        لا يوجد
src/ CHANGES:       لا يوجد

TESTS:
- Build نظيف → الفحص OK (65 ملف client) ✅
- A: متغير VITE_FAKE_SECRET_KEY → فشل ✅
- B: sb_secret_ وهمي في ملف client → فشل ✅
- C: JWT وهمي بدور service_role → فشل ✅
- C2: JWT وهمي بدور anon → يعدي (مفيش إنذار كاذب) ✅
- D: قيمة متغير سيرفر سري وهمي داخل client → فشل ✅
- في كل الحالات: القيمة لم تُطبع (0 ظهور في المخرجات) ✅
- End-to-end: `bun run build` مع متغير VITE_ سري وهمي → exit 1 ✅، ثم build نظيف → exit 0 ✅
- كل القيم المستخدمة في الاختبار وهمية؛ ملفات الاختبار اتمسحت.

BUILD:
bun run build → Passed · bun run lint → Passed (بعد إصلاح تنسيق سطر واحد في السكربت) · tsc --noEmit → Passed

DEPLOYMENT:
لا يوجد. الفحص بيشتغل محليًا وقت الـbuild؛ Production الحالي (Version 6b2c8bb5) لم يتغير.

KNOWN ISSUES:
- لو الـbuild اتعمل في بيئة تانية (Lovable مثلًا) بمخرجات في مكان غير `.output/public` أو `dist/client`،
  الفحص بيطبع "skipping bundle scan" ومش بيفشل — فحص أسماء الـVITE_ بيشتغل برضه.
- الفحص بيشوف متغيرات البيئة المحمّلة وقت تشغيله (`.env` عبر bun + بيئة النظام).

NEXT ACTION:
- Commit للتعديلات (TASK-0001 + TASK-0002 + Baseline) — بانتظار المالك.
- قرار الـbranch (`claude/quirky-shannon-3fv54p` → `main`؟).

NOTES:
- السكربت متبع نفس أسلوب `scripts/fix-cloudflare-chunks.ts` (تعليق يشرح السبب + node:fs + خروج بكود).
```
