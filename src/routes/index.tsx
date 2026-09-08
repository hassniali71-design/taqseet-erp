import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { Logo } from "@/components/Logo";
import { getSession } from "@/lib/data-store";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  // Starts false on both server and client render (see the same note in dashboard.tsx) so the
  // link always reads "تسجيل الدخول" on first paint, then flips to the dashboard link after
  // mount if a session already exists client-side.
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    setHasSession(getSession() !== null);
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <Logo className="flex-col items-center text-foreground [&_span:first-child]:text-3xl" />
      <h1 className="mt-2 text-2xl font-extrabold text-foreground">أهلاً بكم في منصة حسبة</h1>
      <p className="max-w-lg text-sm font-bold text-muted-foreground">
        نظام إدارة ذكي لمحلات الأجهزة الكهربائية والتقسيط — مبيعات، تقسيط وتحصيل، مخزون بسيريالات،
        مشتريات وموردون، خزينة ومحاسبة تلقائية، وتقارير حيّة، في مكان واحد.
      </p>

      {hasSession ? (
        <Link
          to="/dashboard"
          className="mt-2 inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          الذهاب للوحة التحكم
        </Link>
      ) : (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/login"
            className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            دخول العملاء
          </Link>
          <Link
            to="/platform/login"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-5 py-2.5 text-sm font-bold text-foreground transition-colors hover:bg-accent"
          >
            دخول مشغّلي المنصة
          </Link>
        </div>
      )}
    </div>
  );
}
