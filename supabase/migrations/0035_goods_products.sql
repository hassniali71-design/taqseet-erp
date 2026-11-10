-- =====================================================================
-- حسبة — بند 86: الأدوات المنزلية (TASK-0005 المرحلة 1، الجزء الأول).
-- إضافة بس، وكلها بتشتغل بس في المحل اللي مفتاح «الأدوات المنزلية» (goods_enabled) مفتوح عنده.
-- آخر سطر في الملف لازم يكون  COMMIT;  — لو مش موجود ماتطبقش. لازم ملف 0034 يكون اتطبّق قبله.
--
-- 1. products.kind: 'device' (جهاز — كل الأصناف القديمة بتفضل كده) أو 'goods' (أدوات منزلية).
--    محل مفتاحه مقفول ميقدرش يعمل صنف 'goods' أصلًا (trigger).
-- 2. products.barcode: اختياري (قرار المالك).
-- 3. product_units: وحدات أكبر للصنف (الدستة = 12 قطعة، الكرتونة = 24...). المخزون دايمًا بأصغر
--    وحدة، والوحدة الأكبر بس بتحوّل وقت الشراء والبيع.
-- 4. create_goods_products(): بتعمل مجموعة أصناف أدوات + وحداتها + الرصيد الافتتاحي (حركة receipt
--    «رصيد افتتاحي») في عملية واحدة — يا كله يا ولا حاجة. أرقام الأصناف من نفس العدّاد (PRD-xxxx).
-- 5. tenant_settings.goods_cash_markup_pct: نسبة الربح المقترحة (سعر الكاش = الشراء + النسبة). 0 = مفيش.
--
-- مفيش أي صنف أو حركة أو بيع موجود بيتغيّر. الرجوع: supabase/rollback/0035_goods_products.UNDO.sql
-- =====================================================================
BEGIN;

-- 0. القاعدة الصح؟ وملف 0034 اتطبّق؟
DO $$
BEGIN
  IF to_regclass('public.products') IS NULL OR to_regclass('public.installment_contracts') IS NULL THEN
    RAISE EXCEPTION 'الملف ده لقاعدة حسبة بس — ماتطبقش على مشروع تاني';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'tenant_settings' AND column_name = 'goods_enabled') THEN
    RAISE EXCEPTION 'لازم ملف 0034 (مفاتيح المحل) يتطبّق الأول';
  END IF;
END $$;

-- 1+2. نوع الصنف والباركود
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'device';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS barcode text;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_kind_check') THEN
    ALTER TABLE public.products ADD CONSTRAINT products_kind_check CHECK (kind IN ('device', 'goods'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_products_tenant_kind ON public.products (tenant_id, kind);
CREATE INDEX IF NOT EXISTS idx_products_tenant_barcode ON public.products (tenant_id, barcode) WHERE barcode IS NOT NULL;

-- محل مفتاح الأدوات عنده مقفول ميقدرش يعمل صنف أدوات (حماية العميل القديم)
CREATE OR REPLACE FUNCTION public.products_kind_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.kind = 'goods' AND (TG_OP = 'INSERT' OR OLD.kind IS DISTINCT FROM NEW.kind)
     AND NOT COALESCE((SELECT goods_enabled FROM public.tenant_settings WHERE tenant_id = NEW.tenant_id), false) THEN
    RAISE EXCEPTION 'الأدوات المنزلية مش مفعّلة للمحل ده';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.products_kind_guard() FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE TRIGGER products_kind_guard BEFORE INSERT OR UPDATE OF kind ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.products_kind_guard();

-- 3. الوحدات
CREATE TABLE IF NOT EXISTS public.product_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name text NOT NULL,
  factor integer NOT NULL CHECK (factor > 1 AND factor <= 10000),
  barcode text,
  cost_price numeric(12,2),
  cash_price numeric(12,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, name)
);
CREATE INDEX IF NOT EXISTS idx_product_units_tenant_updated ON public.product_units (tenant_id, updated_at);
ALTER TABLE public.product_units ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'product_units'
                  AND policyname = 'product_units_isolation') THEN
    CREATE POLICY product_units_isolation ON public.product_units FOR ALL
      USING (tenant_id = public.current_tenant_id()) WITH CHECK (tenant_id = public.current_tenant_id());
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_units TO authenticated;
-- نفس مزامنة الجهاز (0031) والتحديث اللحظي (0028) زي باقي الجداول، لو موجودين
DO $$
BEGIN
  IF to_regprocedure('public.sync_touch_updated_at()') IS NOT NULL THEN
    CREATE OR REPLACE TRIGGER sync_touch BEFORE UPDATE ON public.product_units
      FOR EACH ROW EXECUTE FUNCTION public.sync_touch_updated_at();
    CREATE OR REPLACE TRIGGER sync_log_delete AFTER DELETE ON public.product_units
      FOR EACH ROW EXECUTE FUNCTION public.sync_log_delete();
  END IF;
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime'
                      AND schemaname = 'public' AND tablename = 'product_units') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.product_units;
  END IF;
