import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

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
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4 text-center">
      <h1 className="text-3xl font-bold text-foreground">تقسيط — ERP لمحلات الأجهزة الكهربائية</h1>
      <p className="max-w-lg text-sm text-muted-foreground">
        المشروع في مرحلة التأسيس (Phase 0). سكافولد التقنية جاهز — الشاشات والمنطق التجاري سيُبنى
        على مراحل متتالية بدءًا من Auth وTenants وRLS.
      </p>
      <Link
        to={hasSession ? "/dashboard" : "/login"}
        className="mt-2 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        {hasSession ? "الذهاب للوحة التحكم" : "تسجيل الدخول"}
      </Link>
    </div>
  );
}
