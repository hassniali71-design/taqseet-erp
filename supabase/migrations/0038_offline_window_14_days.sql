-- =====================================================================
-- حسبة — بند 97: العمليات اللي اتعملت من غير نت تفضل مقبولة 14 يوم بدل 3 أيام.
-- (النت في مصر ممكن يقطع أيام — قرار المالك.) 14 يوم = نفس مدة الدخول من غير نت على الجهاز.
-- آخر سطر في الملف لازم يكون  COMMIT;  — لو مش موجود ماتطبقش. لازم ملف 0032 يكون اتطبّق قبله.
--
-- بيغيّر دالة واحدة بس: offline_operation_time (المدة والرسالة). مفيش أي جدول ولا عقد ولا تحصيل
-- بيتغيّر. الرجوع: supabase/rollback/0038_offline_window_14_days.UNDO.sql (يرجّعها 3 أيام).
-- =====================================================================
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.installment_contracts') IS NULL THEN
    RAISE EXCEPTION 'الملف ده لقاعدة حسبة بس — ماتطبقش على مشروع تاني';
  END IF;
  IF to_regprocedure('public.offline_operation_time(timestamptz)') IS NULL THEN
    RAISE EXCEPTION 'لازم ملف 0032 (العمليات من غير نت) يتطبّق الأول';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.offline_operation_time(p_at timestamptz)
RETURNS timestamptz LANGUAGE plpgsql STABLE SET search_path = public AS $$
BEGIN
  IF p_at IS NULL THEN
    RETURN now();
  END IF;
  IF p_at < now() - interval '14 days' THEN
    RAISE EXCEPTION 'العملية دي اتعملت من غير نت من أكتر من 14 يوم — اعملها تاني دلوقتي';
  END IF;
  RETURN least(p_at, now());
END;
$$;
REVOKE ALL ON FUNCTION public.offline_operation_time(timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.offline_operation_time(timestamptz) TO authenticated;

COMMIT;
