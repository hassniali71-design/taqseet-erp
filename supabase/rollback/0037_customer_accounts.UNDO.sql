-- رجوع بند 93 (ملف 0037): بيشيل الحساب الجاري / جهاز العروسة.
-- بيرفض يكمّل لو فيه أي حساب عميل أو حركة عربون، لأن دي فلوس ناس — لازم تتقفل الأول.
-- آخر سطر لازم يكون COMMIT;
BEGIN;
DO $$
DECLARE v_busy boolean := false;
BEGIN
  IF to_regclass('public.customer_accounts') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.customer_accounts)' INTO v_busy;
  END IF;
  IF NOT v_busy THEN
    SELECT EXISTS (SELECT 1 FROM public.treasury_movements WHERE type IN ('customer_deposit', 'customer_refund'))
      INTO v_busy;
  END IF;
  IF v_busy THEN
    RAISE EXCEPTION 'فيه حسابات عملاء أو عرابين متسجّلة — مينفعش الرجوع';
  END IF;
END $$;
DROP FUNCTION IF EXISTS public.customer_account_use(uuid, uuid, numeric, boolean);
DROP FUNCTION IF EXISTS public.customer_account_cash(uuid, text, numeric, uuid, text);
DROP FUNCTION IF EXISTS public.customer_account_balance(uuid);
DROP TABLE IF EXISTS public.sale_pickups;
DROP TABLE IF EXISTS public.reservations;
DROP TABLE IF EXISTS public.customer_account_entries;
DROP TABLE IF EXISTS public.customer_accounts;
DROP FUNCTION IF EXISTS public.reservations_status_guard();
DROP FUNCTION IF EXISTS public.customer_accounts_on(uuid);
ALTER TABLE public.treasury_movements DROP CONSTRAINT IF EXISTS treasury_movements_type_check;
ALTER TABLE public.treasury_movements ADD CONSTRAINT treasury_movements_type_check
  CHECK (type IN ('opening', 'sale', 'collection', 'purchase_payment', 'expense', 'return', 'exchange',
                  'transfer', 'partner_profit_payout'));
COMMIT;
