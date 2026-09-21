import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";

import { Logo } from "@/components/Logo";
import { supabase } from "@/lib/supabase-client";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
});

/** Reached by clicking the email link from resetPasswordForEmail() (forgot-password.tsx).
 * Supabase's client parses the recovery token out of the URL itself on load — the token can
 * arrive as a URL hash or a query `code` depending on project auth-flow settings, so rather
 * than parsing either format ourselves we wait for the documented `PASSWORD_RECOVERY` auth
 * event, which fires once Supabase has turned that token into a real (temporary) session. */
function ResetPasswordPage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" && active) {
        setReady(true);
        setChecking(false);
      }
    });

    // Covers the case where the recovery event already fired before this listener attached.
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session) setReady(true);
      setChecking(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("كلمة السر لازم تكون 6 حروف/أرقام على الأقل.");
      return;
    }
    if (password !== confirmPassword) {
      setError("كلمتا السر مش متطابقتين.");
      return;
    }
    setSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (updateError) {
      setError("تعذّر حفظ كلمة السر الجديدة — الرابط ممكن يكون منتهي، جرّب تطلب رابط جديد.");
      return;
    }
    await supabase.auth.signOut();
    setDone(true);
    setTimeout(() => {
      void navigate({ to: "/login" });
    }, 2500);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo className="flex-col items-center text-center text-foreground [&_span:first-child]:text-2xl" />
          <h1 className="mt-4 text-lg font-extrabold text-foreground">تعيين كلمة سر جديدة</h1>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          {checking ? (
            <p className="text-center text-sm font-bold text-muted-foreground">
              جارٍ التحقق من الرابط...
            </p>
          ) : done ? (
            <div className="space-y-2 text-center">
              <p className="text-sm font-bold text-foreground">تم تغيير كلمة السر بنجاح</p>
              <p className="text-xs text-muted-foreground">
                هنحوّلك لصفحة تسجيل الدخول تلقائيًا...
              </p>
            </div>
          ) : !ready ? (
            <div className="space-y-3 text-center">
              <p className="text-sm font-bold text-destructive">
                الرابط غير صالح أو منتهي الصلاحية.
              </p>
              <Link
                to="/forgot-password"
                className="inline-block text-sm font-bold text-secondary hover:underline"
              >
                اطلب رابط جديد
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="password" className="text-sm font-medium text-foreground">
                  كلمة السر الجديدة
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                  placeholder="••••••••"
                  dir="ltr"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="confirmPassword" className="text-sm font-medium text-foreground">
                  تأكيد كلمة السر
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                  placeholder="••••••••"
                  dir="ltr"
                />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {saving ? "جارٍ الحفظ..." : "حفظ كلمة السر الجديدة"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
