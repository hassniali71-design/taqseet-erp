-- =====================================================================
-- حسبة — بند 93: الحساب الجاري / جهاز العروسة (TASK-0005 المرحلة 3).
-- إضافة بس، وكلها بتشتغل بس في المحل اللي مفتاح customer_accounts_enabled مفتوح عنده.
-- آخر سطر في الملف لازم يكون  COMMIT;  — لو مش موجود ماتطبقش. لازم 0034 يكون اتطبّق قبله.
--
-- القيود (وافق عليها المالك):
--   عربون:          الخزينة ↑  /  «عربون عملاء (أمانة)» 2100 ↑   — فلوس العميل عندنا، مش مكسب.
--   بيع من رصيدها:  2100 ↓  /  إيرادات المبيعات 3000 ↑           — الخزينة متتحركش.
--   رد فلوس:        2100 ↓  /  الخزينة ↓
--
-- 1. customer_accounts         حساب واحد لكل عميل (عادي أو عروسة + ميعاد الفرح).
-- 2. customer_account_entries  دفتر (append-only): deposit / use / refund. الرصيد = إيداع − استخدام − رد.
-- 3. reservations              حجز صنف بسعر متثبت؛ بيتشال من «المتاح للبيع» في شاشات المحل ده بس.
-- 4. sale_pickups              تسليم حاجات اتباعت واتسابت في المحل (append-only).
-- 5. treasury_movements.type   + 'customer_deposit' و'customer_refund' (الأنواع القديمة زي ما هي).
-- 6. customer_account_cash()   عربون/رد فلوس: الدفتر + الخزينة في عملية واحدة.
--    customer_account_use()    خصم من الرصيد لبيع اتعمل، بقفل الحساب وتأكيد إن الرصيد يكفي.
--
-- مفيش أي بيع أو عقد أو حركة موجودة بتتغيّر. الرجوع: supabase/rollback/0037_customer_accounts.UNDO.sql
-- =====================================================================
BEGIN;

-- 0. القاعدة الصح؟ وملف 0034 اتطبّق؟
DO $$
BEGIN
  IF to_regclass('public.customers') IS NULL OR to_regclass('public.installment_contracts') IS NULL
     OR to_regclass('public.treasury_movements') IS NULL THEN
    RAISE EXCEPTION 'الملف ده لقاعدة حسبة بس — ماتطبقش على مشروع تاني';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'tenant_settings'
                    AND column_name = 'customer_accounts_enabled') THEN
    RAISE EXCEPTION 'لازم ملف 0034 (مفاتيح المحل) يتطبّق الأول';
  END IF;
END $$;

-- مساعد: المفتاح مفتوح للمحل ده؟
CREATE OR REPLACE FUNCTION public.customer_accounts_on(p_tenant uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE((SELECT customer_accounts_enabled FROM public.tenant_settings WHERE tenant_id = p_tenant), false)
$$;
REVOKE ALL ON FUNCTION public.customer_accounts_on(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.customer_accounts_on(uuid) TO authenticated;

-- 1. الحسابات
CREATE TABLE IF NOT EXISTS public.customer_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  kind text NOT NULL DEFAULT 'general' CHECK (kind IN ('general', 'bride')),
  occasion_date date,
  notes text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, customer_id)
);

