-- بند 72 — حذف عميل نهائيًا من الإعدادات (للمالك فقط). لازم يتطبّق يدويًا على Supabase (SQL Editor)
-- بعد موافقة المالك؛ الواجهة بتعرض رسالة واضحة لو الدالة لسه مش موجودة.
--
-- سياسة الحذف (عشان السجل المالي يفضل سليم):
--   مسموح: عميل مفيش على أي عقد من عقوده إيصال تحصيل واحد، وكل عقوده (لو له عقود) حالتها
--     `cancelled` — يعني اتعكس أثرها على المخزون والخزينة والشركاء بالفعل عن طريق "إلغاء العقد"
--     الموجود (useCancelInstallmentContract). في الحالة دي العميل وعقوده الملغية وأقساطها ووعود
--     السداد وأحداث إعادة الهيكلة والضامنين بيتمسحوا كأنهم ما اتدخلوش.
--   ممنوع: أي عقد عليه تحصيلات، أو عقد لسه شغال/متسدد/معاد هيكلته. البديل: "إيقاف" العميل
--     (status = inactive) — يفضل السجل المالي كامل والعميل يختفي من الاستخدام اليومي.
--   فواتير البيع النقدي والمرتجعات بتاعته بتفضل (مستند مالي) بس من غير ربط بالعميل
--     (`on delete set null` الموجود أصلًا في 0004/0008) — بالظبط زي زرار الحذف القديم في /customers.
--
-- كل ده في دالة واحدة = transaction واحدة: يا كله يتمسح يا مفيش حاجة تتمسح (مفيش حذف جزئي).
-- `security invoker`: الدالة بتشتغل بصلاحيات المستخدم نفسه، فـRLS بتفضل شغالة — مستحيل تلمس
-- عميل من محل تاني. وكمان بتتأكد بنفسها إن المستدعي عنده دور `owner` في نفس المحل (التحقق من
-- كلمة سر المالك بيحصل على السيرفر قبل ما الدالة دي تتنادي — src/lib/customer-delete-server.ts).

create or replace function delete_customer_permanently(p_customer_id uuid, p_reason text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tenant uuid := current_tenant_id();
  v_user uuid;
  v_customer customers%rowtype;
  v_receipts int;
  v_open_contracts int;
  v_contracts int;
begin
  if v_tenant is null then
    raise exception 'NO_TENANT';
  end if;

  select u.id into v_user
  from users u
  join user_roles ur on ur.user_id = u.id
  join roles r on r.id = ur.role_id
  where u.auth_user_id = auth.uid()
    and u.tenant_id = v_tenant
    and r.tenant_id = v_tenant
    and r.name = 'owner'
  limit 1;
  if v_user is null then
    raise exception 'NOT_OWNER';
  end if;

  if coalesce(trim(p_reason), '') = '' then
    raise exception 'REASON_REQUIRED';
  end if;

  select * into v_customer
  from customers
  where id = p_customer_id and tenant_id = v_tenant
  for update;
  if not found then
    raise exception 'CUSTOMER_NOT_FOUND';
  end if;

  select count(*) into v_receipts
  from installment_payments p
  join installment_contracts c on c.id = p.contract_id
  where c.customer_id = p_customer_id;
  if v_receipts > 0 then
    raise exception 'HAS_RECEIPTS:%', v_receipts;
  end if;

  select count(*) into v_open_contracts
  from installment_contracts
  where customer_id = p_customer_id and status <> 'cancelled';
  if v_open_contracts > 0 then
    raise exception 'HAS_OPEN_CONTRACTS:%', v_open_contracts;
  end if;

  select count(*) into v_contracts
  from installment_contracts
  where customer_id = p_customer_id;

  -- installments / promises_to_pay / restructure_events: on delete cascade من العقد.
  -- partner_transactions.related_contract_id: on delete set null (صفوف التسوية + عكسها بيفضلوا
  -- متوازنين في دفتر الشريك).
  delete from installment_contracts where customer_id = p_customer_id and tenant_id = v_tenant;
  -- guarantors: cascade. sales / sale_returns: set null (المستند المالي بيفضل).
  delete from customers where id = p_customer_id and tenant_id = v_tenant;

  insert into audit_logs (tenant_id, user_id, action, entity, entity_id, old_value, reason)
  values (
    v_tenant,
    v_user,
    'customer.delete_permanent',
    'customers',
    p_customer_id::text,
    to_jsonb(v_customer) || jsonb_build_object('cancelled_contracts_deleted', v_contracts),
    trim(p_reason)
  );

  return jsonb_build_object('contracts_deleted', v_contracts);
end;
$$;

revoke all on function delete_customer_permanently(uuid, text) from public, anon;
grant execute on function delete_customer_permanently(uuid, text) to authenticated;
