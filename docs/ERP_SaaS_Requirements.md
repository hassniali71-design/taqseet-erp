# ERP SaaS Requirements Specification

## نظام إدارة محلات الأجهزة الكهربائية والمنزلية والمبيعات بالتقسيط

**Version:** 1.0
**Status:** Ready for Development
**Target:** Multi-Tenant SaaS
**Primary Market:** Egypt
**UI Language:** Arabic / RTL
**Architecture:** Shared PostgreSQL + Tenant ID + Supabase RLS

---

# 1. الهدف من النظام

إنشاء نظام ERP SaaS متخصص في إدارة محلات الأجهزة الكهربائية والمنزلية التي تعتمد على:

- البيع النقدي.
- البيع بالتقسيط.
- إدارة العملاء والمديونيات.
- التحصيل والمتأخرات.
- المنتجات والسيريالات.
- المخزون.
- المشتريات والموردين.
- الخزائن والبنوك والمحافظ الإلكترونية.
- المحاسبة.
- التوصيل.
- التركيب والخدمات.
- الضمان.
- المرتجعات والاستبدال.
- التقارير والرقابة.
- إدارة عدة محلات من خلال SaaS Control Center.

النظام يجب أن يكون **قويًا جدًا في الرقابة والحسابات**، لكن **بسيطًا جدًا في الاستخدام اليومي**.

المبدأ الأساسي:

> Complexity belongs inside the system, not in front of the employee.

---

# 2. النطاق

## Included in Version 1

- Multi-Tenant SaaS.
- Tenant Management.
- Authentication.
- Roles & Permissions.
- Customers.
- Guarantors.
- Products.
- Serial Numbers.
- Inventory.
- Sales/POS.
- Cash Sales.
- Installment Sales.
- Installment Plans.
- Installment Engine.
- Collections.
- Customer Credit.
- Risk Scoring.
- Promise to Pay.
- Restructuring.
- Early Settlement.
- Purchasing.
- Suppliers.
- Supplier Payments.
- Treasury.
- Banks.
- Electronic Wallets.
- Expenses.
- Accounting.
- Returns.
- Exchanges.
- Financial Adjustments.
- Reversals.
- Delivery.
- Installation/Services.
- Warranty.
- Warranty Claims.
- Reports.
- Dashboards.
- Notifications.
- Documents.
- Audit Log.
- Daily Close.
- Monthly Close.
- SaaS Subscription Management.
- SaaS Feature Flags.
- SaaS Support Access.
- SaaS Platform Audit.

## Explicitly NOT Included in V1

### Taxes / VAT / Egyptian E-Invoicing

لا يوجد Module ضرائب فعلي في النسخة الأولى.

لا يتم إضافة VAT أو E-Invoice calculations إلى العمليات الحالية.

يمكن إضافة Tax/E-Invoice Module لاحقًا كتحديث منفصل دون إعادة تصميم النظام الأساسي.

---

# 3. Technology Stack

## Frontend

- TanStack Start v1.
- React 19.
- TypeScript.
- Tailwind CSS v4.
- shadcn/ui.
- Lucide React.
- Recharts.
- TanStack Query.
- TanStack Router.
- Vite 7.
- Bun.
- npm compatibility.

## Backend

- Cloudflare Workers.
- TanStack Start Server Functions.
- `createServerFn`.
- PostgreSQL.
- Supabase.
- Supabase Auth.
- JWT.
- Supabase RLS.
- Zod.
- Supabase Storage.

## Architecture

- File-based routing under `src/routes/`.
- SSR.
- Server-side authorization.
- RLS.
- 5-layer SSR error handling.
- Tenant isolation.

## Deployment

Target:

> Cloudflare Workers / Edge

Development:

> `localhost:8080`

---

# 4. Multi-Tenant Architecture

النظام SaaS متعدد العملاء.

كل محل يمثل Tenant مستقل.

## Tenant Identity

كل Tenant يجب أن يمتلك:

- `tenant_id`
- اسم المحل.
- بيانات المالك.
- الهاتف.
- بيانات التواصل.
- تاريخ الإنشاء.
- تاريخ بداية الاشتراك.
- تاريخ انتهاء الاشتراك.
- حالة الاشتراك.
- الخطة.
- Features.
- Users.
- Settings.

## Database Architecture

النسخة الأولى تستخدم:

> Shared PostgreSQL Database

مع:

> `tenant_id`

داخل كل جدول Business Data مناسب.

## Isolation

العزل يجب أن يتم على مستويين:

### Application Layer

كل Server Function يجب أن يتحقق من:

- authenticated user.
- tenant membership.
- role.
- permission.
- tenant scope.

### Database Layer

استخدام:

> Supabase Row Level Security

لمنع الوصول إلى Tenant آخر حتى لو حاول المستخدم تجاوز الواجهة.

لا يجوز الاعتماد على Frontend filtering كوسيلة حماية.

---

# 5. SaaS Platform Owner Control Center

هذه لوحة منفصلة عن ERP الخاص بالمحل.

## Tenant Management

Platform Owner يستطيع:

- إنشاء Tenant.
- تعديل بيانات Tenant.
- تفعيل Tenant.
- تعليق Tenant.
- إعادة تفعيل Tenant.
- تجديد الاشتراك.
- مشاهدة تاريخ الاشتراك.
- مشاهدة المستخدمين.
- مشاهدة حالة النظام.
- إدارة Features.

## Tenant Status

يجب دعم:

- Trial.
- Active.
- Expired.
- Suspended.

## Subscription

الاشتراك الأساسي:

> Annual Subscription

يتم تسجيل:

- Start Date.
- End Date.
- Renewal Date.
- Amount.
- Plan.
- Payment status.
- Renewal history.

## Expiration

عند انتهاء الاشتراك:

1. Grace Period حسب إعدادات المنصة.
2. Read Only أو تقييد العمليات حسب السياسة.
3. Suspension.

لا يتم حذف بيانات العميل عند انتهاء الاشتراك.

## Renewal

التجديد يجب أن:

- يمد تاريخ الانتهاء.
- يسجل عملية التجديد.
- يحفظ تاريخ التجديد السابق.
- يسجل مبلغ التجديد.
- يحدث Subscription Status.
- يطلق Notification عند الحاجة.

---

# 6. SaaS Plans & Features

الخطط يجب ألا تكون Hard-coded.

Platform Owner يستطيع إنشاء وتعديل الخطط.

كل Plan يمكن أن يحدد:

- عدد المستخدمين.
- المميزات.
- حدود الاستخدام.
- Modules.
- Add-ons.

## Feature Flags

أمثلة:

- Installments.
- Serial Tracking.
- Advanced Reports.
- WhatsApp.
- SMS.
- Warranty.
- Delivery.
- Accounting.
- API.
- Credit Scoring.

Feature flags يجب ألا تؤثر على سلامة البيانات عند إيقاف Feature.

---

# 7. Tenant Onboarding

إنشاء Tenant جديد يجب أن يتم من خلال Setup Wizard.

البيانات الأساسية:

