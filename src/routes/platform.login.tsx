import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";

import { Logo } from "@/components/Logo";
import { signIn } from "@/lib/data-store";

export const Route = createFileRoute("/platform/login")({
  component: PlatformLoginPage,
});

function PlatformLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const result = signIn(email, password);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    void navigate({ to: "/dashboard" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-sidebar px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo className="flex-col items-center text-center text-sidebar-foreground [&_span:first-child]:text-2xl" />
          <h1 className="mt-4 text-lg font-extrabold text-sidebar-foreground">
            لوحة تحكم منصة حسبة
          </h1>
          <p className="mt-1 text-sm font-bold text-sidebar-foreground/70">
            دخول مخصص لمشغّلي المنصة — لإدارة عملاء (محلات) النظام
          </p>
        </div>

        <div className="rounded-xl border border-sidebar-border bg-sidebar-accent/40 p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-bold text-sidebar-foreground">
                البريد الإلكتروني
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-sidebar-border bg-sidebar px-3 py-2 text-sm text-sidebar-foreground outline-none focus:ring-2 focus:ring-ring"
                placeholder="owner@demo.local"
                dir="ltr"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-bold text-sidebar-foreground">
                كلمة السر
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-sidebar-border bg-sidebar px-3 py-2 text-sm text-sidebar-foreground outline-none focus:ring-2 focus:ring-ring"
                placeholder="••••••••"
                dir="ltr"
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <button
              type="submit"
              className="w-full rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              دخول
            </button>
          </form>

          <div className="mt-6 rounded-md border border-sidebar-border bg-sidebar/60 p-3 text-xs font-bold text-sidebar-foreground/70">
            قريباً في هذه اللوحة: إنشاء عملاء (Tenants) جدد، وتفعيل/تعليق/تجديد الاشتراكات — جزء من
            المرحلة القادمة في خطة المشروع.
          </div>
        </div>

        <p className="mt-4 text-center text-xs font-bold text-sidebar-foreground/60">
          عميل تبحث عن الدخول لمحلك؟{" "}
          <Link to="/login" className="text-primary hover:underline">
            دخول العملاء
          </Link>
        </p>
      </div>
    </div>
  );
}
