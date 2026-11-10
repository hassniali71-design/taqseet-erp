-- =====================================================================
-- حسبة — بند 87: صلاحيات الموظفين (المالك بيحدد كل موظف يشوف إيه ويعمل إيه).
-- إضافة بس. آخر سطر في الملف لازم يكون  COMMIT;  — لو مش موجود ماتطبقش.
--
-- 1. users.permissions (jsonb):
--      NULL  = صلاحيات كاملة (المالك — وده حال كل الحسابات الموجودة النهارده، فمفيش حد بيتأثر).
--      {"pages": ["customers","collections",...], "edit_delete": false} = موظف بصلاحيات محددة.
-- 2. حماية في القاعدة نفسها: الموظف اللي صلاحياته محددة ميقدرش:
--      - يضيف أو يحذف مستخدم، أو يغيّر صلاحيات/تفعيل أي حد (ولا نفسه).
--      - يغيّر وظايف المستخدمين (user_roles) — عشان ميدّيش نفسه «مالك».
--    صاحب الصلاحيات الكاملة ميقدرش يقلّل صلاحيات حسابه هو (عشان ميقفلش على نفسه بالغلط).
--    السيرفر (service role) وصاحب المنصة مسموح لهم زي النهارده.
--
-- مفيش أي مستخدم أو بيع أو تحصيل موجود بيتغيّر. الرجوع: supabase/rollback/0036_user_permissions.UNDO.sql
-- =====================================================================
BEGIN;

-- 0. القاعدة الصح؟
DO $$
BEGIN
  IF to_regclass('public.users') IS NULL OR to_regclass('public.installment_contracts') IS NULL
     OR to_regclass('public.user_roles') IS NULL THEN
    RAISE EXCEPTION 'الملف ده لقاعدة حسبة بس — ماتطبقش على مشروع تاني';
  END IF;
END $$;

-- 1. العمود
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS permissions jsonb;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_permissions_shape_check') THEN
    ALTER TABLE public.users ADD CONSTRAINT users_permissions_shape_check
      CHECK (permissions IS NULL OR jsonb_typeof(permissions) = 'object');
  END IF;
END $$;

-- 2. حماية جدول المستخدمين
CREATE OR REPLACE FUNCTION public.users_permissions_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_caller public.users;
BEGIN
  IF auth.uid() IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;  -- السيرفر / الملفات
  SELECT * INTO v_caller FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1;
  IF v_caller.id IS NULL OR COALESCE(v_caller.is_platform_owner, false) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF v_caller.permissions IS NULL THEN
    -- صلاحيات كاملة: مسموح، بس ميقلّلش صلاحيات نفسه ولا يوقف نفسه
    IF TG_OP = 'UPDATE' AND NEW.id = v_caller.id
       AND (NEW.permissions IS NOT NULL OR NOT COALESCE(NEW.active, true)) THEN
      RAISE EXCEPTION 'مينفعش تقلّل صلاحيات حسابك إنت أو توقفه';
    END IF;
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- موظف بصلاحيات محددة
  IF TG_OP IN ('INSERT', 'DELETE') THEN
    RAISE EXCEPTION 'إضافة وحذف المستخدمين للمالك بس';
  END IF;
  IF NEW.permissions IS DISTINCT FROM OLD.permissions
     OR NEW.active IS DISTINCT FROM OLD.active
     OR NEW.is_platform_owner IS DISTINCT FROM OLD.is_platform_owner
     OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'تغيير الصلاحيات للمالك بس';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.users_permissions_guard() FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE TRIGGER users_permissions_guard BEFORE INSERT OR UPDATE OR DELETE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.users_permissions_guard();

-- 3. حماية وظايف المستخدمين
CREATE OR REPLACE FUNCTION public.user_roles_permissions_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  IF EXISTS (SELECT 1 FROM public.users
              WHERE auth_user_id = auth.uid() AND permissions IS NOT NULL
                AND NOT COALESCE(is_platform_owner, false)) THEN
    RAISE EXCEPTION 'تغيير الوظايف للمالك بس';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
REVOKE ALL ON FUNCTION public.user_roles_permissions_guard() FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE TRIGGER user_roles_permissions_guard BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.user_roles_permissions_guard();

COMMIT;
