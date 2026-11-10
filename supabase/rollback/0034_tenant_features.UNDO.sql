-- رجوع بند 85 (ملف 0034): بيشيل مفاتيح مميزات المحل. كل المحلات بترجع للسلوك القديم (اللي هو أصلًا
-- القيمة الافتراضية). مبيلمسش أي عقد أو تحصيل أو بيع. آخر سطر لازم يكون COMMIT;
BEGIN;
DROP TRIGGER IF EXISTS tenant_settings_features_guard ON public.tenant_settings;
DROP FUNCTION IF EXISTS public.tenant_features_guard();
ALTER TABLE public.tenant_settings DROP CONSTRAINT IF EXISTS tenant_settings_partners_mode_check;
ALTER TABLE public.tenant_settings DROP COLUMN IF EXISTS deferred_cash_enabled;
ALTER TABLE public.tenant_settings DROP COLUMN IF EXISTS customer_accounts_enabled;
ALTER TABLE public.tenant_settings DROP COLUMN IF EXISTS partners_mode;
ALTER TABLE public.tenant_settings DROP COLUMN IF EXISTS goods_enabled;
COMMIT;
