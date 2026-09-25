# الهوية البصرية - حسبة HESBA

**الالوان (src/styles.css :root):**
- ذهبي #D4AA17 --primary
- كحلي #1B2A41 --sidebar
- تركواز #16A3B0 --secondary/--ring
- كريمي #F3EFE7 --background
- اسود #111417 --foreground
لا ترجع لـ oklch الرمادي القديم.

**الشعار:** src/components/Logo.tsx (Logo + LogoIcon) - SVG كود، مش صورة. مستخدم في /, /login, /platform/login, AppSidebar

**القوائم:** شريط جانبي رأسي يمين src/components/AppSidebar.tsx - 20 عنصر في 8 اقسام (الرئيسية/المبيعات والعملاء/التقسيط والتحصيل/المخزون/المشتريات والموردون/المالية/ما بعد البيع/الادارة) + lucide-react. الحاوية: flex min-h-screen + main flex-1 max-w...

**بوابتا دخول:**
- /login - عملاء (كريمي)، يرفض is_platform_owner
- /platform/login (ملف platform_.login.tsx - لاحظ _ ) - منصة فقط، يرفض حسابات عادية
- / - صفحة رئيسية بشعار + زرارين

**الخط:** @fontsource - Changa (شعار)، Cairo (h1..h4 تلقائي)، Almarai (ارقام)، Tajawal 700/800 (جسم). لا تضف مكتبة جديدة.

**كروت/شارتس:** StatCard/Panel/LinkCard (`src/components/ui/StatCard.tsx`)، LabeledValue
(`src/components/ui/LabeledValue.tsx`، وصف/رقم أفقي بـtone success/danger + icon اختياري)،
و Charts.tsx (recharts بألوان الهوية) — مطبّقين على /dashboard, /platform, /treasury. باقي الصفحات
لسه فيها نمط قديم (`<p>وصف</p><p>رقم</p>` يدوي) يُستحسن توحيده تدريجيًا مش كتلة واحدة.

**جداول كبيرة:** max-h-[26rem] overflow-y-auto + thead sticky top-0 - ثابت لأي جدول جديد.
