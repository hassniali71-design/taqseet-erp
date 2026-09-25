# منفذ فعليا - مختبر بـ Playwright

**Phase 0 Bootstrap:** سكافولد كامل
**دخول/لوحة تحكم Mock:** /login -> /dashboard

**Phase 1 Foundation:**
- /settings - اعدادات المحل (طريقة تكلفة، حد خصم، اقل مقدم، Grace، Credit Hold Days، غرامة، فترة ارجاع) - TenantSettings
- /users - عرض + انشاء بدور + تفعيل/تعطيل
- /audit - قراءة فقط عبر recordAudit
- Roles/Permissions في data layer بلا UI

**Phase 2 Products & Inventory:**
- /products list+add+edit + getProductStock
- /products/$id (ملف products_.$id.tsx - لاحظ _ ) - تفاصيل + سيريالات + استلام كمية عبر receiveStock + سجل حركة
- /stock-count - جرد غير سيريال فقط
- Serial lifecycle: available/sold/returned/inspection/damaged - منع تكرار
- Inventory Ledger: InventoryMovement - getProductStock المصدر الوحيد
- Categories/Brands قوائم مدارة (ProductCategory/Brand + register... idempotent) - نص عادي في Product - migration 0009
- ناقص: Multiple Units, تسعير خاص

**البنية المشتركة لكل صفحة محمية:**
- AppSidebar, use-session (useSession/useRequireSession)
- نمط الصفحة: useRequireSession -> if (!session) return null -> actorUserId/tenantId منفصلين -> flex min-h-screen + AppSidebar + main
- ⚠ ملاحظة راوتنج: لو foo.tsx موجود، تفاصيله لازم foo_.$id.tsx مش foo.$id.tsx والا TanStack يعتبره Layout

**Phase 3 Customers & Sales:**
- /customers list+add+edit + credit_limit
- /customers/$id (customers_.$id.tsx) - 360: مشتريات، فواتير، حد ائتمان، ضامنون §15، سجل مشتريات
- POS نقدي /sales/new - عميل/نقدي -> اصناف (كمية او سيريال واحد لكل سيريال) -> خصم % محدود بحد الموظف -> تأكيد
- createSale: يتحقق (نشط، مخزون، سيريال متاح ومش مكرر في الفاتورة) -> sold + Movement sale + رقم INV-YYYY-NNNNNN + Audit
- /sales/$id - ايصال
- Sale.items متداخلة داخل المستند نفسه (مش جدول منفصل)
- State Machine مبسطة: نقدي -> completed مباشرة
- Risk Score حقيقي getCustomerRiskAssessment: دفع في ميعاد/بعد، اقساط متأخرة، وعود فاشلة - 4 مستويات + RiskBadge

**Phase 4 Installments:**
- finance-engine.ts - calculateFinance(principal, ratePct): Finance = Principal x Rate مرة واحدة + generateSchedule(total, months, startDate) - قسط اخير يمتص التقريب. اختبار: scripts/verify-finance-engine.ts (15,000@40%/12 = 21,000 / 12x1750)
- /settings خطط تقسيط: اضافة مدة+نسبة + ايقاف/تفعيل بلا حذف - تعطيل لا يغير عقود قديمة (Snapshot §114)
- /sales/new-installment - عميل مسجل الزامي + installment_price + حد ائتمان + Credit Hold + مقدم بحد ادنى min_down_payment_pct + خطة + معاينة جدول
- createInstallmentContract: عميل نشط، خطة نشطة، Credit Hold §56، حد مقدم، Credit Check (Available = limit - Exposure §57) -> principal = cash - down -> finance-engine -> CON-YYYY-NNNNNN + اقساط + مخزون
- /contracts/$id (contracts_.$id.tsx) - بيانات + جدول اقساط بحالة محسوبة وقت العرض getEffectiveInstallmentStatus/getDaysOverdue + تحصيل + سجل تحصيلات + تسوية مبكرة/اعادة هيكلة/وعد + سجل وعود/هيكلة
- collectPayment: يرفض اكبر من المتبقي، Oldest-Due-First، ايصال REC-YYYY-NNNNNN، يحدث حالة partial/settled
- /collections - Workbench: عقود مفتوحة، قسط قادم، فلاتر، تحصيل مباشر - رسالة نجاح على مستوى الصفحة
- Overdue/Credit Hold Computed-on-read
- Promise to Pay: recordPromise pending -> kept لو دفعة قبل تاريخ الوعد، failed لو فات - getEffectivePromiseStatus
- Early Settlement: earlySettleContract عبر collectPayment + تمييز settled_early
- Restructuring: restructureContract لا يعدل اصلي - متبقي -> rescheduled + اقساط جديدة + RestructureEvent - اتحقق: 6 قديمة rescheduled, 9 جديدة
- Migration 0005