END $$;

-- 5. نسبة الربح المقترحة للأدوات
ALTER TABLE public.tenant_settings ADD COLUMN IF NOT EXISTS goods_cash_markup_pct numeric(6,2) NOT NULL DEFAULT 0;

-- 4. إنشاء مجموعة أصناف أدوات في عملية واحدة
-- p_items: [{ name, category?, unit, barcode?, cost_price, cash_price, min_stock?, opening_qty?,
--             units?: [{ name, factor, cost_price?, cash_price? }] }]
-- الأسعار والكميات هنا بالوحدة الأساسية (القطعة)؛ الشاشة هي اللي بتحوّل من الدستة.
CREATE OR REPLACE FUNCTION public.create_goods_products(p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public' AS $$
DECLARE
  v_tenant uuid := public.current_tenant_id();
  v_user uuid := (SELECT id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1);
  v_item jsonb; v_unit jsonb; v_product public.products; v_out jsonb := '[]'::jsonb;
  v_qty int; v_name text;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'لا توجد جلسة نشطة'; END IF;
  IF NOT COALESCE((SELECT goods_enabled FROM public.tenant_settings WHERE tenant_id = v_tenant), false) THEN
    RAISE EXCEPTION 'الأدوات المنزلية مش مفعّلة للمحل ده';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'مفيش أصناف';
  END IF;
  IF jsonb_array_length(p_items) > 500 THEN RAISE EXCEPTION 'أقصى حاجة 500 صنف مرة واحدة'; END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_name := btrim(COALESCE(v_item->>'name', ''));
    IF v_name = '' THEN RAISE EXCEPTION 'فيه صنف من غير اسم'; END IF;
    IF COALESCE((v_item->>'cash_price')::numeric, 0) <= 0 THEN
      RAISE EXCEPTION 'سعر البيع لـ«%» لازم يكون أكبر من صفر', v_name;
    END IF;
    v_qty := COALESCE((v_item->>'opening_qty')::int, 0);
    IF v_qty < 0 THEN RAISE EXCEPTION 'الكمية لـ«%» مينفعش تبقى بالسالب', v_name; END IF;

    INSERT INTO public.products (tenant_id, code, name, category, unit, barcode, cost_price, cash_price,
                                 installment_price, min_stock, max_stock, serial_required, active, kind)
    VALUES (v_tenant,
            'PRD-' || lpad(public.next_tenant_code_counter(v_tenant, 'products')::text, 4, '0'),
            v_name, NULLIF(btrim(COALESCE(v_item->>'category', '')), ''),
            COALESCE(NULLIF(btrim(v_item->>'unit'), ''), 'قطعة'),
            NULLIF(btrim(COALESCE(v_item->>'barcode', '')), ''),
            COALESCE((v_item->>'cost_price')::numeric, 0), (v_item->>'cash_price')::numeric,
            (v_item->>'cash_price')::numeric,
            GREATEST(COALESCE((v_item->>'min_stock')::int, 0), 0), 0, false, true, 'goods')
    RETURNING * INTO v_product;

    FOR v_unit IN SELECT * FROM jsonb_array_elements(COALESCE(v_item->'units', '[]'::jsonb)) LOOP
      INSERT INTO public.product_units (tenant_id, product_id, name, factor, cost_price, cash_price)
      VALUES (v_tenant, v_product.id, btrim(v_unit->>'name'), (v_unit->>'factor')::int,
              (v_unit->>'cost_price')::numeric, (v_unit->>'cash_price')::numeric);
    END LOOP;

    IF v_qty > 0 THEN
      INSERT INTO public.inventory_movements (tenant_id, product_id, type, quantity, before, after, user_id, reference, reason)
      VALUES (v_tenant, v_product.id, 'receipt', v_qty, 0, v_qty, v_user, 'رصيد افتتاحي', 'رصيد افتتاحي');
    END IF;

    v_out := v_out || to_jsonb(v_product);
  END LOOP;

  INSERT INTO public.audit_logs (tenant_id, user_id, action, entity, entity_id, new_value)
  VALUES (v_tenant, v_user, 'product.create_goods_batch', 'products', NULL,
          jsonb_build_object('count', jsonb_array_length(v_out)));
  RETURN v_out;
END $$;
REVOKE ALL ON FUNCTION public.create_goods_products(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_goods_products(jsonb) TO authenticated;

COMMIT;