- Shop Name.
- Owner.
- Phone.
- Logo.
- Contact Information.
- Subscription.
- Plan.
- Start Date.
- End Date.
- First User.
- Installment Settings.
- Numbering Settings.
- Treasury Settings.
- General Settings.

يجب إنشاء Tenant بطريقة Atomic قدر الإمكان بحيث لا يتم إنشاء Tenant ناقص.

---

# 8. Authentication

استخدام:

> Supabase Auth + JWT

كل مستخدم يجب أن يكون مرتبطًا بـ:

- User ID.
- Tenant ID.
- Role.
- Permissions.
- Active/Inactive status.

لا يسمح للمستخدم بالوصول إلى بيانات Tenant ليس عضوًا فيه.

---

# 9. Roles

الأدوار الأساسية:

- Owner.
- Manager.
- Sales.
- Cashier.
- Warehouse.
- Purchasing.
- Collections.
- Accountant.

يمكن إضافة Roles أخرى.

الصلاحيات يجب أن تكون Granular وليست مجرد Role-level فقط.

---

# 10. Permissions

أمثلة:

- Create Sale.
- Edit Sale.
- Cancel Sale.
- Apply Discount.
- Edit Price.
- Create Installment.
- Approve Installment.
- Collect Payment.
- Reverse Collection.
- Create Return.
- Approve Return.
- Create Exchange.
- Edit Installment.
- Restructure Contract.
- Early Settlement.
- Adjust Customer Balance.
- Adjust Inventory.
- Approve Expense.
- Close Shift.
- Close Day.
- Close Month.
- Override Credit Limit.
- Override Discount.
- Support Access.

كل صلاحية يجب أن تكون مستقلة قدر الإمكان.

---

# 11. Governance Principle

لا يوجد Hard Delete للعمليات الحساسة.

بدل:

> Delete

يتم استخدام:

> Cancel / Reverse / Archive / Deactivate

حسب نوع البيانات.

كل عملية حساسة يجب أن تسجل:

- User.
- Timestamp.
- Entity.
- Record ID.
- Action.
- Old Value.
- New Value.
- Reason.
- Approval.
- Metadata المناسبة.

---

# 12. Audit Log

Audit Log غير قابل للتعديل أو الحذف بواسطة المستخدم العادي.

يجب تسجيل:

- Login.
- Logout.
- Create.
- Update.
- Cancel.
- Approval.
- Rejection.
- Override.
- Financial Adjustment.
- Inventory Adjustment.
- Installment Edit.
- Restructure.
- Early Settlement.
- Return.
- Exchange.
- Reversal.
- Permission-sensitive actions.

ويجب أن يحتوي عند الإمكان على:

- User ID.
- Tenant ID.
- IP/session metadata.
- Timestamp.
- Entity.
- Entity ID.

---

# 13. Super Approval / Emergency Override

المدير المصرح له يستطيع تجاوز بعض السياسات المحددة.

أمثلة:

- تجاوز Credit Limit.
- تخفيض مقدم.
- خصم أكبر من الحد.
- السماح بالبيع لعميل متعثر.
- تعديل عقد تقسيط.
- اعتماد مرتجع استثنائي.
- تسوية مالية.

لكن:

> لا يوجد Override بدون Audit.

كل Override يسجل:

- من نفذه.
- ما القاعدة التي تم تجاوزها.
- السبب.
- القيمة قبل.
- القيمة بعد.
- وقت العملية.

ويظهر في:

> Overrides Report.

---

# 14. Customer Module

## Customer Profile

البيانات:

- Customer Code.
- Name.
- Phone.
- Alternative Phone.
- Address.
- Notes.
- Status.
- Documents.
- Signature.
- Guarantors.

لا يوجد حقل Governorate كمتطلب أساسي.

## Customer 360

صفحة مركزية تعرض:

- Total Purchases.
- Total Paid.
- Outstanding.
- Upcoming Installments.
- Overdue Installments.
- Overdue Amount.
- Credit Limit.
- Used Credit.
- Available Credit.
- Risk Score.
- Active Contracts.

## History

يجب عرض Timeline يشمل:

- Sales.
- Contracts.
- Down Payments.
- Installments.
- Collections.
- Returns.
- Exchanges.
- Discounts.
- Adjustments.
- Reversals.

---

# 15. Guarantors

العميل يمكن أن يمتلك أكثر من Guarantor.

لكل ضامن:

- Name.
- Contact.
- Personal information.
- Documents.
- Relationship.
- Signature.
- Status.

يجب ربط الضامن بعقد التقسيط.

---

# 16. Customer Credit Profile

كل عميل له Credit Profile مركزي.

يشمل:

- Credit Limit.
- Current Exposure.
- Available Credit.
- Overdue Amount.
- Number of Active Contracts.
- Risk Score.
- Payment History.

يجب إجراء Credit Check قبل إنشاء عقد تقسيط جديد.

---

# 17. Risk Score

التصنيف:

- Excellent.
- Good.
- Watch.
- High Risk.
- Critical.

يعتمد على:

- Payment history.
- Delays.
- Overdue amount.
- Active contracts.
- Promise failures.
- Restructuring history.
- Outstanding debt.

يجب أن يعرف المدير أسباب التصنيف وليس اللون فقط.

يمكن للمدير Override للتصنيف وفق الصلاحية مع Audit.

---

# 18. Customer Loyalty / Special Discounts

Feature اختيارية.

يمكن للمدير إنشاء قواعد مثل:

- إجمالي مشتريات.
- عدد الفواتير.
- فترة زمنية.

مثال:

> العميل أصبح عميلًا مميزًا ويحصل على خصم 15%.

الخصم التلقائي واليدوي يجب تسجيلهما.

## Discount Controls

المدير يحدد Maximum Discount للموظف.

مثلاً:

> Employee Limit = 5%

إذا طلب الموظف 15%:

> Approval Required.

---

# 19. Product Master

كل Product يجب أن يحتوي على:

- Product ID.
- Product Code.
- Barcode.
- Name.
- Brand.
- Model.
- Category.
- Unit.
- Description.
- Technical Data.
- Images.
- Purchase Price.
- Cost Price.
- Cash Price.
- Installment Price.
- Wholesale Price.
- Customer-specific Price.
- Min Stock.
- Max Stock.
- Warranty.
- Serial Required.
- Active/Inactive.

---

# 20. Product Deactivation

إذا كان المنتج لديه Transaction History:

> ممنوع Hard Delete.

يستخدم:

> Inactive.

المنتج غير النشط لا يظهر في العمليات الجديدة إلا عند الحاجة للمراجعة التاريخية.

---

# 21. Serial Number Management

للمنتجات التي تحتاج Serial:

كل Physical Unit لها:

- Serial Number.
- Product ID.
- Purchase Invoice.
- Supplier.
- Purchase Cost.
- Warehouse.
- Status.
- Customer.
- Sale Invoice.
- Warranty.
- Return History.

## Serial Lifecycle

مثال:

`Available → Sold → Returned → Inspection → Available / Repair / Damaged`

يجب الاحتفاظ بتاريخ كامل للسيريال.

---

# 22. Non-Serialized Products

المنتجات التي لا تحتاج Serial تعمل بالكمية:

> Purchases + Returns - Sales - Damaged ± Adjustments

---

# 23. Units

دعم Multiple Units.

مثال:

> 1 Carton = 12 Pieces.

يمكن البيع بالقطعة أو الكرتونة حسب إعداد المنتج.

---

# 24. Barcode

البحث باستخدام:

- Barcode.
- Product Code.
- Serial.
- Name.
- Brand.
- Model.

يمكن إنشاء Internal Barcode للمنتجات التي ليس لها Barcode.

---

# 25. Pricing

يجب الفصل بين:

- Cash Price.
- Installment Price.
- Wholesale Price.
- Customer-specific Price.
- Cost.

لا يستطيع الموظف تعديل السعر إلا وفق الصلاحية.

---

# 26. Supplier Price Intelligence

النظام يحتفظ بتاريخ شراء المنتج من كل Supplier.

يجب عرض:

- Last Purchase Price.
- Previous Price.
- Average Price.
- Price Change.
- Percentage Change.
- Supplier comparison.

مثال:

> Supplier A increased price by 2.86%.

ويظهر أفضل سعر حالي حسب البيانات المتاحة.

---

# 27. Costing

يجب أن يدعم النظام إعداد طريقة التكلفة:

- Average Cost.
- Last Purchase Cost.
- FIFO.

طريقة التكلفة يتم تحديدها من إعدادات النظام وتستخدم في التقارير المحاسبية والربحية وفق السياسة المحددة.

---

# 28. Inventory

النسخة الحالية:

> One Branch + One Warehouse.

يجب عدم تعقيد واجهة المستخدم بإدارة فروع متعددة في V1.

يمكن تجهيز Architecture للتوسع مستقبلًا.

---

# 29. Inventory Ledger

كل تغيير في الكمية يجب أن يكون له Movement.

يشمل:

- Movement Type.
- Product.
- Serial.
- Quantity.
- Before.
- After.
- User.
- Date.
- Reference.
- Reason.

لا يوجد تعديل صامت للكمية.

---

# 30. Inventory Count

Workflow:

`Create Count → Count Actual → Compare → Difference → Approval → Adjustment`

مثال:

Expected = 10
Actual = 8
Difference = -2

يجب تسجيل السبب.

---

# 31. Damaged Products

التالف لا يحذف.

يتم نقله إلى حالة:

> Damaged

أو Inspection/Repair حسب الحالة.

---

# 32. Sales / POS

POS يجب أن يكون سريعًا جدًا.

Workflow:

`New Sale → Add Products → Customer → Payment Type → Confirm`

## Search

- Barcode.
- Code.
- Name.
- Brand.
- Model.

## Serialized Sale

يجب اختيار Serial الفعلي قبل إتمام البيع.

---

# 33. Sale State Machine

```text
Draft
↓
Pending Approval
↓
Approved
↓
Payment Pending
↓
Confirmed
↓
Delivered
↓
Completed
```

و:

```text
Cancelled
```

كحالة نهائية عند الإلغاء وفق الصلاحيات.

---

# 34. Cash Sale

Cash sale يجب أن:

- يسجل المنتجات.
- يطبق الخصم المسموح.
- يسجل الدفع.
- يحدث المخزون.
- ينشئ الأثر المحاسبي.
- يصدر المستند.
- يسجل Audit.

---

# 35. Installment Sale

Installment Sale يجب أن:

1. يحدد العميل.
2. يعمل Credit Check.
3. يعرض Risk.
4. يتحقق من Credit Limit.
5. يحدد المنتج.
6. يحدد السعر.
7. يحدد المقدم.
8. يحدد مدة التقسيط.
9. يحدد خطة التمويل.
10. ينشئ جدول الأقساط.
11. يطلب Approval عند الحاجة.
12. ينشئ Contract.
13. يسجل المقدم.
14. يحدث المخزون وفق قاعدة التأكيد المعتمدة.
15. ينشئ الأثر المحاسبي.
16. ينشئ PDF للعقد.

---

# 36. Installment Pricing

يجب فصل:

> Cash Price

عن:

> Installment Price

لكن إذا كانت خطة التقسيط تعتمد على التمويل، يتم حساب المديونية وفق محرك التمويل.

---

# 37. Installment Finance Formula

**المعادلة المعتمدة:**

```text
Finance Amount = Principal × Plan Rate
```

```text
Total Financed Amount = Principal + Finance Amount
```

النسبة تطبق:

> مرة واحدة على أصل المبلغ.

وليست نسبة شهرية مركبة.

---

# 38. Installment Plans

المدير يستطيع إنشاء خطط مثل:

| Duration  | Finance Rate |
| --------- | -----------: |
| 3 Months  |          10% |
| 6 Months  |          20% |
| 9 Months  |          30% |
| 12 Months |          40% |

يمكن إضافة مدد ونسب أخرى.

النسبة المستخدمة يجب أن يتم **Snapshot** لها داخل العقد.

تغيير الخطة مستقبلًا لا يغير العقود القديمة.

---

# 39. Down Payment

المدير يحدد:

- Minimum Down Payment.
- Percentage أو Fixed Amount.

الموظف لا يستطيع النزول عن الحد إلا بصلاحية/Approval.

---

# 40. Installment Duration

النظام يدعم مدد مختلفة.

أمثلة:

- 3.
- 6.
- 9.
- 12.
- 18.
- 24.

المدير يستطيع إضافة مدد.

---

# 41. Installment Schedule

الافتراضي:

> يوم ثابت من الشهر.

مثال:

Purchase Date = 10/09

Due dates:

10/10
10/11
10/12

يمكن تعديل جدول محدد بصلاحية.

تطبق Grace Period وفق إعدادات النظام.

---

# 42. Installment Contract

كل Contract يحتوي على:

- Contract ID.
- Customer.
- Products.
- Serial Numbers.
- Cash Price.
- Principal.
- Down Payment.
- Finance Rate.
- Finance Amount.
- Total Contract Amount.
- Duration.
- Installment Amount.
- Schedule.
- Guarantors.
- Documents.
- Payment history.
- Status.

---

# 43. Contract State Machine

```text
Draft
↓
Pending Approval
↓
Active
↓
Partially Paid
↓
Overdue
↓
Restructured
↓
Settled
```

أو:

```text
Settled Early
```

أو:

```text
Cancelled
```

---

# 44. Installment State Machine

```text
Scheduled
↓
Due
↓
Partially Paid
↓
Paid
```

أو:

```text
Overdue
```

مع إمكانية:

- Waived.
- Rescheduled.

---

# 45. Partial Payment

إذا كان القسط:

> 2,000

والعميل دفع:

> 1,000

يصبح:

- Amount = 2,000.
- Paid = 1,000.
- Remaining = 1,000.
- Status = Partially Paid.

---

# 46. Payment Allocation

الافتراضي:

> Oldest Due First.

لكن الموظف الذي يمتلك الصلاحية يمكنه:

- اختيار Contract.
- اختيار Installment.
- توزيع على عدة Contracts.
- ترك المبلغ Customer Credit.

أي توزيع غير اعتيادي يسجل في Audit.

---

# 47. Early Settlement

