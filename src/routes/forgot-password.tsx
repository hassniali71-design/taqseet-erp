import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";

import { Logo } from "@/components/Logo";
import { supabase } from "@/lib/supabase-client";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setStatus("sending");
    const normalizedEmail = email.trim().toLowerCase();
    // This handler only ever runs from a browser form submit, so `window` always exists here.
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (resetError) {
      setStatus("idle");
      setError("تعذّر إرسال رابط إعادة التعيين — تأكد من صحة البريد الإلكتروني وحاول مرة أخرى.");
      return;
    }
    setStatus("sent");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo className="flex-col items-center text-center text-foreground [&_span:first-child]:text-2xl" />
          <h1 className="mt-4 text-lg font-extrabold text-foreground">نسيت كلمة السر؟</h1>
          <p className="mt-1 text-sm font-bold text-muted-foreground">
            هنبعتلك رابط لإعادة تعيين كلمة السر على بريدك الإلكتروني
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          {status === "sent" ? (
            <div className="space-y-4 text-center">
              <p className="text-sm font-bold text-foreground">
                لو البريد ده مسجّل عندنا، هيوصلك رابط لإعادة تعيين كلمة السر خلال لحظات.
              </p>
              <p className="text-xs text-muted-foreground">
                افتح الرابط من نفس البريد، حدد كلمة السر الجديدة، وبعدين سجّل دخول تاني بيها.
              </p>
              <Link
                to="/login"
                className="inline-block text-sm font-bold text-secondary hover:underline"
              >
                الرجوع لتسجيل الدخول
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="email" className="text-sm font-medium text-foreground">
                  البريد الإلكتروني اللي بتسجّل دخول بيه
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                  placeholder="example@email.com"
                  dir="ltr"
                />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <button
                type="submit"
                disabled={status === "sending"}
                className="w-full rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {status === "sending" ? "جارٍ الإرسال..." : "إرسال رابط إعادة التعيين"}
              </button>
            </form>
          )}
        </div>

        <p className="mt-4 text-center text-xs font-bold text-muted-foreground">
          فاكر كلمة السر؟{" "}
          <Link to="/login" className="text-secondary hover:underline">
            تسجيل الدخول
          </Link>
        </p>
      </div>
    </div>
  );
}
