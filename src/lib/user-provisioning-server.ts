import { createServerFn } from "@tanstack/react-start";

import { getSupabaseAdmin, resolveServerCaller } from "@/lib/supabase-admin";

/** Creates a REAL Supabase Auth login (not just a `users` table row) for a new employee of the
 * signed-in owner's own tenant — the piece `useCreateUserRecord` (supabase-queries.ts)
 * deliberately left out, same as `/platform`'s tenant provisioning. Needs the service role key
 * (`auth.admin.createUser` isn't available to the anon key), so this has to run server-side,
 * same reasoning as every function in platform-server.ts.
 *
 * `tenantId` is derived from the caller's own verified session (`resolveServerCaller`), never
 * accepted from the request body — the earlier version trusted a client-supplied `tenantId`
 * directly, which let any signed-in user create a real login into ANY tenant just by claiming
 * its id. This one is inherently tenant-scoped to whoever is actually signed in; it never
 * touches another tenant's data by construction, so it doesn't need Platform-Owner gating on
 * top, just a real (verified) signed-in session. */
export const createTenantUserWithAuth = createServerFn({ method: "POST" })
  .validator(
    (input: {
      fullName: string;
      email: string;
      password: string;
      phone?: string;
      roleId?: string;
      accessToken: string;
    }) => input,
  )
  .handler(async ({ data }) => {
    const caller = await resolveServerCaller(data.accessToken);
    const tenantId = caller.tenantId;
    const email = data.email.trim().toLowerCase();
    const fullName = data.fullName.trim();
    const phone = data.phone?.trim();
    if (!fullName) throw new Error("الاسم مطلوب");
    if (!email) throw new Error("البريد الإلكتروني مطلوب");
    if (data.password.length < 6) throw new Error("كلمة السر لازم تكون 6 أحرف على الأقل");

    const supabaseAdmin = getSupabaseAdmin();

    const { data: created, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: fullName, tenant_id: tenantId },
    });
    if (authError || !created.user) {
      throw new Error(authError?.message ?? "تعذّر إنشاء حساب الدخول");
    }
    const authUserId = created.user.id;

    const { data: userRow, error: userError } = await supabaseAdmin
      .from("users")
      .insert({
        tenant_id: tenantId,
        auth_user_id: authUserId,
        full_name: fullName,
        email,
        ...(phone && { phone }),
        active: true,
      })
      .select()
      .single();
    if (userError) {
      // Roll back the orphaned Auth account rather than leave a login nobody can see/manage.
      try {
        await supabaseAdmin.auth.admin.deleteUser(authUserId);
      } catch {
        /* best-effort cleanup only */
      }
      throw new Error(userError.message);
    }

    if (data.roleId) {
      const { error: roleError } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: userRow.id as string, role_id: data.roleId });
      if (roleError) {
        try {
          await supabaseAdmin.auth.admin.deleteUser(authUserId);
          await supabaseAdmin
            .from("users")
            .delete()
            .eq("id", userRow.id as string);
        } catch {
          /* best-effort cleanup only */
        }
        throw new Error(roleError.message);
      }
    }

    await supabaseAdmin.from("audit_logs").insert({
      tenant_id: tenantId,
      user_id: caller.userId,
      action: "user.create_with_login",
      entity: "users",
      entity_id: userRow.id as string,
      new_value: { full_name: fullName, email },
    });

    return userRow;
  });
