-- رجوع بند 97 (ملف 0038): العمليات من غير نت ترجع مقبولة 3 أيام بس (زي ملف 0032 بالظبط).
-- آخر سطر لازم يكون COMMIT;
BEGIN;
CREATE OR REPLACE FUNCTION public.offline_operation_time(p_at timestamptz)
RETURNS timestamptz LANGUAGE plpgsql STABLE SET search_path = public AS $$
BEGIN
  IF p_at IS NULL THEN
    RETURN now();
  END IF;
  IF p_at < now() - interval '72 hours' THEN
    RAISE EXCEPTION 'العملية دي اتعملت من غير نت من أكتر من 3 أيام — اعملها تاني دلوقتي';
  END IF;
  RETURN least(p_at, now());
END;
$$;
REVOKE ALL ON FUNCTION public.offline_operation_time(timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.offline_operation_time(timestamptz) TO authenticated;
COMMIT;
