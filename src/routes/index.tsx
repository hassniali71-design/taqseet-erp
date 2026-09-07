import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4 text-center">
      <h1 className="text-3xl font-bold text-foreground">تقسيط — ERP لمحلات الأجهزة الكهربائية</h1>
      <p className="max-w-lg text-sm text-muted-foreground">
        المشروع في مرحلة التأسيس (Phase 0). سكافولد التقنية جاهز — الشاشات والمنطق التجاري سيُبنى
        على مراحل متتالية بدءًا من Auth وTenants وRLS.
      </p>
    </div>
  );
}
