-- =====================================================================
-- حسبة — بند 84: إشعارات الستارة على التليفون + صندوق «نشاط الموظفين» (TASK-0004 المرحلة 4).
-- منقول من دكانة/سفرة (13-push-notifications + 15-notifications-inbox + 16-notifications-by-role)
-- ومظبوط على جداول حسبة. والملف لو اتطبق على أي قاعدة تانية بيقف ويرجع لوحده.
-- آخر سطر في الملف لازم يكون  COMMIT;  — لو مش موجود ماتطبقش.
--
-- بيعمل إيه (إضافة بس — مفيش أي جدول أو دالة موجودة بتتغيّر، ومفيش أي بيانات بتتمسح):
-- 1. pg_net: أداة في Supabase بتخلّي القاعدة تبعت طلب لموقعنا (موجودة في الخطة المجانية).
-- 2. push_subscriptions: كل تليفون فعّل الإشعارات (تبع مين وأنهي محل). محدش يقراه من برة.
-- 3. push_config: عنوان موقعنا + كلمة سر بين القاعدة والموقع. فاضي لحد ما تطبّق ملف الإعداد اللي
--    في  _keys  (فيه كلمة السر). من غيره مفيش إشعارات بتطلع، ومفيش حاجة بتبوظ.
-- 4. push_log: سجل كل إشعار اتبعت (لمين، وكام جهاز). بيتنضف لوحده بعد 30 يوم.
-- 5. notifications: صندوق الإشعارات. كل عملية مهمة بتتسجل سطر لكل شخص يخصه (الجدول اللي وافق عليه
--    المالك 9/11/2026)، وكل سطر بيطلع على تليفونه في الستارة:
--      تحصيل قسط / تعديل تحصيل / إلغاء تحصيل            ← المالك
--      بيع تقسيط / بيع كاش / مصروف / جرد بفرق           ← المالك
--      مرتجع / استبدال / شراء جديد                       ← المالك + المخزن
--      أوردر توصيل جديد                                  ← المخزن
--    اللي عمل العملية عمره ما بيوصله إشعار عن نفسه.
-- 6. push_test(): زرار «ابعتلي إشعار تجربة». mark_notifications_read(): «مقروء».
--
-- الـtriggers بتتفرج بس (AFTER): مبتغيّرش ولا قيمة، وأي مشكلة في الإشعار عمرها ما بتوقّف
-- التحصيل أو البيع (كل دالة فيها EXCEPTION بترجع من غير غلط).
-- الرجوع: supabase/rollback/0033_push_notifications.UNDO.sql
-- =====================================================================
BEGIN;

-- 0. القاعدة الصح؟ (حسبة فيها عقود التقسيط والوظايف بالاسم، ومافيهاش طلبات سفرة)
DO $$
BEGIN
  IF to_regclass('public.installment_contracts') IS NULL
     OR to_regclass('public.installment_payments') IS NULL
     OR to_regclass('public.user_roles') IS NULL
     OR to_regclass('public.roles') IS NULL
     OR to_regclass('public.orders') IS NOT NULL THEN
    RAISE EXCEPTION 'الملف ده لقاعدة حسبة بس — ماتطبقش على مشروع تاني';
  END IF;
END $$;

-- 1. pg_net
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 2. التليفونات
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  device text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user ON public.push_subscriptions (tenant_id, user_id);
REVOKE ALL ON public.push_subscriptions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;  -- مفيش سياسات: الوصول من الدوال بس

