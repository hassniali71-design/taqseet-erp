-- =====================================================================
-- حسبة — بند 85: «مفاتيح» مميزات المحل (TASK-0005 المرحلة 0).
-- إضافة بس: 4 أعمدة جديدة في tenant_settings، قيمتها الافتراضية = السلوك القديم بالظبط.
-- كل المحلات الموجودة (ومنها محل يوسف) بتاخد القيم الافتراضية، فمفيش أي حاجة بتتغيّر عندهم.
-- آخر سطر في الملف لازم يكون  COMMIT;  — لو مش موجود ماتطبقش.
--
--   goods_enabled               false       ← الأدوات المنزلية والوحدات والإدخال السريع (المرحلة 1)
--   partners_mode               'per_deal'  ← الشركاء: صفقة صفقة (زي النهارده) أو 'capital_pool' رأس مال واحد
--   customer_accounts_enabled   false       ← الحساب الجاري / حساب العروسة (المرحلة 3)
--   deferred_cash_enabled       false       ← «نص دلوقتي والباقي في ميعاد» (المرحلة 4)
--
-- مين يفتحها؟ صاحب المنصة بس (قرار المالك 10/11/2026). trigger بيرفض أي تغيير في الأعمدة دي
-- من حساب محل عادي (حتى المالك)، فمحدش يفتحها بالغلط عند العميل القديم. صفحة المنصة بتغيّرها من
-- السيرفر (service role) وبيتسجّل في سجل التدقيق.
-- الرجوع: supabase/rollback/0034_tenant_features.UNDO.sql
-- =====================================================================
BEGIN;

-- 0. القاعدة الصح؟
DO $$
BEGIN
  IF to_regclass('public.tenant_settings') IS NULL OR to_regclass('public.installment_contracts') IS NULL THEN
    RAISE EXCEPTION 'الملف ده لقاعدة حسبة بس — ماتطبقش على مشروع تاني';
  END IF;
END $$;

ALTER TABLE public.tenant_settings ADD COLUMN IF NOT EXISTS goods_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.tenant_settings ADD COLUMN IF NOT EXISTS partners_mode text NOT NULL DEFAULT 'per_deal';
ALTER TABLE public.tenant_settings ADD COLUMN IF NOT EXISTS customer_accounts_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.tenant_settings ADD COLUMN IF NOT EXISTS deferred_cash_enabled boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_settings_partners_mode_check') THEN
    ALTER TABLE public.tenant_settings
      ADD CONSTRAINT tenant_settings_partners_mode_check CHECK (partners_mode IN ('per_deal', 'capital_pool'));
  END IF;
END $$;

-- الحماية: المفاتيح بيغيّرها صاحب المنصة (أو السيرفر بمفتاح الخدمة) بس.
CREATE OR REPLACE FUNCTION public.tenant_features_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RETURN NEW; END IF;  -- السيرفر (service role) أو تشغيل من القاعدة نفسها
  IF EXISTS (SELECT 1 FROM public.users WHERE auth_user_id = _uid AND is_platform_owner) THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.goods_enabled OR NEW.partners_mode <> 'per_deal' OR NEW.customer_accounts_enabled
       OR NEW.deferred_cash_enabled THEN
      RAISE EXCEPTION 'مميزات المحل بيفتحها صاحب المنصة بس';
    END IF;
  ELSIF NEW.goods_enabled IS DISTINCT FROM OLD.goods_enabled
     OR NEW.partners_mode IS DISTINCT FROM OLD.partners_mode
     OR NEW.customer_accounts_enabled IS DISTINCT FROM OLD.customer_accounts_enabled
     OR NEW.deferred_cash_enabled IS DISTINCT FROM OLD.deferred_cash_enabled THEN
    RAISE EXCEPTION 'مميزات المحل بيفتحها صاحب المنصة بس';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.tenant_features_guard() FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE TRIGGER tenant_settings_features_guard BEFORE INSERT OR UPDATE ON public.tenant_settings
  FOR EACH ROW EXECUTE FUNCTION public.tenant_features_guard();

COMMIT;
