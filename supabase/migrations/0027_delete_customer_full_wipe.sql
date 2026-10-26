-- بند 73 — قرار المالك الصريح (بعد 0026): الحذف النهائي للعميل يمسح **كل حاجة** خاصة بعقوده،
-- حتى لو عليها أقساط وتحصيلات، كأنه ما اتدخلش — بكلمة سر المالك بس. بيستبدل دالة 0026.
--
-- اللي بيتمسح (كله في transaction واحدة — يا كله يا ولا حاجة):
--   • العميل نفسه + ضامنينه.
--   • كل عقود التقسيط بتاعته (أي حالة) + أقساطها + إيصالات التحصيل + وعود السداد + أحداث إعادة
--     الهيكلة + رسائل التذكير المرتبطة بالأقساط.
--   • الأثر المالي للعقود دي: حركات الخزينة (المقدّم: reference = رقم العقد، التحصيلات وتعديلاتها:
--     reference = رقم الإيصال) + القيود المحاسبية (reference_id = id العقد أو id الإيصال).
--   • أثر المخزون: حركات المخزون المرجعها رقم العقد (البيع + أي إرجاع من إلغاء)، والسيريالات
--     اللي كانت في العقد بترجع "متاحة" — الجهاز بيرجع المخزون كأنه ما اتباعش.
--   • صفوف الشركاء المرتبطة بالعقود (تسوية الصفقة + عكسها لو اتلغت).
-- اللي بيفضل: فواتير البيع النقدي (مستند بيع كاش مستقل) بتفضل بس من غير ربط بالعميل، وسجل
-- التدقيق (audit_logs) بيفضل وبيتضاف عليه سطر الحذف بكل اللي اتمسح.
--
-- `security definer` (مش invoker زي 0026): جداول الخزينة/القيود/المخزون/الشركاء append-only
-- لأي مستخدم عادي تحت RLS (مفيش delete policy عن قصد)، فالمسح ده محتاج صلاحيات أعلى. عشان كده
-- الدالة بنفسها: بتجيب المحل من auth.uid()، بتتأكد إن المستدعي owner في نفس المحل، وكل جملة
-- حذف متقيدة بـtenant_id بتاع المحل ده بالظبط — مستحيل تلمس محل تاني. وكلمة سر المالك بتتأكد
-- على السيرفر قبل ما الدالة تتنادي (src/lib/customer-delete-server.ts).

create or replace function delete_customer_permanently(p_customer_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_tenant uuid;
  v_user uuid;
  v_customer customers%rowtype;
  v_contract_ids uuid[];
  v_contract_numbers text[];
  v_payment_ids uuid[];
  v_receipt_numbers text[];
  v_installment_ids uuid[];
  v_serial_ids uuid[];
  v_received numeric := 0;
  v_counts jsonb;
  n_treasury int; n_journal int; n_inventory int; n_partners int; n_messages int;
begin
  if v_uid is null then
    raise exception 'NO_SESSION';
  end if;

  select u.id, u.tenant_id into v_user, v_tenant
  from users u
  join user_roles ur on ur.user_id = u.id
  join roles r on r.id = ur.role_id and r.tenant_id = u.tenant_id
  where u.auth_user_id = v_uid and r.name = 'owner'
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

  select coalesce(array_agg(id), '{}'), coalesce(array_agg(contract_number), '{}')
  into v_contract_ids, v_contract_numbers
  from installment_contracts
  where customer_id = p_customer_id and tenant_id = v_tenant;

  select coalesce(array_agg(id), '{}'), coalesce(array_agg(receipt_number), '{}'), coalesce(sum(amount), 0)
  into v_payment_ids, v_receipt_numbers, v_received
  from installment_payments
  where contract_id = any (v_contract_ids) and tenant_id = v_tenant;

  select coalesce(array_agg(id), '{}') into v_installment_ids
  from installments
  where contract_id = any (v_contract_ids) and tenant_id = v_tenant;

  select coalesce(array_agg((item ->> 'serial_id')::uuid), '{}') into v_serial_ids
  from installment_contracts c, jsonb_array_elements(c.items) item
  where c.id = any (v_contract_ids) and coalesce(item ->> 'serial_id', '') <> '';

  -- الأثر المالي
  delete from treasury_movements
  where tenant_id = v_tenant
    and (reference = any (v_contract_numbers) or reference = any (v_receipt_numbers));
  get diagnostics n_treasury = row_count;

  delete from journal_entries
  where tenant_id = v_tenant
    and (reference_id = any (array(select unnest(v_contract_ids)::text))
         or reference_id = any (array(select unnest(v_payment_ids)::text)));
  get diagnostics n_journal = row_count;

  -- المخزون: الجهاز يرجع كأنه ما اتباعش
  delete from inventory_movements
  where tenant_id = v_tenant and reference = any (v_contract_numbers);
  get diagnostics n_inventory = row_count;

  update product_serials set status = 'available'
  where tenant_id = v_tenant and id = any (v_serial_ids);

  -- الشركاء
  delete from partner_transactions
  where tenant_id = v_tenant and related_contract_id = any (v_contract_ids);
  get diagnostics n_partners = row_count;

  -- رسائل التذكير المرتبطة بالأقساط
  delete from message_logs
  where tenant_id = v_tenant and entity = 'installment'
    and entity_id = any (array(select unnest(v_installment_ids)::text));
  get diagnostics n_messages = row_count;

  -- العقود وكل اللي تحتها (الإيصالات الأول لأن FK بتاعها restrict)
  delete from installment_payments where tenant_id = v_tenant and contract_id = any (v_contract_ids);
  delete from promises_to_pay where tenant_id = v_tenant and contract_id = any (v_contract_ids);
  delete from restructure_events where tenant_id = v_tenant and contract_id = any (v_contract_ids);
  delete from installments where tenant_id = v_tenant and contract_id = any (v_contract_ids);
  delete from installment_contracts where tenant_id = v_tenant and id = any (v_contract_ids);

  -- العميل (الضامنين cascade، فواتير النقدي/المرتجعات set null)
  delete from customers where id = p_customer_id and tenant_id = v_tenant;

  v_counts := jsonb_build_object(
    'contracts_deleted', coalesce(array_length(v_contract_ids, 1), 0),
    'receipts_deleted', coalesce(array_length(v_payment_ids, 1), 0),
    'received_total', v_received,
    'installments_deleted', coalesce(array_length(v_installment_ids, 1), 0),
    'treasury_movements_deleted', n_treasury,
    'journal_entries_deleted', n_journal,
    'inventory_movements_deleted', n_inventory,
    'serials_returned', coalesce(array_length(v_serial_ids, 1), 0),
    'partner_rows_deleted', n_partners,
    'messages_deleted', n_messages
  );

  insert into audit_logs (tenant_id, user_id, action, entity, entity_id, old_value, reason)
  values (
    v_tenant, v_user, 'customer.delete_permanent', 'customers', p_customer_id::text,
    to_jsonb(v_customer) || jsonb_build_object('contract_numbers', v_contract_numbers,
                                               'receipt_numbers', v_receipt_numbers,
                                               'deleted', v_counts),
    trim(p_reason)
  );

  return v_counts;
end;
$$;

revoke all on function delete_customer_permanently(uuid, text) from public, anon;
grant execute on function delete_customer_permanently(uuid, text) to authenticated;