-- 2. الدفتر
CREATE TABLE IF NOT EXISTS public.customer_account_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.customer_accounts(id) ON DELETE RESTRICT,
  type text NOT NULL CHECK (type IN ('deposit', 'use', 'refund')),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  held boolean NOT NULL DEFAULT false,
  treasury_account_id uuid REFERENCES public.treasury_accounts(id) ON DELETE SET NULL,
  reason text,
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. الحجوزات
CREATE TABLE IF NOT EXISTS public.reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.customer_accounts(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price numeric(12,2) NOT NULL CHECK (unit_price >= 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'converted', 'cancelled')),
  sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  note text,
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. التسليم
CREATE TABLE IF NOT EXISTS public.sale_pickups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.customer_accounts(id) ON DELETE RESTRICT,
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  received_by text,
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_accounts_tenant_updated ON public.customer_accounts (tenant_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_customer_account_entries_tenant_updated ON public.customer_account_entries (tenant_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_customer_account_entries_account ON public.customer_account_entries (account_id);
CREATE INDEX IF NOT EXISTS idx_reservations_tenant_updated ON public.reservations (tenant_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_reservations_account ON public.reservations (account_id);
CREATE INDEX IF NOT EXISTS idx_sale_pickups_tenant_updated ON public.sale_pickups (tenant_id, updated_at);

-- العزل بين المحلات + المفتاح: محل مفتاحه مقفول ميقدرش يكتب في الجداول دي أصلًا.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['customer_accounts', 'customer_account_entries', 'reservations', 'sale_pickups'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_select') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (tenant_id = public.current_tenant_id())', t || '_select', t);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_insert') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (tenant_id = public.current_tenant_id() AND public.customer_accounts_on(tenant_id))', t || '_insert', t);
    END IF;
    IF t IN ('customer_accounts', 'reservations')
       AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_update') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE USING (tenant_id = public.current_tenant_id()) WITH CHECK (tenant_id = public.current_tenant_id() AND public.customer_accounts_on(tenant_id))', t || '_update', t);
    END IF;
    -- الدفتر والتسليم append-only (زي partner_transactions): مفيش update ولا delete.
    EXECUTE format('GRANT SELECT, INSERT ON public.%I TO authenticated', t);
    IF t IN ('customer_accounts', 'reservations') THEN
      EXECUTE format('GRANT UPDATE ON public.%I TO authenticated', t);
    END IF;
    IF to_regprocedure('public.sync_touch_updated_at()') IS NOT NULL THEN
      EXECUTE format('CREATE OR REPLACE TRIGGER sync_touch BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.sync_touch_updated_at()', t);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
       AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime'
                        AND schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- الحجز بيتلغي أو يتحوّل مرة واحدة بس، ومفيش رجوع لـ«نشط».
CREATE OR REPLACE FUNCTION public.reservations_status_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF OLD.status <> 'active' AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'الحجز ده اتقفل قبل كده';
  END IF;
  IF NEW.product_id IS DISTINCT FROM OLD.product_id OR NEW.quantity IS DISTINCT FROM OLD.quantity
     OR NEW.unit_price IS DISTINCT FROM OLD.unit_price OR NEW.account_id IS DISTINCT FROM OLD.account_id THEN
    RAISE EXCEPTION 'مينفعش تعديل الحجز — الغيه واعمل واحد جديد';
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER reservations_status_guard BEFORE UPDATE ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.reservations_status_guard();

-- 5. نوعين حركة خزينة جداد (كل الأنواع القديمة زي ما هي)
ALTER TABLE public.treasury_movements DROP CONSTRAINT IF EXISTS treasury_movements_type_check;
ALTER TABLE public.treasury_movements ADD CONSTRAINT treasury_movements_type_check
  CHECK (type IN ('opening', 'sale', 'collection', 'purchase_payment', 'expense', 'return', 'exchange',
                  'transfer', 'partner_profit_payout', 'customer_deposit', 'customer_refund'));

-- رصيد الحساب
CREATE OR REPLACE FUNCTION public.customer_account_balance(p_account uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public' AS $$
  SELECT COALESCE(SUM(CASE WHEN type = 'deposit' THEN amount ELSE -amount END), 0)
    FROM public.customer_account_entries WHERE account_id = p_account
$$;
GRANT EXECUTE ON FUNCTION public.customer_account_balance(uuid) TO authenticated;

-- 6أ. عربون / رد فلوس — الدفتر والخزينة مع بعض أو ولا حاجة.
CREATE OR REPLACE FUNCTION public.customer_account_cash(
  p_account uuid, p_type text, p_amount numeric, p_treasury_account uuid, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public' AS $$
DECLARE
  v_tenant uuid := public.current_tenant_id();
  v_user uuid := (SELECT id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1);
  v_acc public.customer_accounts;
  v_balance numeric; v_before numeric; v_signed numeric; v_entry public.customer_account_entries;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'لا توجد جلسة نشطة'; END IF;
  IF NOT public.customer_accounts_on(v_tenant) THEN RAISE EXCEPTION 'الحساب الجاري مش مفعّل للمحل ده'; END IF;
  IF p_type NOT IN ('deposit', 'refund') THEN RAISE EXCEPTION 'نوع حركة غلط'; END IF;
  IF COALESCE(p_amount, 0) <= 0 THEN RAISE EXCEPTION 'المبلغ لازم يكون أكبر من صفر'; END IF;
  SELECT * INTO v_acc FROM public.customer_accounts WHERE id = p_account AND tenant_id = v_tenant FOR UPDATE;
  IF v_acc.id IS NULL THEN RAISE EXCEPTION 'الحساب مش موجود'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.treasury_accounts WHERE id = p_treasury_account AND tenant_id = v_tenant AND active) THEN
    RAISE EXCEPTION 'اختار خزينة شغالة';
  END IF;
  v_balance := public.customer_account_balance(p_account);
  IF p_type = 'refund' AND p_amount > v_balance THEN
    RAISE EXCEPTION 'المبلغ أكبر من رصيدها (% ج.م)', v_balance;
  END IF;

  PERFORM 1 FROM public.treasury_accounts WHERE id = p_treasury_account FOR UPDATE;
  v_before := COALESCE((SELECT SUM(amount) FROM public.treasury_movements WHERE account_id = p_treasury_account), 0);
  v_signed := CASE WHEN p_type = 'deposit' THEN p_amount ELSE -p_amount END;
  IF p_type = 'refund' AND v_before + v_signed < 0 THEN
    RAISE EXCEPTION 'رصيد الخزينة مش كفاية (% ج.م)', v_before;
  END IF;

  INSERT INTO public.customer_account_entries (tenant_id, account_id, type, amount, treasury_account_id, reason, user_id)
  VALUES (v_tenant, p_account, p_type, p_amount, p_treasury_account, NULLIF(btrim(COALESCE(p_reason, '')), ''), v_user)
  RETURNING * INTO v_entry;

  INSERT INTO public.treasury_movements (tenant_id, account_id, type, amount, before, after, user_id, reference, reason)
  VALUES (v_tenant, p_treasury_account, CASE WHEN p_type = 'deposit' THEN 'customer_deposit' ELSE 'customer_refund' END,
          v_signed, v_before, v_before + v_signed, v_user,
          CASE WHEN p_type = 'deposit' THEN 'عربون عميل' ELSE 'رد فلوس عميل' END, p_reason);

  RETURN jsonb_build_object('entry', to_jsonb(v_entry), 'balance', v_balance + v_signed);
END $$;
REVOKE ALL ON FUNCTION public.customer_account_cash(uuid, text, numeric, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.customer_account_cash(uuid, text, numeric, uuid, text) TO authenticated;

-- 6ب. خصم بيع من الرصيد (بعد ما البيع يتعمل) — بقفل الحساب.
CREATE OR REPLACE FUNCTION public.customer_account_use(
  p_account uuid, p_sale uuid, p_amount numeric, p_held boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public' AS $$
DECLARE
  v_tenant uuid := public.current_tenant_id();
  v_user uuid := (SELECT id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1);
  v_acc public.customer_accounts; v_balance numeric; v_sale public.sales; v_entry public.customer_account_entries;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'لا توجد جلسة نشطة'; END IF;
  IF NOT public.customer_accounts_on(v_tenant) THEN RAISE EXCEPTION 'الحساب الجاري مش مفعّل للمحل ده'; END IF;
  IF COALESCE(p_amount, 0) <= 0 THEN RAISE EXCEPTION 'المبلغ لازم يكون أكبر من صفر'; END IF;
  SELECT * INTO v_acc FROM public.customer_accounts WHERE id = p_account AND tenant_id = v_tenant FOR UPDATE;
  IF v_acc.id IS NULL THEN RAISE EXCEPTION 'الحساب مش موجود'; END IF;
  SELECT * INTO v_sale FROM public.sales WHERE id = p_sale AND tenant_id = v_tenant;
  IF v_sale.id IS NULL THEN RAISE EXCEPTION 'الفاتورة مش موجودة'; END IF;
  IF v_sale.customer_id IS DISTINCT FROM v_acc.customer_id THEN RAISE EXCEPTION 'الفاتورة باسم عميل تاني'; END IF;
  IF EXISTS (SELECT 1 FROM public.customer_account_entries WHERE sale_id = p_sale AND type = 'use') THEN
    RAISE EXCEPTION 'الفاتورة دي اتخصمت من الرصيد قبل كده';
  END IF;
  v_balance := public.customer_account_balance(p_account);
  IF p_amount > v_balance THEN RAISE EXCEPTION 'رصيدها مش كفاية (% ج.م)', v_balance; END IF;

  INSERT INTO public.customer_account_entries (tenant_id, account_id, type, amount, sale_id, held, user_id)
  VALUES (v_tenant, p_account, 'use', p_amount, p_sale, COALESCE(p_held, false), v_user)
  RETURNING * INTO v_entry;
  RETURN jsonb_build_object('entry', to_jsonb(v_entry), 'balance', v_balance - p_amount);
END $$;
REVOKE ALL ON FUNCTION public.customer_account_use(uuid, uuid, numeric, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.customer_account_use(uuid, uuid, numeric, boolean) TO authenticated;

COMMIT;