عند طلب العميل إغلاق العقد:

النظام يحسب:

- Remaining Principal.
- Remaining Finance.
- Discount if configured.
- Fees if configured.
- Final Settlement Amount.

ثم:

> Settled Early.

لا يتم حذف الجدول الأصلي.

---

# 48. Restructuring

إعادة الجدولة لا تعدل الجدول القديم مباشرة.

يتم إنشاء:

> Restructuring Event

يربط:

- Original Contract.
- Old Schedule.
- Paid Amount.
- Remaining Amount.
- Reason.
- Approval.
- New Schedule.

كل التاريخ القديم محفوظ.

---

# 49. Overdue

بعد تاريخ الاستحقاق:

> Overdue.

النظام يحسب:

- Days Overdue.
- Overdue Amount.

المدير يحدد متى يتم:

> Credit Hold.

مثال:

7 Days Overdue → Credit Hold.

يمكن للمدير Override مع Audit.

---

# 50. Late Fees

Feature اختيارية.

يمكن للمدير اختيار:

- No Late Fee.
- Fixed Amount.
- Percentage.
- Delay-based rule.

لا يتم تطبيق أي Late Fee إذا كانت الميزة غير مفعلة.

---

# 51. Promise to Pay

الموظف يسجل:

- Promise Date.
- Expected Amount.
- Notes.
- Employee.

إذا مر الموعد بدون دفع:

> Promise Failed.

ويظهر في Collections Workbench.

---

# 52. Collections Workbench

الشاشة تعرض:

- Due Today.
- Overdue.
- Amount.
- Days Overdue.
- Customer.
- Phone.
- Contract.
- Promise.
- Last Payment.
- Risk Score.

يمكن تسجيل التحصيل مباشرة من الشاشة.

---

# 53. Payment Proof

للتحويلات:

- Amount.
- Transaction Reference.
- Date.
- Image.
- Customer.
- Contract.

Status:

```text
Pending
↓
Under Review
↓
Approved
↓
Posted
```

أو:

```text
Rejected
```

رفع إثبات التحويل لا يعني أن المبلغ أصبح مدفوعًا حتى يتم اعتماده.

---

# 54. Cash Collection

عند الدفع النقدي:

- تسجيل الدفعة.
- تحديث العقد.
- تحديث العميل.
- تحديث الخزينة.
- إنشاء Receipt.

---

# 55. Collection Receipt

رقم الإيصال يتم توليده تلقائيًا.

مثال:

```text
REC-2026-000152
```

الشروط:

- Unique.
- Sequential.
- Immutable.
- Employee cannot edit.
- Cannot be deleted.

الإلغاء فقط:

> Permission + Reason + Audit.

---

# 56. Credit Hold

عند تجاوز سياسة التأخير:

النظام يمنع إنشاء عقد تقسيط جديد حسب السياسة.

يعرض:

> Customer is on Credit Hold.

المدير المصرح له يمكنه Override.

---

# 57. Credit Limit

قبل التقسيط:

```text
Available Credit =
Credit Limit - Current Exposure
```

يجب التحقق من:

- Current Exposure.
- Overdue.
- Active Contracts.
- Credit Limit.
- Risk.

تجاوز الحد:

> Block أو Approval حسب سياسة المحل.

---

# 58. Customer Statement

كشف الحساب يجب أن يعرض Timeline كامل:

```text
Sale
↓
Down Payment
↓
Installment
↓
Collection
↓
Return
↓
Exchange
↓
Discount
↓
Adjustment
↓
Reversal
```

مع الرصيد الحالي.

---

# 59. Purchasing

Workflow:

```text
Purchase Request
↓
Approval
↓
Purchase Order
↓
Goods Receipt
↓
Supplier Invoice
↓
Payment
```

Purchase Order يمكن أن يكون Optional.

يوجد أيضًا:

> Direct Purchase

وفق الصلاحية.

---

# 60. Goods Receipt

عند الاستلام تتم مقارنة:

- Ordered Quantity.
- Received Quantity.
- Supplier Invoice Quantity.

أي فرق يحتاج معالجة/اعتماد.

---

# 61. Supplier Invoice

تحتوي على:

- Supplier.
- Supplier Invoice Number.
- Date.
- Products.
- Quantity.
- Price.
- Discount.
- Additional Costs.
- Total.
- Paid.
- Remaining.
- Due Date.

لا يسمح بتكرار نفس Supplier Invoice Number لنفس المورد وفق سياسة النظام.

---

# 62. Supplier

Supplier Profile:

- Supplier Code.
- Name.
- Phone.
- Address.
- Status.
- Payment Terms.
- Products.
- Price History.

Supplier 360 يعرض:

- Total Purchases.
- Paid.
- Outstanding.
- Returns.
- Purchase Orders.
- Invoices.
- Payments.
- Product prices.

---

# 63. Supplier Credit

Supplier يمكن أن يكون:

- Cash.
- Credit.

للآجل:

- Outstanding.
- Due.
- Overdue.
- Due Date.
- Aging.

---

# 64. Supplier Payments

Payment يمكن توزيعه:

> Oldest Due First

أو يدويًا بصلاحية.

---

# 65. Supplier Returns

Workflow:

```text
Return Request
↓
Approval
↓
Return
↓
Inventory Update
↓
Supplier Credit / Refund
```

السيريال يجب ربطه عند الحاجة.

فاتورة الشراء الأصلية لا تحذف.

---

# 66. Supplier Rating

Supplier Score يعتمد على:

- Price.
- Delivery.
- Damaged products.
- Quantity accuracy.
- Quality.
- Return handling.

---

# 67. Reorder

عند:

```text
Current Stock <= Minimum Stock
```

النظام يعرض:

> Reorder Suggested.

ويحسب الكمية المقترحة بناءً على Min/Max.

يمكن إنشاء Purchase Request مباشرة.

---

# 68. Treasury

النظام يدعم:

- Main Treasury.
- Employee/Cashier Treasury.
- Bank Accounts.
- Electronic Wallets.

كل Account له Balance.

---

# 69. Financial Movement

كل حركة مالية تحتوي:

- Source Account.
- Destination Account.
- Amount.
- Reason.
- Reference.
- User.
- Date.
- Status.

---

# 70. Shift Management

دعم:

> Open Shift → Transactions → Close Shift

عند الفتح:

- Opening Balance.

عند الإغلاق:

- Expected Balance.
- Actual Balance.
- Variance.
- Reason.

الفرق لا يختفي بدون سبب.

---

# 71. Daily Close

Daily Close يجب أن يأخذ Snapshot لـ:

- Sales.
- Collections.
- Cash.
- Transfers.
- Expenses.
- Returns.
- Inventory movements.
- Treasury.
- Variances.
- Transaction counts.
- Cancellations.

بعد الإغلاق:

> تعديل اليوم يحتاج صلاحية خاصة + Reason + Audit.

---

# 72. Monthly Close

عند إغلاق الشهر:

> Closed Period.

العمليات Backdated داخل الفترة المقفولة تحتاج:

- Special Permission.
- Reason.
- Approval حسب السياسة.
- Audit.

---

