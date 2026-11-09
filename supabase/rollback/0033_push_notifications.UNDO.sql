-- رجوع بند 84 (ملف التحديث 0033): بيشيل الإشعارات كلها (التليفونات المسجّلة، والإعداد، والسجل،
-- وصندوق الإشعارات، والـtriggers). بيتشغّل بالإيد بس من محرر الأوامر لو احتجنا نرجع.
-- مبيلمسش أي عقد أو تحصيل أو بيع — الـtriggers كانت بتتفرج بس. أداة pg_net بتفضل (مش بتضر حاجة).
-- آخر سطر لازم يكون COMMIT;
BEGIN;

DROP TRIGGER IF EXISTS installment_payments_notify ON public.installment_payments;
DROP TRIGGER IF EXISTS installment_payments_edit_notify ON public.installment_payments;
DROP TRIGGER IF EXISTS installment_contracts_notify ON public.installment_contracts;
DROP TRIGGER IF EXISTS sales_notify ON public.sales;
DROP TRIGGER IF EXISTS sale_returns_notify ON public.sale_returns;
DROP TRIGGER IF EXISTS exchange_transactions_notify ON public.exchange_transactions;
DROP TRIGGER IF EXISTS expenses_notify ON public.expenses;
DROP TRIGGER IF EXISTS purchases_notify ON public.purchases;
DROP TRIGGER IF EXISTS delivery_orders_notify ON public.delivery_orders;
DROP TRIGGER IF EXISTS inventory_movements_notify ON public.inventory_movements;

DROP FUNCTION IF EXISTS public.on_collection_notify();
DROP FUNCTION IF EXISTS public.on_activity_notify();
DROP FUNCTION IF EXISTS public.mark_notifications_read(uuid[]);
DROP TABLE IF EXISTS public.notifications;  -- بيشيل معاه notifications_push
DROP FUNCTION IF EXISTS public.on_notification_push();
DROP FUNCTION IF EXISTS public._notify(uuid, boolean, text[], text, text, text, uuid, text, numeric, text, text, text);
DROP FUNCTION IF EXISTS public._role_auth_users(uuid, text[]);
DROP FUNCTION IF EXISTS public.push_test();
DROP FUNCTION IF EXISTS public._push_send(uuid, uuid[], text, text, text, text, text);
DROP FUNCTION IF EXISTS public.push_forget(text, text[]);
DROP FUNCTION IF EXISTS public.push_unsubscribe(text);
DROP FUNCTION IF EXISTS public.push_subscribe(text, text, text, text);
DROP TABLE IF EXISTS public.push_log;
DROP TABLE IF EXISTS public.push_config;
DROP TABLE IF EXISTS public.push_subscriptions;

COMMIT;
