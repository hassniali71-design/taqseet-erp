# الحالة الحالية - المرجع الوحيد "وصلنا لفين"

**قاعدة عامة:** كل شيء عدا تسجيل الدخول لسه Mock data-store (src/lib/data-store.ts - localStorage + subscribe/emit). الجداول/الحقول مطابقة لـ §118 و supabase/migrations/*.sql - الانتقال drop-in replacement.

**تحذير:** طالما البيانات Mock، لا Phase "جاهزة للانتاج" بمعايير §134 - RLS الحقيقي لا يتحقق الا بعد ربط باقي data-store.ts.

**✅ تسجيل الدخول بقى Supabase Auth حقيقي**
- supabase.auth.signInWithPassword / signOut في src/lib/supabase-client.ts (anon key فقط)
- جسر متعمد: بعد النجاح يجيب tenant_id/is_platform_owner من صف users الحقيقي عبر auth_user_id ويكتبه لنفس localStorage Session القديمة - getSession() و 28 route بـ useSession ما اتغيروش.
- DEMO_TENANT_ID / PLATFORM_TENANT_ID اتغيروا من نصوص عشوائية لنفس UUIDs الحقيقية المزروعة في DB (migration 0010 + INSERT يدوي)

**لسه ناقص عمدا:**
- باقي data-store.ts (عملاء/منتجات/...) Mock
- getSession() لسه localStorage فقط
- provisionTenant() لسه Mock
- لا تدعي اكتمال ربط Supabase

**بيانات دخول تجريبية:** owner@demo.local / owner123 و platform@hesba.local / hesba123 - حسابات حقيقية، لازم تتغير قبل التسليم.