# 73. Expenses

Expense يحتوي:

- Category.
- Amount.
- Treasury/Account.
- Employee.
- Date.
- Receipt Image.
- Notes.

المبالغ الكبيرة يمكن أن تحتاج Approval.

---

# 74. Accounting

V1 يجب أن تحتوي على Accounting Core كامل.

## Chart of Accounts

يشمل على الأقل:

- Cash.
- Bank.
- Wallets.
- Customers.
- Suppliers.
- Inventory.
- Sales.
- Cost of Sales.
- Financing Revenue.
- Expenses.
- Discounts.
- Returns.
- Profit.

يمكن إنشاء Sub-Accounts.

---

# 75. Automatic Journal Entries

لا يجب إجبار الموظفين على إدخال قيود يدوية لكل عملية.

العمليات التجارية تولد آثارها المحاسبية تلقائيًا وفق Accounting Rules.

أمثلة:

### Sale

ينتج أثرًا للمبيعات والمخزون/التكلفة.

### Installment Sale

يفصل:

- Product financial result.
- Financing Revenue.

### Collection

يخفض Customer Receivable ويزيد Treasury/Bank/Wallet.

### Purchase

يحدث Inventory/Supplier/Cash حسب العملية.

### Expense

يسجل Expense + Payment Account.

كل Journal Entry يجب أن يرتبط بالـSource Transaction.

---

# 76. Profit

التقارير يجب أن تفصل:

### Product Profit

عن:

### Financing Revenue

مثال:

Cost = 15,000
Cash Sale = 20,000
Product Profit = 5,000

Finance Revenue = 4,000

ولا يتم دمج الرقمين بشكل يخفي مصدر الربح.

---

# 77. Financial Adjustments

ممنوع تعديل الرصيد مباشرة.

أي تصحيح يستخدم:

> Financial Adjustment

ويحتوي:

- Type.
- Amount.
- Reason.
- Source.
- User.
- Approval.
- Attachment.
- Audit.

---

# 78. Reversal

لا يتم حذف حركة مالية.

إذا حدث خطأ:

> Reversal

يرتبط بالعملية الأصلية.

---

# 79. Returns

## Cash Return

النظام يتحقق من:

- Original Invoice.
- Product.
- Serial.
- Return Policy.
- Product condition.
- Delivery/Installation status.
- Paid Amount.

ثم:

- Return transaction.
- Inventory handling.
- Financial reversal/adjustment.
- Return document.

---

# 80. Installment Return

العقد الأصلي لا يحذف.

يتم إنشاء:

> Installment Return Transaction

ويحسب:

- Paid Amount.
- Outstanding.
- Return Value.
- Fees/Discounts.
- Refund.
- Customer Credit.
- Contract Adjustment.

السياسة تسمح بثلاث طرق:

1. Cash Refund.
2. Customer Credit.
3. Case-specific financial settlement.

أي قرار استثنائي يحتاج Approval/Audit.

---

# 81. Return Policy

Manager Settings:

- Return Period.
- Opened Product Rule.
- Installed Product Rule.
- Fees.
- Condition.
- Approval Requirement.

السياسة المستخدمة في العملية يجب الاحتفاظ بها تاريخيًا عند الحاجة حتى لا تتغير نتيجة العمليات القديمة عند تعديل الإعدادات.

---

# 82. Exchange

Exchange Transaction ترتبط بالعملية الأصلية.

مثال:

Old Product = 20,000
New Product = 25,000

Difference = 5,000

الفرق يمكن:

- دفعه Cash.
- إضافته للتقسيط.
- تسويته من خلال Contract/Addendum حسب السياسة.

إذا كان المنتج الجديد أرخص:

يمكن:

- Refund.
- Customer Credit.

حسب سياسة المحل.

---

# 83. Returned Product Lifecycle

المنتج المرتجع لا يدخل Available تلقائيًا.

يذهب إلى:

> Inspection

ثم:

- Available.
- Repair.
- Damaged.
- Supplier Return.

---

# 84. Delivery

التوصيل **Module منفصل** عن قيمة البيع والتقسيط.

## Delivery Order

يحتوي:

- Customer.
- Address.
- Phone.
- Products.
- Serial.
- Scheduled Date.
- Driver.
- Delivery Cost.
- Status.
- Notes.
- Proof of Delivery.

## Status

```text
Scheduled
↓
Out for Delivery
↓
Delivered
```

أو:

```text
Failed / Cancelled
```

---

# 85. Installation / Service

التركيب **منفصل** عن البيع والتقسيط.

Service Request يحتوي:

- Customer.
- Product.
- Serial.
- Technician.
- Appointment.
- Cost.
- Status.
- Notes.
- Completion Proof.

---

# 86. Warranty

Warranty مرتبط بـ:

> Serial + Customer + Sale Invoice.

يظهر:

- Warranty Start.
- Warranty End.
- Provider/Agent.
- Type.
- Status.

---

# 87. Warranty Claim

Workflow:

```text
Received
↓
Inspection
↓
Repair / Replace / Reject
↓
Delivered
```

يجب حفظ كل تاريخ المطالبة.

---

# 88. Documents

Document Management باستخدام Supabase Storage.

أنواع الملفات:

- Customer Documents.
- Guarantor Documents.
- Contracts.
- Signatures.
- Transfer Proof.
- Expense Receipts.
- Warranty Documents.
- Delivery Proof.
- Service Proof.

الوصول للملفات يخضع للصلاحيات وTenant isolation.

---

# 89. Installment Contract PDF

عند إنشاء Contract يتم توليد PDF تلقائيًا.

يحتوي على:

- Customer.
- Products.
- Serial.
- Principal.
- Down Payment.
- Finance Rate.
- Finance Amount.
- Total.
- Installment Schedule.
- Guarantors.
- Terms.
- Signatures حسب إعداد النظام.

ويتم تخزين نسخة مرتبطة بالعقد.

---

# 90. Printing

دعم:

- Thermal Receipt.
- A4 Invoice.

واجهة عربية RTL.

المستند يمكن أن يحتوي على:

- Logo.
- Shop Name.
- Customer.
- Products.
- Serial.
- Prices.
- Discount.
- Total.
- Paid.
- Remaining.
- Installment information.

---

# 91. Document Numbering

كل نوع Document له Numbering مستقل.

أمثلة:

```text
INV-2026-000125
REC-2026-000152
RET-2026-000021
PUR-2026-000087
CON-2026-000044
EXP-2026-000012
```

الأرقام:

- Sequential.
- Unique.
- Immutable.
- لا يستطيع الموظف تعديلها.

---

# 92. Notifications

In-App Notification Center.

أمثلة:

- Due Installment.
- Overdue.
- Credit Limit exceeded.
- Approval Required.
- Low Stock.
- Purchase discrepancy.
- Inventory variance.
- Subscription expiry.
- Override.
- Transfer awaiting review.

كل Notification:

- Read.
- Unread.
- Link to source.

---

# 93. External Notifications

Architecture جاهزة لـ:

- WhatsApp.
- SMS.
- Email.

لكن Providers تكون Optional/Feature Flags.

Templates قابلة للتعديل.

