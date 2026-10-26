-- بند 78 — تحصيل قسط ذري ومحمي من التكرار. **محتاج مراجعة وموافقة المالك قبل ما يتطبّق.**
-- لحد ما يتطبّق، الواجهة بتشتغل بالطريقة القديمة بالظبط (fallback تلقائي) — مفيش حاجة بتبوظ.
--
-- المشكلة اللي بيقفلها:
--   التحصيل كان خطوات منفصلة من المتصفح: (1) يقرأ الأقساط، (2) يسجّل الإيصال، (3) يحدّث كل قسط،
--   (4) يحدّث حالة العقد. لو جهازين حصّلوا على نفس العقد في نفس اللحظة، الاتنين بيقروا نفس
--   "المدفوع" القديم، وكل واحد يكتب فوق التاني → إيصالين متسجلين لكن الأقساط شايلة واحد بس
--   (أو مبلغ أكبر من المتبقي بيعدّي). ولو النت فصل بعد (2) وقبل (3) → إيصال من غير أقساط. ولو
--   الطلب اتبعت مرتين (إعادة محاولة بعد انقطاع/ضغطتين) → إيصالين لنفس الفلوس.
--
-- الحل: دالة واحدة = transaction واحدة:
--   • `for update` على صف العقد: أي تحصيل تاني على نفس العقد بيستنى لحد ما ده يخلص، فبيقرا
--     المدفوع بعد التحديث — مستحيل يتحصّل أكتر من المتبقي أو يضيع تحصيل.
--   • يا كله يتسجل (إيصال + أقساط + حالة العقد) يا ولا حاجة.
--   • `idempotency_key`: المتصفح بيولّد مفتاح لكل عملية تحصيل؛ لو نفس الطلب وصل مرتين، التانية
--     بترجّع نفس الإيصال الأول من غير ما تسجّل حاجة جديدة.
-- منطق التوزيع نفسه **مطابق حرفيًا** لـperformCollectPayment القديمة (الأقدم استحقاقًا أولًا،
-- تقريب لقرشين، paid/partially_paid، settled/partially_paid للعقد) — مفيش أي تغيير في الحسابات.
-- الخزينة/القيود/وعود السداد/سجل التدقيق بتفضل بعد الدالة من المتصفح زي ما كانت (best-effort).
--
-- `security invoker`: بتشتغل بصلاحيات المستخدم نفسه، فـRLS بتفضل حامية العزل بين المحلات.

alter table installment_payments add column if not exists idempotency_key uuid;
create unique index if not exists installment_payments_tenant_idempotency_key
  on installment_payments (tenant_id, idempotency_key)
  where idempotency_key is not null;

create or replace function collect_installment_payment(
  p_contract_id uuid,
  p_amount numeric,
  p_created_at timestamptz default null,
  p_idempotency_key uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_contract installment_contracts%rowtype;
  v_existing installment_payments%rowtype;
  v_payment installment_payments%rowtype;
  v_inst record;
  v_owed numeric := 0;
  v_remaining numeric;
  v_apply numeric;
  v_new_paid numeric;
  v_allocations jsonb := '[]'::jsonb;
  v_year int := extract(year from now())::int;
  v_counter int;
  v_all_paid boolean;
  v_any_paid boolean;
  v_next_status text;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'المبلغ يجب أن يكون أكبر من صفر';
  end if;

  -- القفل: أي تحصيل تاني على نفس العقد بيستنى هنا لحد ما ده يخلص (commit/rollback).
  select * into v_contract from installment_contracts where id = p_contract_id for update;
  if not found then
    raise exception 'العقد غير موجود';
  end if;

  if p_idempotency_key is not null then
    select * into v_existing from installment_payments
    where tenant_id = v_contract.tenant_id and idempotency_key = p_idempotency_key;
    if found then
      -- نفس الطلب وصل تاني: نرجّع الإيصال الأول من غير أي تسجيل جديد، و`replayed` بيقول للمتصفح
      -- ميسجّلش حركة الخزينة/القيد مرة تانية.
      return jsonb_build_object('payment', to_jsonb(v_existing), 'replayed', true);
    end if;
  end if;

  select coalesce(sum(greatest(0, amount - paid_amount)), 0) into v_owed
  from installments
  where contract_id = p_contract_id and status not in ('waived', 'rescheduled');
  v_owed := round(v_owed, 2);
  if v_owed <= 0 then
    raise exception 'لا يوجد أقساط مستحقة على هذا العقد';
  end if;
  if p_amount > v_owed then
    raise exception 'المبلغ (%) أكبر من إجمالي المتبقي على العقد (% ج.م)', p_amount, v_owed;
  end if;

  v_remaining := p_amount;
  for v_inst in
    select id, amount, paid_amount from installments
    where contract_id = p_contract_id and status not in ('waived', 'rescheduled')
    order by seq
  loop
    exit when v_remaining <= 0;
    continue when round(v_inst.amount - v_inst.paid_amount, 2) <= 0;
    v_apply := least(round(v_inst.amount - v_inst.paid_amount, 2), v_remaining);
    v_new_paid := round(v_inst.paid_amount + v_apply, 2);
    update installments
      set paid_amount = v_new_paid,
          status = case when v_new_paid >= v_inst.amount then 'paid' else 'partially_paid' end
      where id = v_inst.id;
    v_allocations := v_allocations || jsonb_build_object('installment_id', v_inst.id, 'amount', v_apply);
    v_remaining := round(v_remaining - v_apply, 2);
  end loop;

  v_counter := next_tenant_code_counter(v_contract.tenant_id, 'installment_payments:' || v_year);

  insert into installment_payments
    (tenant_id, contract_id, receipt_number, amount, allocations, user_id, idempotency_key, created_at)
  values (
    v_contract.tenant_id,
    p_contract_id,
    'RCT-' || v_year || '-' || lpad(v_counter::text, 6, '0'),
    p_amount,
    v_allocations,
    (select id from users where auth_user_id = auth.uid() limit 1),
    p_idempotency_key,
    coalesce(p_created_at, now())
  )
  returning * into v_payment;

  select bool_and(status = 'paid'), bool_or(paid_amount > 0)
  into v_all_paid, v_any_paid
  from installments
  where contract_id = p_contract_id and status not in ('waived', 'rescheduled');
  v_next_status := case
    when coalesce(v_all_paid, false) then 'settled'
    when coalesce(v_any_paid, false) then 'partially_paid'
    else v_contract.status
  end;
  if v_next_status <> v_contract.status then
    update installment_contracts set status = v_next_status where id = p_contract_id;
  end if;

  return jsonb_build_object('payment', to_jsonb(v_payment), 'replayed', false);
end;
$$;

revoke all on function collect_installment_payment(uuid, numeric, timestamptz, uuid) from public, anon;
grant execute on function collect_installment_payment(uuid, numeric, timestamptz, uuid) to authenticated;