-- 3. الإعداد (صف واحد)
CREATE TABLE IF NOT EXISTS public.push_config (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  dispatch_url text NOT NULL CHECK (dispatch_url LIKE 'https://%/push/dispatch'),
  secret text NOT NULL CHECK (length(secret) >= 32),
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.push_config FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.push_config TO service_role;
ALTER TABLE public.push_config ENABLE ROW LEVEL SECURITY;

-- 4. السجل
CREATE TABLE IF NOT EXISTS public.push_log (
  id bigserial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  tenant_id uuid,
  event text,
  recipients int NOT NULL DEFAULT 0,
  devices int NOT NULL DEFAULT 0,
  title text,
  request_id bigint,
  note text
);
CREATE INDEX IF NOT EXISTS push_log_created ON public.push_log (created_at DESC);
REVOKE ALL ON public.push_log FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.push_log TO service_role;
ALTER TABLE public.push_log ENABLE ROW LEVEL SECURITY;

-- التليفون يسجّل نفسه باسم اللي داخل دلوقتي (لو نفس التليفون اتنقل لحساب تاني، بيتنقل)
CREATE OR REPLACE FUNCTION public.push_subscribe(_endpoint text, _p256dh text, _auth text, _device text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid := auth.uid(); _t uuid := public.current_tenant_id();
BEGIN
  IF _uid IS NULL OR _t IS NULL THEN RAISE EXCEPTION 'لازم تكون داخل بحساب محل'; END IF;
  IF _endpoint IS NULL OR _endpoint NOT LIKE 'https://%' OR length(_endpoint) > 1000
     OR length(COALESCE(_p256dh, '')) NOT BETWEEN 80 AND 100
     OR length(COALESCE(_auth, '')) NOT BETWEEN 16 AND 32 THEN
    RAISE EXCEPTION 'بيانات الإشعارات من التليفون مش سليمة';
  END IF;
  INSERT INTO public.push_subscriptions (tenant_id, user_id, endpoint, p256dh, auth, device)
  VALUES (_t, _uid, _endpoint, _p256dh, _auth, left(_device, 200))
  ON CONFLICT (endpoint) DO UPDATE
     SET tenant_id = EXCLUDED.tenant_id, user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh,
         auth = EXCLUDED.auth, device = EXCLUDED.device, last_seen_at = now();
  -- 10 أجهزة بالكتير لكل مستخدم: الأقدم يتشال (تليفونات المستخدم ده بس — مش بيانات المحل)
  DELETE FROM public.push_subscriptions
   WHERE user_id = _uid AND id NOT IN (
     SELECT id FROM public.push_subscriptions WHERE user_id = _uid ORDER BY last_seen_at DESC LIMIT 10);
END $$;
REVOKE ALL ON FUNCTION public.push_subscribe(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.push_subscribe(text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.push_unsubscribe(_endpoint text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  DELETE FROM public.push_subscriptions WHERE endpoint = _endpoint AND user_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.push_unsubscribe(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.push_unsubscribe(text) TO authenticated;

-- الموقع بيقول «التليفونات دي اتشالت» (بنفس كلمة السر)
CREATE OR REPLACE FUNCTION public.push_forget(_secret text, _endpoints text[])
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _n int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.push_config WHERE secret = _secret) THEN RETURN 0; END IF;
  DELETE FROM public.push_subscriptions WHERE endpoint = ANY (_endpoints[1:500]);
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $$;
REVOKE ALL ON FUNCTION public.push_forget(text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.push_forget(text, text[]) TO anon, authenticated;

-- القلب: ابعت إشعار لمستخدمين محل معيّن. عمرها ما بترمي غلطة (التحصيل والبيع أهم من الإشعار).
CREATE OR REPLACE FUNCTION public._push_send(
  _tenant uuid, _users uuid[], _event text, _title text, _body text, _url text, _tag text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _cfg public.push_config; _subs jsonb; _n int; _req bigint; _users_n int;
BEGIN
  _users := ARRAY(SELECT DISTINCT u FROM unnest(_users) u WHERE u IS NOT NULL);
  _users_n := COALESCE(array_length(_users, 1), 0);
  IF _tenant IS NULL OR _users_n = 0 THEN RETURN NULL; END IF;
  SELECT * INTO _cfg FROM public.push_config WHERE id = 1;
  SELECT jsonb_agg(jsonb_build_object('endpoint', endpoint, 'p256dh', p256dh, 'auth', auth)), count(*)
    INTO _subs, _n
    FROM public.push_subscriptions WHERE tenant_id = _tenant AND user_id = ANY (_users);
  IF _cfg.id IS NULL OR COALESCE(_n, 0) = 0 THEN
    INSERT INTO public.push_log (tenant_id, event, recipients, devices, title, note)
    VALUES (_tenant, _event, _users_n, 0, _title, CASE WHEN _cfg.id IS NULL THEN 'not configured' ELSE 'no devices' END);
    RETURN NULL;
  END IF;
  SELECT net.http_post(
           url := _cfg.dispatch_url,
           body := jsonb_build_object('subs', _subs, 'title', left(_title, 120), 'body', left(COALESCE(_body, ''), 300),
                                      'url', COALESCE(_url, '/'), 'tag', left(COALESCE(_tag, _event), 64)),
           headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', _cfg.secret),
           timeout_milliseconds := 8000)
    INTO _req;
  INSERT INTO public.push_log (tenant_id, event, recipients, devices, title, request_id)
  VALUES (_tenant, _event, _users_n, _n, _title, _req);
  -- تنضيف السجل من وقت للتاني
  IF random() < 0.01 THEN DELETE FROM public.push_log WHERE created_at < now() - interval '30 days'; END IF;
  RETURN _req;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'push skipped (%): %', _event, SQLERRM;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public._push_send(uuid, uuid[], text, text, text, text, text) FROM PUBLIC, anon, authenticated;

-- «ابعتلي إشعار تجربة»: لكل تليفونات المستخدم ده. مرة كل 10 ثواني بالكتير.
CREATE OR REPLACE FUNCTION public.push_test()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid := auth.uid(); _t uuid := public.current_tenant_id(); _n int;
BEGIN
  IF _uid IS NULL OR _t IS NULL THEN RAISE EXCEPTION 'لازم تكون داخل بحساب محل'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.push_config WHERE id = 1) THEN
    RAISE EXCEPTION 'الإشعارات لسه ماتجهزتش على القاعدة (ملف الإعداد)';
  END IF;
  IF EXISTS (SELECT 1 FROM public.push_log WHERE tenant_id = _t AND event = 'test'
              AND created_at > now() - interval '10 seconds') THEN
    RAISE EXCEPTION 'استنى ثواني وجرّب تاني';
  END IF;
  SELECT count(*) INTO _n FROM public.push_subscriptions WHERE tenant_id = _t AND user_id = _uid;
  IF _n > 0 THEN
    PERFORM public._push_send(_t, ARRAY[_uid], 'test', 'إشعار تجربة ✅',
      'لو شايف الرسالة دي في الستارة يبقى الإشعارات شغالة على تليفونك.', '/settings', 'test');
  END IF;
  RETURN _n;
END $$;
REVOKE ALL ON FUNCTION public.push_test() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.push_test() TO authenticated;

-- 5. صندوق الإشعارات (نفس شكل دكانة/سفرة)
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  dedupe_key text NOT NULL,
  ref_table text,
  ref_id uuid,
  ref_no text,
  actor_id uuid,
  actor_name text,
  actor_role text,
  amount numeric(14,2),
  title text NOT NULL,
  body text,
  url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe ON public.notifications (recipient_id, dedupe_key);
CREATE INDEX IF NOT EXISTS notifications_inbox ON public.notifications (recipient_id, created_at DESC) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS notifications_tenant_idx ON public.notifications (tenant_id, created_at DESC);

REVOKE ALL ON public.notifications FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname = 'public' AND tablename = 'notifications' AND policyname = 'notifications_read_own') THEN
    CREATE POLICY notifications_read_own ON public.notifications FOR SELECT TO authenticated
      USING (recipient_id = (SELECT auth.uid()) AND tenant_id = (SELECT public.current_tenant_id()));
  END IF;
END $$;

-- مين في المحل ليه الوظيفة دي (بالاسم: owner، warehouse...) — رقم دخوله (auth) عشان الإشعار والتليفون.
CREATE OR REPLACE FUNCTION public._role_auth_users(_tenant uuid, _roles text[])
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(array_agg(DISTINCT u.auth_user_id), '{}'::uuid[])
    FROM public.users u
    JOIN public.user_roles ur ON ur.user_id = u.id
    JOIN public.roles r ON r.id = ur.role_id
   WHERE u.tenant_id = _tenant AND r.tenant_id = _tenant AND u.active
     AND u.auth_user_id IS NOT NULL AND r.name = ANY (_roles);
$$;
REVOKE ALL ON FUNCTION public._role_auth_users(uuid, text[]) FROM PUBLIC, anon, authenticated;

-- سجّل حدث لكل اللي يخصه: المالك (لو _owner) + أي وظيفة في _roles. اللي عمل العملية مابياخدهاش.
-- عمرها ما بترمي غلطة: مشكلة في الإشعار عمرها ما تلغي التحصيل أو البيع.
CREATE OR REPLACE FUNCTION public._notify(
  _tenant uuid, _owner boolean, _roles text[], _event text, _key text, _ref_table text, _ref_id uuid,
  _ref_no text, _amount numeric, _title text, _body text, _url text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _actor uuid := auth.uid(); _name text; _role text; _to uuid[];
BEGIN
  IF _tenant IS NULL THEN RETURN; END IF;
  _to := public._role_auth_users(_tenant,
           CASE WHEN _owner THEN array_append(COALESCE(_roles, '{}'), 'owner') ELSE COALESCE(_roles, '{}') END);
  _to := ARRAY(SELECT u FROM unnest(_to) u WHERE _actor IS NULL OR u <> _actor);
  IF COALESCE(array_length(_to, 1), 0) = 0 THEN RETURN; END IF;
  IF _actor IS NOT NULL THEN
    SELECT NULLIF(btrim(u.full_name), ''),
           (SELECT r.name FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
             WHERE ur.user_id = u.id ORDER BY (r.name = 'owner') DESC LIMIT 1)
      INTO _name, _role
      FROM public.users u WHERE u.auth_user_id = _actor AND u.tenant_id = _tenant LIMIT 1;
  END IF;
  INSERT INTO public.notifications (tenant_id, recipient_id, event_type, dedupe_key, ref_table, ref_id, ref_no,
                                    actor_id, actor_name, actor_role, amount, title, body, url)
  SELECT _tenant, r, _event, _key, _ref_table, _ref_id, _ref_no,
         _actor, _name, _role, _amount, _title, NULLIF(btrim(COALESCE(_body, '')), ''), _url
    FROM unnest(_to) r
  ON CONFLICT (recipient_id, dedupe_key) DO NOTHING;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notification skipped (%): %', _key, SQLERRM;
END $$;
REVOKE ALL ON FUNCTION public._notify(uuid, boolean, text[], text, text, text, uuid, text, numeric, text, text, text)
  FROM PUBLIC, anon, authenticated;

-- 5أ. التحصيل (اتسجّل / اتعدّل / اتلغى) ← المالك
CREATE OR REPLACE FUNCTION public.on_collection_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _c record; _row public.installment_payments;
BEGIN
  _row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  SELECT contract_number, customer_name INTO _c FROM public.installment_contracts WHERE id = _row.contract_id;
  IF TG_OP = 'INSERT' THEN
    PERFORM public._notify(NEW.tenant_id, true, '{}', 'collection', 'collection:' || NEW.id,
      'installment_payments', NEW.id, NEW.receipt_number, NEW.amount, 'حصّل قسط',
      concat_ws(' — ', 'عقد ' || _c.contract_number, _c.customer_name), '/contracts/' || NEW.contract_id);
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM public._notify(NEW.tenant_id, true, '{}', 'collection_edit',
      'collection_edit:' || NEW.id || ':' || extract(epoch FROM clock_timestamp())::text,
      'installment_payments', NEW.id, NEW.receipt_number, NEW.amount, 'عدّل تحصيل',
      concat_ws(' — ',
        CASE WHEN OLD.amount IS DISTINCT FROM NEW.amount
             THEN 'كان ' || to_char(OLD.amount, 'FM999,999,990.00') || ' ج.م' END,
        CASE WHEN OLD.created_at IS DISTINCT FROM NEW.created_at THEN 'واتغيّر تاريخه' END,
        'عقد ' || _c.contract_number, _c.customer_name),
      '/contracts/' || NEW.contract_id);
  ELSE
    PERFORM public._notify(OLD.tenant_id, true, '{}', 'collection_delete', 'collection_delete:' || OLD.id,
      'installment_payments', OLD.id, OLD.receipt_number, OLD.amount, 'لغى تحصيل',
      concat_ws(' — ', 'عقد ' || _c.contract_number, _c.customer_name), '/contracts/' || OLD.contract_id);
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'collection notify skipped: %', SQLERRM;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.on_collection_notify() FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE TRIGGER installment_payments_notify AFTER INSERT OR DELETE ON public.installment_payments
  FOR EACH ROW EXECUTE FUNCTION public.on_collection_notify();
-- التعديل: بس لو المبلغ أو التاريخ اتغيّر (إعادة توزيع باقي الإيصالات على الأقساط مش "تعديل تحصيل")
CREATE OR REPLACE TRIGGER installment_payments_edit_notify AFTER UPDATE OF amount, created_at ON public.installment_payments
  FOR EACH ROW WHEN (OLD.amount IS DISTINCT FROM NEW.amount OR OLD.created_at IS DISTINCT FROM NEW.created_at)
  EXECUTE FUNCTION public.on_collection_notify();

-- 5ب. البيع والمرتجع والاستبدال والمصروف والشراء والجرد والتوصيل
CREATE OR REPLACE FUNCTION public.on_activity_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _name text;
BEGIN
  CASE TG_TABLE_NAME
    WHEN 'installment_contracts' THEN
      PERFORM public._notify(NEW.tenant_id, true, '{}', 'installment_sale', 'installment_sale:' || NEW.id,
        'installment_contracts', NEW.id, NEW.contract_number, NEW.total_amount, 'سجّل بيع تقسيط',
        concat_ws(' — ', 'العميل: ' || NEW.customer_name,
                  'مقدّم ' || to_char(NEW.down_payment, 'FM999,999,990.00') || ' ج.م'),
        '/contracts/' || NEW.id);
    WHEN 'sales' THEN
      PERFORM public._notify(NEW.tenant_id, true, '{}', 'cash_sale', 'cash_sale:' || NEW.id,
        'sales', NEW.id, NEW.invoice_number, NEW.total, 'سجّل بيع كاش',
        CASE WHEN NEW.customer_name IS NOT NULL THEN 'العميل: ' || NEW.customer_name END,
        '/sales/' || NEW.id);
    WHEN 'sale_returns' THEN
      PERFORM public._notify(NEW.tenant_id, true, ARRAY['warehouse'], 'sale_return', 'sale_return:' || NEW.id,
        'sale_returns', NEW.id, NEW.return_number, NEW.refund_amount, 'سجّل مرتجع',
        concat_ws(' — ', 'العميل: ' || NEW.customer_name, 'السبب: ' || NULLIF(btrim(NEW.reason), '')),
        '/sales/' || NEW.sale_id);
    WHEN 'exchange_transactions' THEN
      PERFORM public._notify(NEW.tenant_id, true, ARRAY['warehouse'], 'exchange', 'exchange:' || NEW.id,
        'exchange_transactions', NEW.id, NEW.exchange_number, NEW.price_difference, 'سجّل استبدال',
        'السبب: ' || NULLIF(btrim(NEW.reason), ''), '/sales/' || NEW.original_sale_id);
    WHEN 'expenses' THEN
      PERFORM public._notify(NEW.tenant_id, true, '{}', 'expense', 'expense:' || NEW.id,
        'expenses', NEW.id, NULL, NEW.amount, 'سجّل مصروف',
        concat_ws(' — ', NEW.category, NULLIF(btrim(NEW.reason), '')), '/expenses');
    WHEN 'purchases' THEN
      PERFORM public._notify(NEW.tenant_id, true, ARRAY['warehouse'], 'purchase', 'purchase:' || NEW.id,
        'purchases', NEW.id, NEW.purchase_number, NEW.total, 'سجّل شراء',
        'المورد: ' || NEW.supplier_name, '/purchases/' || NEW.id);
    WHEN 'inventory_movements' THEN
      SELECT name INTO _name FROM public.products WHERE id = NEW.product_id;
      PERFORM public._notify(NEW.tenant_id, true, '{}', 'stock_adjust', 'stock_adjust:' || NEW.id,
        'inventory_movements', NEW.id, NULL, NULL, 'سجّل جرد بفرق',
        concat_ws(' — ', _name,
                  'الفرق ' || CASE WHEN NEW.quantity > 0 THEN '+' ELSE '' END || NEW.quantity
                    || ' (كان ' || NEW.before || ' بقى ' || NEW.after || ')',
                  'السبب: ' || NULLIF(btrim(NEW.reason), '')),
        '/stock-count');
    WHEN 'delivery_orders' THEN
      PERFORM public._notify(NEW.tenant_id, false, ARRAY['warehouse'], 'delivery', 'delivery:' || NEW.id,
        'delivery_orders', NEW.id, NULL, NULL, 'سجّل أوردر توصيل',
        concat_ws(' — ', 'العميل: ' || NEW.customer_name, NEW.address,
                  'ميعاده ' || to_char(NEW.scheduled_date AT TIME ZONE 'Africa/Cairo', 'YYYY-MM-DD')),
        '/deliveries');
    ELSE NULL;
  END CASE;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'activity notify skipped (%): %', TG_TABLE_NAME, SQLERRM;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.on_activity_notify() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['installment_contracts', 'sales', 'sale_returns', 'exchange_transactions',
                           'expenses', 'purchases', 'delivery_orders'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('CREATE OR REPLACE TRIGGER %I AFTER INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.on_activity_notify()',
                     t || '_notify', t);
    END IF;
  END LOOP;
END $$;
-- الجرد: بس الحركة اللي فيها فرق فعلي (تعديل مخزون)
CREATE OR REPLACE TRIGGER inventory_movements_notify AFTER INSERT ON public.inventory_movements
  FOR EACH ROW WHEN (NEW.type = 'adjustment' AND NEW.quantity <> 0)
  EXECUTE FUNCTION public.on_activity_notify();

-- 6. أي سطر في الصندوق → على تليفون صاحبه في الستارة
CREATE OR REPLACE FUNCTION public.on_notification_push()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public._push_send(NEW.tenant_id, ARRAY[NEW.recipient_id], NEW.event_type,
    COALESCE(NEW.actor_name, 'موظف') || ' ' || NEW.title,
    concat_ws(' — ', NULLIF(NEW.ref_no, ''),
              CASE WHEN NEW.amount IS NOT NULL THEN to_char(NEW.amount, 'FM999,999,990.00') || ' ج.م' END,
              NEW.body),
    COALESCE(NEW.url, '/dashboard'),
    NEW.event_type || ':' || COALESCE(NEW.ref_id, NEW.id)::text);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notification push skipped: %', SQLERRM;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.on_notification_push() FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE TRIGGER notifications_push AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.on_notification_push();

-- 7. «مقروء» (الإشعار بيختفي من الصندوق، ومش بيتمسح)
CREATE OR REPLACE FUNCTION public.mark_notifications_read(_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE n int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  UPDATE public.notifications SET read_at = now()
   WHERE recipient_id = auth.uid() AND read_at IS NULL
     AND (_ids IS NULL OR id = ANY(_ids));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.mark_notifications_read(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_notifications_read(uuid[]) TO authenticated;

COMMIT;
