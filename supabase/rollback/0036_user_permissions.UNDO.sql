-- رجوع بند 87 (ملف 0036): بيشيل صلاحيات الموظفين وحمايتها.
-- تحذير: بعد الرجوع أي موظف هيشوف كل حاجة زي الأول — عشان كده الملف بيرفض يكمّل لو فيه موظف شغال
-- بصلاحيات محددة؛ وقّفه الأول من صفحة المستخدمين. آخر سطر لازم يكون COMMIT;
BEGIN;
DO $$
DECLARE v_busy boolean;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'permissions') THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.users WHERE permissions IS NOT NULL AND active)' INTO v_busy;
    IF v_busy THEN
      RAISE EXCEPTION 'فيه موظفين شغالين بصلاحيات محددة — وقّفهم الأول وبعدين ارجع';
    END IF;
  END IF;
END $$;
DROP TRIGGER IF EXISTS user_roles_permissions_guard ON public.user_roles;
DROP FUNCTION IF EXISTS public.user_roles_permissions_guard();
DROP TRIGGER IF EXISTS users_permissions_guard ON public.users;
DROP FUNCTION IF EXISTS public.users_permissions_guard();
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_permissions_shape_check;
ALTER TABLE public.users DROP COLUMN IF EXISTS permissions;
COMMIT;
