import { createClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";

import { getSupabaseAdmin, resolveServerCaller } from "@/lib/supabase-admin";

/** حذف عميل نهائيًا (بند 72) — للمالك فقط، من الإعدادات.
 *
 * طبقات الحماية بالترتيب، كلها على السيرفر (مفيش حاجة منها بتعتمد على المتصفح):
 * 1) `resolveServerCaller`: الجلسة حقيقية، والمحل بيتجاب من حساب المستخدم نفسه مش من الطلب.
 * 2) المستدعي لازم يكون عنده دور `owner` في نفس المحل.
 * 3) كلمة سر المالك بتتأكد بتسجيل دخول حقيقي على Supabase Auth من السيرفر (client منفصل من غير
 *    حفظ جلسة) — مش مقارنة في الواجهة، ومبتتسجلش ولا بتتطبع في أي log أو رسالة خطأ.
 * 5) الحذف نفسه دالة Postgres واحدة (migration 0027، بتستبدل 0026) جوه transaction واحدة — يا كله
 *    يتمسح يا مفيش حاجة — بتمسح العميل وكل عقوده وتحصيلاته وأثرها المالي والمخزني (قرار المالك)،
 *    وبتعيد فحص إن المستدعي owner وكل حذف متقيد بمحله بس.
 * أي محاولة مرفوضة بسبب كلمة سر غلط بتتسجل في audit_logs (من غير كلمة السر). */
export const deleteCustomerPermanentlyServer = createServerFn({ method: "POST" })
  .validator((input: { accessToken: string; customerId: string; password: string }) => input)
  .handler(async ({ data }) => {
    const caller = await resolveServerCaller(data.accessToken);
    const admin = getSupabaseAdmin();

    const { data: ownerRole } = await admin
      .from("roles")
      .select("id")
      .eq("tenant_id", caller.tenantId)
      .eq("name", "owner")
      .maybeSingle();
    const { data: assignment } = ownerRole
      ? await admin
          .from("user_roles")
          .select("role_id")
          .eq("user_id", caller.userId)
          .eq("role_id", ownerRole["id"] as string)
          .maybeSingle()
      : { data: null };
    if (!assignment) throw new Error("الحذف النهائي للعملاء متاح لمالك المحل بس");

    const { data: customer } = await admin
      .from("customers")
      .select("id, code, tenant_id")
      .eq("id", data.customerId)
      .maybeSingle();
    if (!customer || customer["tenant_id"] !== caller.tenantId) {
      throw new Error("العميل غير موجود");
    }

    const url = process.env["SUPABASE_URL"] ?? import.meta.env["VITE_SUPABASE_URL"];
    const anonKey = process.env["SUPABASE_ANON_KEY"] ?? import.meta.env["VITE_SUPABASE_ANON_KEY"];
    if (!url || !anonKey) throw new Error("إعدادات Supabase ناقصة على السيرفر");

    const { data: authUser } = await admin.auth.getUser(data.accessToken);
    const email = authUser.user?.email;
    if (!email) throw new Error("جلسة غير صالحة — سجّل دخول تاني");
    const verifier = createClient(url as string, anonKey as string, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: passwordError } = await verifier.auth.signInWithPassword({
      email,
      password: data.password,
    });
    if (passwordError) {
      await admin.from("audit_logs").insert({
        tenant_id: caller.tenantId,
        user_id: caller.userId,
        action: "customer.delete_permanent_denied",
        entity: "customers",
        entity_id: data.customerId,
        reason: "كلمة سر المالك غير صحيحة",
      });
      throw new Error("كلمة السر غير صحيحة");
    }
    // الجلسة اللي اتعملت للتحقق بس — بنقفلها هي بس (local)، من غير ما نطلّع المالك من أجهزته.
    await verifier.auth.signOut({ scope: "local" });

    const asUser = createClient(url as string, anonKey as string, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${data.accessToken}` } },
    });
    const { data: result, error } = await asUser.rpc("delete_customer_permanently", {
      p_customer_id: data.customerId,
      p_reason: "حذف نهائي بواسطة المالك",
    });
    if (error) throw new Error(translateDeleteError(error.message, error.code));
    return result as {
      contracts_deleted: number;
      receipts_deleted: number;
      received_total: number;
      treasury_movements_deleted: number;
      serials_returned: number;
    };
  });

function translateDeleteError(message: string, code?: string): string {
  if (code === "PGRST202" || code === "42883" || message.includes("delete_customer_permanently")) {
    return "خاصية الحذف النهائي لسه مش متفعّلة على قاعدة البيانات — لازم migration 0026 يتطبّق على Supabase الأول";
  }
  if (message.includes("HAS_RECEIPTS")) {
    return "مينفعش يتحذف: على عقوده تحصيلات مسجّلة (سجل مالي لازم يفضل). استخدم «إيقاف» العميل بدل الحذف.";
  }
  if (message.includes("HAS_OPEN_CONTRACTS")) {
    return "مينفعش يتحذف: عنده عقود لسه مش ملغية. ألغِ العقد الأول من صفحة العقد (الإلغاء بيرجّع المخزون والخزينة)، وبعدها احذف.";
  }
  if (message.includes("NOT_OWNER")) return "الحذف النهائي للعملاء متاح لمالك المحل بس";
  if (message.includes("CUSTOMER_NOT_FOUND")) return "العميل غير موجود";
  if (message.includes("REASON_REQUIRED")) return "اكتب سبب الحذف";
  return `فشل الحذف ومفيش أي بيانات اتمسحت: ${message}`;
}
