import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AppSidebar } from "@/components/AppSidebar";
import { getJournalEntries, subscribeData } from "@/lib/data-store";
import { useRequireSession } from "@/hooks/use-session";
import type { AccountCode } from "@/types";

export const Route = createFileRoute("/accounting")({
  component: AccountingPage,
});

const CHART_OF_ACCOUNTS: Array<{ code: AccountCode; name: string; kind: string }> = [
  { code: "1000", name: "الخزينة/النقدية", kind: "أصل" },
  { code: "1100", name: "عملاء (ذمم مدينة)", kind: "أصل" },
  { code: "1200", name: "المخزون", kind: "أصل" },
  { code: "2000", name: "موردون (ذمم دائنة)", kind: "التزام" },
  { code: "3000", name: "إيرادات المبيعات", kind: "إيراد" },
  { code: "3100", name: "إيرادات التمويل", kind: "إيراد" },
  { code: "5000", name: "المصروفات", kind: "مصروف" },
];

function AccountingPage() {
  const session = useRequireSession();
  const [, forceRerender] = useState(0);

  useEffect(() => subscribeData(() => forceRerender((n) => n + 1)), []);

  if (!session) return null;

  const entries = getJournalEntries(session.tenant_id).sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar session={session} />
      <main className="flex-1 mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-bold text-foreground">المحاسبة</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          §74/§75 — قيود تلقائية بحتة: الموظف العادي ملوش أي دعوة بيها، بتتولّد خلف الكواليس مع كل
          بيع/تحصيل/شراء/مصروف للقراءة والمراجعة فقط.
        </p>

        <section className="mt-6">
          <h2 className="text-lg font-bold text-foreground">دليل الحسابات (مبسّط)</h2>
          <div className="mt-3 max-h-[26rem] overflow-y-auto overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-right text-sm">
              <thead className="sticky top-0 z-10 border-b border-border bg-card text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">الكود</th>
                  <th className="px-4 py-3 font-medium">اسم الحساب</th>
                  <th className="px-4 py-3 font-medium">النوع</th>
                </tr>
              </thead>
              <tbody>
                {CHART_OF_ACCOUNTS.map((acc) => (
                  <tr key={acc.code} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium text-foreground" dir="ltr">
                      {acc.code}
                    </td>
                    <td className="px-4 py-3 text-foreground">{acc.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{acc.kind}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-bold text-foreground">القيود التلقائية</h2>
          <div className="mt-3 space-y-3">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="overflow-hidden rounded-xl border border-border bg-card"
              >
                <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-2">
                  <span className="text-sm font-bold text-foreground" dir="ltr">
                    {entry.entry_number}
                  </span>
                  <span className="text-xs text-muted-foreground">{entry.description}</span>
                  <span className="text-xs text-muted-foreground" dir="ltr">
                    {new Date(entry.created_at).toLocaleString("ar-EG")}
                  </span>
                </div>
                <table className="w-full text-right text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 font-medium">الحساب</th>
                      <th className="px-4 py-2 font-medium">مدين</th>
                      <th className="px-4 py-2 font-medium">دائن</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entry.lines.map((line, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="px-4 py-2 text-foreground">
                          {line.account_code} — {line.account_name}
                        </td>
                        <td className="px-4 py-2 text-muted-foreground" dir="ltr">
                          {line.debit > 0 ? line.debit.toLocaleString("ar-EG") : "—"}
                        </td>
                        <td className="px-4 py-2 text-muted-foreground" dir="ltr">
                          {line.credit > 0 ? line.credit.toLocaleString("ar-EG") : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
            {entries.length === 0 && (
              <p className="rounded-xl border border-border bg-card px-4 py-6 text-center text-muted-foreground">
                لا يوجد قيود بعد.
              </p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