أمثلة:

- Payment Reminder.
- Payment Confirmation.
- Overdue Reminder.
- Promise Reminder.
- Delivery Reminder.
- Warranty Notification.

---

# 94. Manager Dashboard

Dashboard يجب أن تكون Command Center.

تعرض:

- Sales.
- Product Profit.
- Financing Revenue.
- Expected Collections.
- Collections Today.
- Overdue.
- Overdue Amount.
- Upcoming Installments.
- Customers over Credit Limit.
- High Risk Customers.
- Pending Approvals.
- Low Stock.
- Inventory.
- Treasury.
- Expenses.
- Returns.
- Purchase cost changes.

---

# 95. Role Dashboards

## Sales

- New Sale.
- Customers.
- Products.
- Installments.
- Pending Sales.

## Cashier

- Sales.
- Collections.
- Treasury.
- Shift.

## Warehouse

- Inventory.
- Receiving.
- Delivery.
- Stock Count.
- Serial.

## Collections

- Due.
- Overdue.
- Promise to Pay.
- Payments.

## Accountant

- Accounts.
- Journals.
- Treasury.
- Suppliers.
- Customers.
- Financial Reports.

## Manager

كل شيء حسب الصلاحية.

## Platform Owner

SaaS Control Center.

---

# 96. Quick Actions

يجب توفير:

- New Sale.
- Collect Payment.
- New Customer.
- Receive Goods.
- Purchase Request.
- Expense.
- Return.
- Stock Count.

الهدف تقليل التنقل بين الشاشات.

---

# 97. Global Search

Search يجب أن يدعم:

- Customer Name.
- Customer Phone.
- Product Name.
- Product Code.
- Barcode.
- Brand.
- Model.
- Serial Number.
- Invoice Number.
- Contract Number.
- Receipt Number.

---

# 98. Reporting Center

التقارير الأساسية:

## Sales

- Sales by day.
- Sales by period.
- Sales by employee.
- Cash vs Installment.
- Product sales.

## Profit

- Product Profit.
- Financing Revenue.
- Gross Profit.
- Expenses.
- Net Profit.

## Installments

- Active Contracts.
- Due.
- Overdue.
- Collections.
- Early Settlement.
- Restructuring.

## Customers

- Outstanding.
- Overdue.
- Risk.
- Credit utilization.
- Top customers.

## Suppliers

- Purchases.
- Outstanding.
- Aging.
- Price changes.
- Supplier performance.

## Inventory

- Current Stock.
- Low Stock.
- Slow Moving.
- Best Selling.
- Damaged.
- Serialized Items.
- Stock Adjustments.

## Employees

- Sales.
- Collections.
- Discounts.
- Cancellations.
- Returns.
- Overrides.

## Treasury

- Opening.
- Closing.
- Collections.
- Expenses.
- Transfers.
- Variances.

## Governance

- Audit.
- Overrides.
- Cancellations.
- Adjustments.
- Reversals.
- Failed attempts.
- Pending approvals.

---

# 99. Accounting Periods

يجب دعم:

- Open Period.
- Closed Period.

Closed period transactions تحتاج صلاحية خاصة.

---

# 100. Security

Security requirements:

- Supabase Auth.
- JWT validation.
- Server-side authorization.
- RLS.
- Tenant ID validation.
- Role checks.
- Permission checks.
- Input validation with Zod.
- Secure file access.
- Audit Logging.
- No client-side-only authorization.

---

# 101. API / Server Functions

Business operations يجب أن تتم من خلال Server-side functions المناسبة.

يجب ألا يعتمد النظام على:

> Frontend-only mutations.

كل Mutation حساسة يجب أن:

1. Authenticate.
2. Resolve Tenant.
3. Authorize Role/Permission.
4. Validate Input.
5. Validate Business Rules.
6. Execute Transaction.
7. Write Audit.
8. Return safe result.

---

# 102. Transactional Integrity

العمليات التي تؤثر على أكثر من جزء يجب تنفيذها Atomic قدر الإمكان.

مثال بيع:

- Invoice.
- Inventory.
- Serial.
- Customer receivable.
- Treasury.
- Accounting.
- Audit.

يجب ألا يحدث أن يتم خصم المخزون وتفشل العملية المالية بدون معالجة.

---

# 103. Error Handling

يجب الحفاظ على:

> Existing 5-layer SSR Error Handling

وأي Error يجب أن:

- لا يكشف بيانات حساسة.
- يسجل التفاصيل اللازمة داخليًا.
- يعطي المستخدم رسالة مفهومة.
- لا يؤدي إلى Corrupt State.

---

# 104. UX Requirements

المبدأ:

> Simple UI, Powerful Backend.

الموظف يجب ألا يحتاج معرفة:

- Accounting.
- RLS.
- Risk Algorithms.
- Journal Entries.
- Tenant architecture.

مثال بيع بالتقسيط:

```text
Customer
↓
Product
↓
Installment
↓
Down Payment
↓
Duration
↓
Confirm
```

والنظام يتولى خلفيًا:

- Credit Check.
- Risk.
- Limit.
- Finance.
- Schedule.
- Approval.
- Contract.
- Inventory.
- Accounting.
- Audit.

---

# 105. Approval Engine

Approval system يجب أن يكون Configurable.

أمثلة:

- Discount > X.
- Down Payment < Minimum.
- Credit Limit exceeded.
- Overdue customer.
- Inventory adjustment.
- Return.
- Restructure.
- Early settlement.
- Expense > threshold.
- Financial adjustment.

---

# 106. Segregation of Duties

النظام يجب أن يدعم فصل المهام.

مثال:

```text
Purchase Request
↓
Manager Approval
↓
Warehouse Receipt
↓
Accounting / Payment
```

ولا يجب السماح لمستخدم واحد بتنفيذ كل الخطوات الحساسة إذا كانت السياسة تمنع ذلك.

---

# 107. SaaS Support Access

Platform Owner يمكنه استخدام:

> Support Access / Impersonation

لكن بشروط:

- اختيار Tenant.
- اختيار سبب.
- تسجيل العملية.
- Session محددة.
- كل العمليات Audit.
- عدم إخفاء هوية Support Access.

ويجب أن يكون الاستخدام لأغراض الدعم وليس وسيلة لتجاوز Tenant Security.

---

# 108. SaaS Audit

Platform Owner يجب أن يرى:

- Tenant creation.
- Subscription changes.
- Suspension.
- Renewal.
- Feature changes.
- Support Access.
- Sensitive configuration changes.

---

# 109. Backup / Recovery

يجب تصميم النظام بحيث تكون بيانات Tenant قابلة للحماية والاستعادة وفق سياسة البنية التحتية.

لا يتم حذف بيانات Tenant عند:

- انتهاء الاشتراك.
- Suspension.
- تعطيل Feature.

---

# 110. Tenant Data Export

Architecture يجب أن تسمح مستقبلًا بإخراج بيانات Tenant الخاصة به بشكل منظم.

هذه ليست عملية Frontend عادية، ويجب أن تكون محمية بالصلاحيات.

---

# 111. Data Integrity Rules

قواعد إلزامية:

