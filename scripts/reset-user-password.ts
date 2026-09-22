/**
 * One-off admin utility: force-set a new password for an existing real Supabase Auth account,
 * looked up by its business `users.email` — no email/SMTP involved at all, since this calls the
 * Admin API directly (`auth.admin.updateUserById`) instead of the self-service forgot-password
 * email flow (src/routes/forgot-password.tsx). Use this when you know exactly which account
 * needs a new password right now and can't wait on (or haven't finished setting up) SMTP.
 *
 * Usage: bun run scripts/reset-user-password.ts <email> <new-password>
 * Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in your local .env, same as every other script
 * here — this bypasses RLS/Auth self-service on purpose via the service role key. Never run this
 * against an account that isn't yours to reset.
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env["SUPABASE_URL"];
const SUPABASE_SERVICE_ROLE_KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"];
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY غير موجودين في .env");
  process.exit(1);
}

const [, , emailArg, passwordArg] = process.argv;
if (!emailArg || !passwordArg) {
  console.error("الاستخدام: bun run scripts/reset-user-password.ts <email> <new-password>");
  process.exit(1);
}
const email = emailArg.trim().toLowerCase();
const newPassword = passwordArg;
if (newPassword.length < 6) {
  console.error("كلمة السر لازم تكون 6 أحرف على الأقل.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data: userRow, error: userError } = await supabase
    .from("users")
    .select("id, auth_user_id, full_name, is_platform_owner")
    .eq("email", email)
    .maybeSingle();
  if (userError) {
    console.error("خطأ في البحث عن الحساب:", userError.message);
    process.exit(1);
  }
  if (!userRow) {
    console.error(`مفيش حساب بالإيميل ده في جدول users: ${email}`);
    process.exit(1);
  }
  const authUserId = userRow["auth_user_id"] as string | null;
  if (!authUserId) {
    console.error("الحساب ده لسه مش مربوط بحساب Supabase Auth حقيقي (auth_user_id فاضي).");
    process.exit(1);
  }

  const { error: updateError } = await supabase.auth.admin.updateUserById(authUserId, {
    password: newPassword,
  });
  if (updateError) {
    console.error("تعذّر تحديث كلمة السر:", updateError.message);
    process.exit(1);
  }

  const loginPath = userRow["is_platform_owner"] ? "/platform/login" : "/login";
  console.log(`✓ تم تحديث كلمة السر لحساب: ${userRow["full_name"]} (${email})`);
  console.log(`سجّل دخول دلوقتي من ${loginPath} بنفس الإيميل والكلمة السر الجديدة.`);
}

main().catch((e) => {
  console.error("❌ فشل التحديث:", e instanceof Error ? e.message : e);
  process.exit(1);
});
