import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";

import { signIn } from "@/lib/data-store";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
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
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-sm">
        <h1 className="text-xl font-bold text-foreground">تسجيل الدخول</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          نسخة تجريبية (Mock) لأغراض التطوير المحلي فقط — ليست Supabase Auth حقيقية.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="email" className="text-sm font-medium text-foreground">
              البريد الإلكتروني
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              placeholder="owner@demo.local"
              dir="ltr"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="text-sm font-medium text-foreground">
              كلمة السر
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              placeholder="••••••••"
              dir="ltr"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <button
            type="submit"
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            دخول
          </button>
        </form>

        <div className="mt-6 rounded-md bg-muted p-3 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">بيانات تجريبية:</p>
          <p dir="ltr" className="mt-1 text-left">
            owner@demo.local / owner123
          </p>
        </div>
      </div>
    </div>
  );
}
