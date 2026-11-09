/** صندوق «نشاط الموظفين» (بند 84 — منقول من دكانة/سفرة `notifications-bell.tsx`).
 *
 * كل سطر هنا حدث حقيقي اتكتب من القاعدة نفسها (جدول notifications، ملف 0033) وقت ما العملية
 * حصلت — مين عملها جاي من الحساب اللي سجّلها، مش من المتصفح. المالك بيشوف اللي عمله الموظفين،
 * والمخزن بيشوف اللي يخص شغله. صفحة /notifications (الأقساط المتأخرة والمواعيد) زي ما هي —
 * ده صندوق زيادة جنبها، مش بديل. لو ملف 0033 لسه متطبّقش، الجرس بيفضل ساكت (مفيش غلط). */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  Bell,
  Check,
  CheckCheck,
  Eye,
  FileText,
  Landmark,
  PackageSearch,
  Percent,
  Receipt,
  Repeat,
  ShoppingCart,
  Truck,
  Undo2,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { SimpleDialog } from "@/components/InstallAppButton";
import { supabase } from "@/lib/supabase-client";
import { cn } from "@/lib/utils";

type Notice = {
  id: string;
  event_type: string;
  ref_no: string | null;
  actor_name: string | null;
  actor_role: string | null;
  amount: number | null;
  title: string;
  body: string | null;
  url: string | null;
  created_at: string;
};

const EVENT_ICONS: Record<string, LucideIcon> = {
  collection: Wallet,
  collection_edit: Wallet,
  collection_delete: Wallet,
  installment_sale: Percent,
  cash_sale: Receipt,
  sale_return: Undo2,
  exchange: Repeat,
  expense: FileText,
  purchase: ShoppingCart,
  stock_adjust: PackageSearch,
  delivery: Truck,
};

const ROLE_LABEL: Record<string, string> = {
  owner: "المالك",
  manager: "المدير",
  sales: "البيّاع",
  cashier: "الكاشير",
  warehouse: "المخزن",
  purchasing: "المشتريات",
  collections: "المحصّل",
  accountant: "المحاسب",
};

const money = (n: number) =>
  `${n.toLocaleString("ar-EG", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ج.م`;

function when(iso: string): string {
  const d = new Date(iso);
  const t = d.toLocaleTimeString("ar-EG", {
    timeZone: "Africa/Cairo",
    hour: "numeric",
    minute: "2-digit",
  });
  const day = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
  if (day(d) === day(new Date())) return `النهارده ${t}`;
  return `${d.toLocaleDateString("ar-EG", { timeZone: "Africa/Cairo", day: "numeric", month: "short" })} — ${t}`;
}

function sentence(n: Notice): string {
  const who = [n.actor_role ? ROLE_LABEL[n.actor_role] : null, n.actor_name]
    .filter(Boolean)
    .join(" ");
  const amount = n.amount != null ? ` بـ${money(Number(n.amount))}` : "";
  const no = n.ref_no ? ` (رقم ${n.ref_no})` : "";
  return `${who || "حد من الفريق"} ${n.title}${amount}${no}`;
}

export function NotificationsBell({
  tenantId,
  className,
}: {
  tenantId: string;
  className?: string;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const { data, isError } = useQuery({
    queryKey: ["notifications-inbox", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select(
          "id, event_type, ref_no, actor_name, actor_role, amount, title, body, url, created_at",
        )
        .is("read_at", null)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as Notice[];
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    retry: false,
  });

  const markRead = useMutation({
    mutationFn: async (ids: string[] | null) => {
      const { error } = await supabase.rpc("mark_notifications_read", { _ids: ids });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications-inbox", tenantId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const items = isError ? [] : (data ?? []);
  const count = items.length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="نشاط الفريق"
        title="نشاط الفريق"
        className={cn("relative flex h-9 w-9 items-center justify-center rounded-md", className)}
      >
        <Bell className="h-5 w-5" />
        {count > 0 && (
          <span className="absolute -end-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-destructive px-1 text-xs font-bold text-destructive-foreground">
            {count > 49 ? "49+" : count}
          </span>
        )}
      </button>
      <SimpleDialog open={open} onClose={() => setOpen(false)} title="نشاط الفريق">
        {count > 0 && (
          <div className="mb-2 flex justify-end">
            <button
              type="button"
              disabled={markRead.isPending}
              onClick={() => markRead.mutate(null)}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
            >
              <CheckCheck className="h-4 w-4" /> تحديد الكل كمقروء
            </button>
          </div>
        )}
        <div className="max-h-[60vh] overflow-y-auto">
          {isError ? (
            <p className="p-4 text-center text-muted-foreground">الإشعارات مش متاحة دلوقتي.</p>
          ) : count === 0 ? (
            <p className="p-4 text-center text-muted-foreground">
              مفيش جديد. هنا هيظهر أول بأول كل تحصيل أو بيع أو مرتجع أو مصروف أو شراء أو جرد عمله حد
              من الفريق.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((n) => {
                const Icon = EVENT_ICONS[n.event_type] ?? Landmark;
                return (
                  <li key={n.id} className="flex gap-3 py-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15">
                      <Icon className="h-[1.15rem] w-[1.15rem]" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-sm font-bold leading-snug">{sentence(n)}</p>
                      {n.body && (
                        <p className="text-xs leading-snug text-muted-foreground">{n.body}</p>
                      )}
                      <div className="flex items-center justify-between gap-2 pt-0.5">
                        <span className="text-xs text-muted-foreground">{when(n.created_at)}</span>
                        <div className="flex items-center gap-1">
                          {n.url && (
                            <button
                              type="button"
                              onClick={() => {
                                setOpen(false);
                                void navigate({ to: n.url as string });
                              }}
                              className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs hover:bg-accent"
                            >
                              <Eye className="h-4 w-4" /> عرض
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={markRead.isPending}
                            onClick={() => markRead.mutate([n.id])}
                            title="تحديد كمقروء — يختفي من الصندوق"
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
                          >
                            <Check className="h-4 w-4" /> مقروء
                          </button>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </SimpleDialog>
    </>
  );
}
