/** «مميزات المحل» في غرفة تحكم المنصة (بند 85 — TASK-0005 المرحلة 0). صاحب المنصة بس اللي بيفتح
 * المفاتيح دي لمحل معيّن (قرار المالك)، بسبب إلزامي بيتسجّل في سجل تدقيق المحل. كل مفتاح مقفول =
 * المحل شغال زي النهارده بالحرف. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { fetchTenantFeaturesServer, setTenantFeaturesServer } from "@/lib/platform-server";
import { getAccessToken } from "@/lib/supabase-client";
import { DEFAULT_TENANT_FEATURES } from "@/lib/tenant-features";
import { cn } from "@/lib/utils";
import type { Tenant, TenantFeatures } from "@/types";

const SWITCHES: Array<{
  key: Exclude<keyof TenantFeatures, "partners_mode">;
  title: string;
  hint: string;
}> = [
  {
    key: "goods_enabled",
    title: "الأدوات المنزلية",
    hint: "نوع صنف «أدوات» بفورم قصير، ووحدات (قطعة/دستة/طقم)، وإدخال سريع لفاتورة كبيرة.",
  },
  {
    key: "customer_accounts_enabled",
    title: "الحساب الجاري / حساب العروسة",
    hint: "عربون وحجز وشراء من الرصيد وتسليم على دفعات.",
  },
  {
    key: "deferred_cash_enabled",
    title: "نص دلوقتي والباقي في ميعاد",
    hint: "في البيع الكاش: لو المدفوع أقل من الإجمالي، يقسّط الباقي أو يحدد يوم.",
  },
];

export function TenantFeaturesPanel({ tenant, onClose }: { tenant: Tenant; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [features, setFeatures] = useState<TenantFeatures>(DEFAULT_TENANT_FEATURES);
  const [reason, setReason] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["platform-tenant-features", tenant.id],
    queryFn: async () =>
      fetchTenantFeaturesServer({
        data: { tenantId: tenant.id, accessToken: await getAccessToken() },
      }),
  });
  useEffect(() => {
    if (data) setFeatures(data.features);
  }, [data]);

  const save = useMutation({
    mutationFn: async () =>
      setTenantFeaturesServer({
        data: { tenantId: tenant.id, features, reason, accessToken: await getAccessToken() },
      }),
    onSuccess: () => {
      toast.success("اتحفظت مميزات المحل");
      void queryClient.invalidateQueries({ queryKey: ["platform-tenant-features", tenant.id] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const changed =
    data &&
    (Object.keys(features) as Array<keyof TenantFeatures>).some(
      (k) => features[k] !== data.features[k],
    );

  return (
    <div className="mt-6 rounded-2xl border-2 border-primary/50 bg-primary/5 p-5">
      <h2 className="text-sm font-extrabold text-sidebar-foreground">
        مميزات المحل: {tenant.name}
      </h2>
      <p className="mt-1 text-xs font-bold text-sidebar-foreground/70">
        كل مفتاح مقفول = المحل شغال زي النهارده بالحرف. افتح بس اللي المحل ده محتاجه فعلًا.
      </p>

      {isLoading ? (
        <p className="mt-4 text-sm text-sidebar-foreground/70">جارٍ التحميل...</p>
      ) : data && !data.available ? (
        <p className="mt-4 text-sm font-bold text-warning">
          المفاتيح لسه مش جاهزة على القاعدة — لازم ملف 0034 يتطبّق الأول.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {SWITCHES.map((sw) => (
            <label
              key={sw.key}
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-sidebar-border p-3"
            >
              <input
                type="checkbox"
                checked={features[sw.key]}
                onChange={(e) => setFeatures({ ...features, [sw.key]: e.target.checked })}
                className="mt-1 h-4 w-4 accent-primary"
              />
              <span>
                <span className="block text-sm font-bold text-sidebar-foreground">{sw.title}</span>
                <span className="block text-xs text-sidebar-foreground/70">{sw.hint}</span>
              </span>
            </label>
          ))}
          <div className="rounded-lg border border-sidebar-border p-3">
            <span className="block text-sm font-bold text-sidebar-foreground">الشركاء</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {(
                [
                  ["per_deal", "كل صفقة بشريك (زي النهارده)"],
                  ["capital_pool", "رأس مال واحد للمشروع"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFeatures({ ...features, partners_mode: value })}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-xs font-bold",
                    features.partners_mode === value
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent/40",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="سبب التغيير (إلزامي) — مثال: محل محمد الجديد، أدوات منزلية ورأس مال شركاء"
            className="w-full rounded-md border border-sidebar-border bg-sidebar px-3 py-2 text-sm text-sidebar-foreground outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => save.mutate()}
          disabled={!changed || !reason.trim() || save.isPending || !data?.available}
          className="rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {save.isPending ? "جارٍ الحفظ..." : "احفظ"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-sidebar-border px-4 py-2 text-sm font-bold text-sidebar-foreground hover:bg-sidebar-accent/40"
        >
          إلغاء
        </button>
      </div>
    </div>
  );
}