**Phase 5 Purchasing:**
- /suppliers list+add+edit بلا حذف - getSupplierBalance
- /purchases/new - مورد نشط -> اصناف بسعر تكلفة + حقول سيريال ديناميكية -> /purchases/$id
- createPurchase: الطلب والاستلام مدموجين - يتحقق (مورد نشط، منتج نشط، عدد سيريالات مطابق، لا مكرر) -> نفس receiveStock - رقم PUR-YYYY-NNNNNN
- تحديث سعر التكلفة حسب costing_method: last_purchase يستبدل، average متوسط مرجح (3x12000 +2x15000=13200 اتحقق)، fifo = average مؤقتا
- /suppliers/$id (suppliers_.$id.tsx) - 360: اجمالي، اوامر، رصيد، دفعة recordSupplierPayment يرفض اكبر من الرصيد، سجل
- Migration 0006

**Phase 6 Finance:**
- خزينة: حسابان "الرئيسية" و"الكاشير" - رصيد محسوب من TreasuryMovement getAccountBalance - postTreasuryMovement داخلية تتنادى من createSale/createInstallmentContract/collectPayment (كاشير) و recordSupplierPayment/recordExpense (رئيسية)
- وردية كاشير: openShift/closeShift - متوقع = افتتاحي + حركات الحساب من وقت الفتح، فرق لازم سبب - /treasury فتح/اقفال + سجل + حركة
- اقفال يومي: محسوب وقت العرض فقط من حركات الخزينة - /treasury قسم اقفال
- مصروفات: recordExpense - فوق expense_approval_threshold -> needs_approval - approveExpense جديدة (approved_by/at/note + Audit) - نطاقها رقابي بعد الصرف، حجب فعلي مؤجل §105 - /expenses + زرار اعتماد
- محاسبة: دليل 7 حسابات (1000 خزينة، 1100 عملاء، 1200 مخزون، 2000 موردون، 3000 ايرادات مبيعات، 3100 ايرادات تمويل، 5000 مصروفات) - postJournalEntry الوحيدة تنشئ JournalEntry - تتاكد مدين=دائن - قيود تلقائية: بيع نقدي، عقد تقسيط (فصل مبيعات عن تمويل §75)، تحصيل، امر شراء (التزام مورد)، دفعة مورد/مصروف - /accounting قراءة فقط
- Migration 0007 + ملاحظة Playwright getByRole

**Phase 7 After Sales:**
- نطاق: ارجاع واستبدال للبيع النقدي فقط - تقسيط مؤجل
- ارجاع: createReturn - يتحقق (صنف في الفاتورة، كمية متبقية، سيريال sold، فترة return_period_days) -> سيريال -> inspection مش available (اتحقق)، غير سيريال يرجع فورا - RET-YYYY-NNNNNN + استرداد نقدي + قيد - زرار ارجاع وفورم كمية على /sales/$id + سجل
- استبدال: createExchange - مركب: يرجع + يبيع جديد بسعر نقدي + فرق نقدي فقط - /exchanges/new بحث برقم فاتورة
- توصيل: scheduleDelivery/advanceDeliveryStatus احادي scheduled->out_for_delivery->delivered منفصلة عن Sale §133 قاعدة 11 - /deliveries
- ضمان: getWarrantyInfo بدون كيان مخزن - محسوب من ProductSerial + Product.warranty_months + تاريخ البيع - /warranty بحث سيريال
- Migration 0008