### Never Hard Delete

لـ:

- Financial transactions.
- Sales.
- Purchases.
- Collections.
- Installment Contracts.
- Inventory Movements.
- Accounting Entries.

### Use Instead

- Cancel.
- Reverse.
- Adjustment.
- Archive.
- Deactivate.

---

# 112. Status-Based Architecture

يجب استخدام Status Machines بدل Boolean fields قدر الإمكان في العمليات المعقدة.

الأهم:

### Invoice

```text
Draft
Pending Approval
Approved
Payment Pending
Confirmed
Delivered
Completed
Cancelled
```

### Contract

```text
Draft
Pending Approval
Active
Partially Paid
Overdue
Restructured
Settled
Settled Early
Cancelled
```

### Installment

```text
Scheduled
Due
Partially Paid
Paid
Overdue
Waived
Rescheduled
```

### Collection

```text
Pending
Under Review
Approved
Posted
Rejected
Reversed
```

### Transfer Proof

```text
Pending
Verified
Rejected
```

---

# 113. Configuration

Settings يجب أن تكون قابلة للإدارة من Manager/Owner حسب الصلاحية.

أهم Settings:

- Installment Plans.
- Finance Rates.
- Minimum Down Payment.
- Grace Period.
- Credit Limit.
- Credit Hold Days.
- Late Fee.
- Discount Limits.
- Return Policy.
- Inventory Min/Max.
- Costing Method.
- Numbering.
- Treasury.
- Notification Providers.
- Approval Rules.

---

# 114. Important Business Rule — Historical Snapshot

أي إعداد يؤثر على عملية مالية يجب حفظ Snapshot منه داخل العملية.

مثال:

إذا كانت خطة 12 شهر:

> 40%

ثم أصبحت:

> 35%

العقود القديمة التي استخدمت 40% يجب أن تظل:

> 40%

ولا تتغير.

ينطبق ذلك على:

- Finance Rate.
- Down Payment Policy.
- Return Policy.
- Pricing.
- Relevant business rules.

---

# 115. Current Branch Model

V1:

> One Tenant = One Shop / One Branch / One Main Warehouse

لكن Database Model يجب ألا يمنع التوسع مستقبلًا إلى:

- Multiple Branches.
- Multiple Warehouses.

لا يتم عرض هذا التعقيد للمستخدم في V1 إلا عند الحاجة.

---

# 116. Delivery & Installation Separation

التوصيل والتركيب لا يدخلان تلقائيًا في:

> Installment Principal

إلا إذا تم إنشاء Financial Transaction صريحة وفق سياسة المحل.

في النسخة الحالية:

> Delivery = Separate Service
> Installation = Separate Service

---

# 117. Tax Scope

لا يوجد Tax Engine في V1.

أي حقول Tax مستقبلية يجب ألا تغير الحسابات الحالية.

Tax/E-Invoice يمكن إضافتها كتحديث مستقل مستقبلًا.

---

# 118. Recommended Core Database Entities

الـDatabase يجب أن تكون قابلة للتوسع، وتشمل على الأقل:

```text
tenants
tenant_settings
subscriptions
plans
plan_features
tenant_features
users
roles
permissions
role_permissions
user_roles

customers
customer_documents
customer_guarantors
guarantors
customer_credit_profiles
customer_risk_scores

products
product_categories
brands
units
unit_conversions
product_prices
product_images
product_serials
warranties
warranty_claims

inventory
inventory_movements
stock_counts
stock_count_items
inventory_adjustments

sales
sale_items
sale_serials
sale_payments
sale_discounts

installment_plans
installment_contracts
installment_contract_items
installments
installment_payments
payment_allocations
restructuring_events
early_settlements
promise_to_pay

suppliers
supplier_products
supplier_price_history
purchase_requests
purchase_orders
goods_receipts
goods_receipt_items
purchase_invoices
purchase_items
supplier_payments
supplier_returns

treasuries
bank_accounts
wallet_accounts
financial_accounts
financial_movements
shifts
daily_closes
monthly_closes
expenses

chart_of_accounts
journal_entries
journal_entry_lines
accounting_periods

returns
return_items
exchanges
exchange_items
financial_adjustments
reversals

delivery_orders
delivery_items
installation_requests
service_requests

notifications
notification_templates

documents
document_links

audit_logs
approval_requests
approval_actions
overrides

support_tickets
support_access_sessions

reports / reporting views
```

الأسماء النهائية للجداول يمكن تحسينها أثناء التصميم، لكن الـDomain Model يجب ألا يفقد هذه المفاهيم.

---

# 119. Database Rules

كل Business table متعلق بـTenant يجب أن يحتوي على:

> `tenant_id`

عند الحاجة.

ويجب إنشاء Indexes مناسبة على:

- tenant_id.
- customer_id.
- product_id.
- serial_number.
- invoice_number.
- contract_number.
- status.
- due_date.
- created_at.

Composite indexes يجب استخدامها عند الحاجة إلى Queries شائعة مثل:

```text
tenant_id + status
tenant_id + due_date
tenant_id + customer_id
tenant_id + product_id
```

---

# 120. RLS Requirements

RLS يجب أن تمنع:

- Tenant A reading Tenant B.
- Tenant A updating Tenant B.
- Tenant A deleting Tenant B.
- Unauthorized user accessing another user's restricted data.

RLS policies يجب أن تكون جزءًا أساسيًا من Database implementation.

---

# 121. File Storage Isolation

Supabase Storage يجب أن يستخدم Tenant-aware paths/policies.

مثال Conceptual:

```text
/{tenant_id}/customers/...
/{tenant_id}/contracts/...
/{tenant_id}/payments/...
/{tenant_id}/warranty/...
```

لا يسمح لمستخدم Tenant بتحميل أو قراءة ملفات Tenant آخر.

---

# 122. Performance

POS يجب أن يكون سريعًا.

يجب تجنب تحميل بيانات ضخمة عند فتح شاشة البيع.

استخدام:

- TanStack Query.
- Pagination.
- Server-side filtering.
- Indexed queries.
- Lazy loading.
- Caching المناسب.

التقارير الثقيلة لا يجب أن تعطل POS.

---

# 123. Responsive Design

واجهة النظام يجب أن تعمل على:

- Desktop.
- Laptop.
- Tablet.

والـPOS يكون مناسبًا للاستخدام السريع.

---

# 124. Arabic / RTL

اللغة الأساسية:

> Arabic

يجب أن يكون:

```html
<html lang="ar" dir="rtl"></html>
```

مع دعم English architecture مستقبلًا.

كل:

- Forms.
- Tables.
- Dialogs.
- Reports.
- Receipts.

يجب أن يدعم RTL بشكل صحيح.

---

# 125. Accessibility / Usability

يجب استخدام:

- Clear labels.
- Keyboard-friendly POS.
- Consistent buttons.
- Confirmation dialogs للعمليات الحساسة.
- Error messages مفهومة.
- Status badges.
- Warning banners.

---

# 126. No Silent Operations

أي عملية مؤثرة يجب أن تكون مرئية في سجل مناسب.

مثلاً:

لا يحدث:

> Balance changed from 10,000 → 8,000

