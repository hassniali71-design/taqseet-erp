-- رجوع بند 86 (ملف 0035): بيشيل الأدوات المنزلية من القاعدة. تحذير: لو اتعملت أصناف أدوات فعلًا
-- (محل محمد)، الرجوع بيرفض يكمل عشان مايضيعش بيانات — لازم يتقرر الأول هيتعمل فيها إيه.
-- مبيلمسش محل يوسف ولا أي جهاز. آخر سطر لازم يكون COMMIT;
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'kind') THEN
    IF EXISTS (SELECT 1 FROM public.products WHERE kind = 'goods') THEN
      RAISE EXCEPTION 'فيه أصناف أدوات متسجّلة — الرجوع وقف عشان مايضيعش بيانات';
    END IF;
  END IF;
END $$;
DROP FUNCTION IF EXISTS public.create_goods_products(jsonb);
DROP TABLE IF EXISTS public.product_units;
DROP TRIGGER IF EXISTS products_kind_guard ON public.products;
DROP FUNCTION IF EXISTS public.products_kind_guard();
DROP INDEX IF EXISTS public.idx_products_tenant_kind;
DROP INDEX IF EXISTS public.idx_products_tenant_barcode;
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_kind_check;
ALTER TABLE public.products DROP COLUMN IF EXISTS barcode;
ALTER TABLE public.products DROP COLUMN IF EXISTS kind;
ALTER TABLE public.tenant_settings DROP COLUMN IF EXISTS goods_cash_markup_pct;
COMMIT;
