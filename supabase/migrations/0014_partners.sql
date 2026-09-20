-- الشركاء (Funding Partners) — العميل بيشتغل بفلوس شركاء بيموّلوه، بيشتري بيها بضاعة، وبيرد
-- لكل شريك رأس ماله + نصيبه من الربح لما تتباع الصفقة (البند 3 في دفعة ما بعد العرض على
-- العميل الحقيقي، طُلب صراحة "أقوى من المطلوب" و"شرط أساسي في المشروع").
--
-- `partners` مرجعية بيانات (زي customers/suppliers) — تعديل/حذف مسموح، `for all`.
-- `partner_transactions` دفتر مالي (زي treasury_movements/installment_payments) — append-only،
-- `select`+`insert` بس. كل صف بيمثّل استحقاق شريك من صفقة واحدة (funding/withdrawal/
-- sale_settlement/adjustment)، بـ`amount` الموقّع اللي بيحرّك رصيده الفعلي (رصيد = مجموع
-- amount على الشريك، محسوب وقت القراءة زي أي رصيد تاني في المشروع ده — انظر
-- computePartnerBalance في supabase-queries.ts)، مع `cost_recovered`/`profit_amount` منفصلين
-- لتقارير واضحة بين "رأس المال المسترد" و"الربح".
--
-- هذه طبقة موازية تمامًا — لا تعدّل أي قيد/حركة خزينة خاصة بالبيع نفسه (useCreateSale /
-- useCreateInstallmentContract تفضل زي ما هي بالظبط)، فقط بتتبّع مين استحق إيه من الصفقة.

create table if not exists partners (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  code text not null,
  name text not null,
  phone text,
  -- نسبة ربح خاصة بكل شريك لوحده (مش نسبة موحّدة للكل) — قابلة للتعديل وقت الإنشاء.
  profit_share_pct numeric(5, 2) not null default 50,
  notes text,
  active boolean not null default true,
  -- تاريخ انضمام مفتوح — قابل للتحديد يدويًا زي customers/sales/installment_contracts/purchases.
  created_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create index if not exists idx_partners_tenant on partners (tenant_id);
create index if not exists idx_partners_tenant_active on partners (tenant_id, active);

create table if not exists partner_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  partner_id uuid not null references partners (id) on delete restrict,
  type text not null check (type in ('funding', 'withdrawal', 'sale_settlement', 'adjustment')),
  amount numeric(12, 2) not null,
  cost_recovered numeric(12, 2) not null default 0,
  profit_amount numeric(12, 2) not null default 0,
  reference text,
  reason text,
  related_sale_id uuid references sales (id) on delete set null,
  related_contract_id uuid references installment_contracts (id) on delete set null,
  related_product_id uuid references products (id) on delete set null,
  user_id uuid references users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_partner_transactions_tenant on partner_transactions (tenant_id);
create index if not exists idx_partner_transactions_partner on partner_transactions (partner_id);
create index if not exists idx_partner_transactions_tenant_created
  on partner_transactions (tenant_id, created_at desc);

alter table partners enable row level security;
create policy partners_isolation on partners
  for all
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

alter table partner_transactions enable row level security;
create policy partner_transactions_select on partner_transactions
  for select
  using (tenant_id = current_tenant_id());
create policy partner_transactions_insert on partner_transactions
  for insert
  with check (tenant_id = current_tenant_id());
-- Deliberately no update/delete policy — append-only ledger, same rule as treasury_movements
-- (0007) and installment_payments (0005).