بدون معرفة السبب.

بل:

> Adjustment #123
> Amount: -2,000
> Reason: ...
> User: ...
> Approved by: ...

---

# 127. Acceptance Criteria — Core

النظام لا يعتبر جاهزًا إذا:

- Tenant isolation غير مضمون.
- RLS غير موجود.
- الموظف يستطيع تعديل رصيد عميل مباشرة.
- الموظف يستطيع حذف فاتورة.
- الموظف يستطيع تغيير Receipt Number.
- Contract قديم يتغير بسبب تعديل Finance Plan.
- Inventory يتغير بدون Movement.
- Serial يمكن بيعه مرتين.
- Payment Proof يتحول Paid بدون Approval.
- Return يحذف العقد الأصلي.
- Restructure يمسح الجدول القديم.
- Financial transaction يمكن حذفها.
- Override لا يظهر في Audit.

---

# 128. Installment Engine Acceptance Tests

يجب اختبار المثال التالي:

Principal:

> 15,000

Plan:

> 12 Months

Rate:

> 40%

Finance:

> 6,000

Total:

> 21,000

Installments:

> 1,750 × 12

إذا تغيرت الخطة لاحقًا إلى 35%، العقد القديم يظل:

> 40%

---

# 129. Security Acceptance Tests

يجب اختبار:

### Tenant Isolation

User A:

> Tenant A

يحاول طلب:

> Tenant B Data

النتيجة:

> Access Denied.

حتى لو تم تعديل Request يدويًا.

### Permission

Cashier يحاول:

> Change Customer Balance

النتيجة:

> Permission Denied.

### Audit

Manager يعمل Override.

النتيجة:

> Override موجود في Audit + Overrides Report.

---

# 130. Development Rules for Coding Agent

Claude Code / Codex يجب أن يلتزم بالتالي:

1. لا يغير Stack الأساسي بدون سبب قوي وموافقة.
2. لا يخترع Business Rules غير مذكورة.
3. لا يضع Business Logic حساس في Frontend فقط.
4. كل Financial Mutation يجب أن تكون Server-side.
5. كل Tenant Query يجب أن تكون Tenant-aware.
6. كل Sensitive Mutation يجب أن تكون Audited.
7. لا يستخدم Hard Delete للعمليات الحساسة.
8. لا يغير الحسابات التاريخية عند تغيير Settings.
9. لا يختصر Installment Engine إلى مجرد UI calculations.
10. لا يضع بيانات Demo داخل Production logic.
11. لا يترك TODOs في العمليات الأساسية.
12. لا يغير Database Schema بشكل عشوائي.
13. كل Migration يجب أن تكون واضحة وقابلة للتطبيق.
14. كل Business Rule يجب أن يكون لها Test.
15. كل Critical Workflow يجب أن يكون له Integration Test.

---

# 131. Implementation Priority

## Phase 1 — Foundation

- Auth.
- Tenant.
- RLS.
- Roles.
- Permissions.
- Audit.
- Settings.
- Database foundation.

## Phase 2 — Products & Inventory

- Products.
- Categories.
- Brands.
- Units.
- Serial.
- Inventory.
- Stock Count.
- Costing.

## Phase 3 — Customers & Sales

- Customers.
- Customer 360.
- POS.
- Cash Sales.
- Pricing.
- Discounts.

## Phase 4 — Installments

- Plans.
- Finance Engine.
- Contracts.
- Schedules.
- Credit Limit.
- Risk.
- Collections.
- Promise to Pay.
- Overdue.
- Restructure.
- Early Settlement.

## Phase 5 — Purchasing

- Suppliers.
- Purchase Request.
- PO.
- Receiving.
- Purchase Invoice.
- Supplier Payments.
- Supplier Returns.
- Price Intelligence.

## Phase 6 — Finance

- Treasury.
- Shifts.
- Expenses.
- Accounting.
- Journals.
- Closing.

## Phase 7 — After Sales

- Returns.
- Exchanges.
- Delivery.
- Installation.
- Warranty.

## Phase 8 — Reports & Notifications

- Dashboards.
- Reports.
- Notifications.
- WhatsApp/SMS architecture.

## Phase 9 — SaaS Control Center

- Tenants.
- Plans.
- Subscriptions.
- Feature Flags.
- Renewal.
- Suspension.
- Support Access.
- Platform Audit.

---

# 132. Final Product Principle

هذا النظام ليس مجرد POS.

إنه:

> **Installment-focused ERP SaaS for Appliance & Household Retail.**

القيمة الأساسية للنظام:

### البيع

سهل وسريع.

### التقسيط

محكوم ومحسوب بدقة.

### التحصيل

واضح ويومي.

### المخزون

كل حركة مفهومة.

### السيريال

كل جهاز له تاريخ كامل.

### الأموال

كل جنيه له مصدر ووجهة.

### الرقابة

لا توجد عملية حساسة بدون أثر.

### SaaS

كل محل مستقل وآمن.

### UX

الموظف لا يشعر بتعقيد النظام.

---

# 133. Non-Negotiable Rules

يجب اعتبار القواعد التالية Mandatory:

1. No cross-tenant access.
2. RLS is mandatory.
3. Server-side authorization is mandatory.
4. No hard delete for financial transactions.
5. No direct customer balance editing.
6. No silent inventory adjustment.
7. No duplicate serial sale.
8. No unverified transfer counted as payment.
9. No unauthorized discount.
10. No unauthorized installment override.
11. No historical contract recalculation after plan changes.
12. No deletion of original contract during restructure.
13. No deletion of original financial movement during reversal.
14. No editable immutable document numbers.
15. All sensitive overrides must be audited.
16. All critical financial mutations must be atomic.
17. All tenant data must remain isolated.
18. Delivery and Installation are separate services in V1.
19. Taxes are outside V1.
20. The system must remain simple for daily employees.

---

# 134. Definition of Done

النسخة لا تعتبر Production Ready إلا بعد:

- Database migrations complete.
- RLS tested.
- Authentication tested.
- Roles/Permissions tested.
- Tenant isolation tested.
- POS tested.
- Inventory tested.
- Serial lifecycle tested.
- Installment calculations tested.
- Credit rules tested.
- Collection tested.
- Payment proof tested.
- Returns tested.
- Exchange tested.
- Purchasing tested.
- Supplier balances tested.
- Treasury tested.
- Accounting tested.
- Daily Close tested.
- Monthly Close tested.
- Audit tested.
- Override tested.
- Reports tested.
- SaaS Control Center tested.
- Subscription lifecycle tested.
- Backup/recovery strategy verified.
- Production build successful.
- Cloudflare deployment successful.
- No critical TypeScript errors.
- No critical runtime errors.
- No unauthorized tenant access.
- No critical financial calculation errors.

---

# END OF REQUIREMENTS

**Implementation instruction:**

Treat this document as the authoritative business and technical specification for V1.

Where a detail is not explicitly defined here, do not invent a financially sensitive rule. Use a configurable setting where appropriate, or clearly mark the decision as requiring confirmation.

Prioritize data integrity, tenant isolation, auditability, financial correctness, and simple UX.