**Phase 8 Reports & Notifications:**
- لا كيانات جديدة - Computed
- /dashboard ارقام حقيقية: مبيعات اليوم، مستحق اليوم، متأخرات، رصيد كاشير، عملاء/عقود، تحت الحد، توصيلات - getSales/getInstallmentContracts/getInstallments/getEffective.../getAccountBalance/getProductStock - قسم "قرارات تحتاج انتباه"
- /reports 4 تبويبات: مبيعات بفلتر تاريخ، عقود، كشف حساب عميل (فواتير+عقود+تحصيلات+مرتجعات زمني وصافي)، اصناف بطيئة
- Notification Center: getNotifications - قسط مستحق/متأخر، وعد فشل، مخزون منخفض، مصروف يحتاج اعتماد - Computed + markNotificationRead/markAllNotificationsRead عبر KEYS.readNotificationIds - معرف مشتق inst_due_${id} يتغير مع الحالة - /notifications شارة لون + غير مقروء + تعليم كمقروء/الكل
- §93 Feature Flag: whatsapp_notifications_enabled في /settings - تجهيز معماري فقط، لا ارسال فعلي

**Phase 9 SaaS Control Center:**
- /platform - غرفة تحكم (platform.tsx) - Platform Owner فقط is_platform_owner - seed platform@hesba.local - PLATFORM_TENANT_ID="platform" مستبعد من getManagedTenants
- انشاء Tenant: provisionTenant: Tenant + TenantSettings + 8 Roles بـ genId() فريدة لكل تينانت (مش role_${name} عشان لا يتصادم) + ربط owner بكل الصلاحيات + مستخدم Owner باسورد عشوائي generateTempPassword + اشتراك 30 يوم - يعرض مرة واحدة بزرار نسخ
- تفعيل/تعليق setTenantStatus وتجديد extendTenantSubscription (من تاريخ الانتهاء لو ساري او من الان لو منتهي)
- عزل بيانات: scopeToTenant<T>(rows, tenantId) هيلبر + 26 دالة get*() بباراميتر tenantId? اختياري - بدون باراميتر = كامل بلا فلترة - آمن للـMutations - routes تمرر session.tenant_id - getWarrantyInfo tenantId الزامي (ثغرة عبر-تينانت اتقفلت)
- باگ حرج اتصلح: sed لتحويل DEMO_TENANT_ID لـ getCurrentTenantId() طال دوال seed - كان يخطف بيانات الديمو - اتصلح بارجاع seed لـ DEMO_TENANT_ID حرفي
- اتحقق 10/10 + فحوصات اضافية: تينانت جديد صفر بيانات، عملاء الديمو ما يتأثروش، Platform تشوف الاتنين
- Support Access: /platform/support/$tenantId (platform_.support.$tenantId.tsx) - سبب الزامي قبل الدخول (يتسجل في Audit التينانت المستهدف)، قراءة فقط (عملاء/منتجات/مبيعات/عقود/متأخرات/رصيد) + اخر 10 دخول دعم
- لا ربط Supabase حقيقي بعد - العزل Application-layer فوق Mock - عند الربط RLS طبقة ثانية

Migrations: 0001 foundation + 0002 customers/products + 0003 inventory + 0004 sales + 0005 installments + 0006 purchasing + 0007 finance + 0008 after_sales - كلها RLS جاهزة غير مطبقة. لا migration جديد لـ Phase 8.
