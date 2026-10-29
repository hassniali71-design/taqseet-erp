import { useEffect, useState } from "react";

import { localGet, localSet } from "@/lib/local-store";

/** طابور العمليات اللي اتعملت والنت فاصل (بند 80 — المرحلة 2 في TASK-0003).
 *
 * • كل عملية (تحصيل أو عقد تقسيط) بتتحفظ على الجهاز برقم ثابت (`id`) — نفس الرقم بيتبعت للسيرفر
 *   كل مرة، والسيرفر بيسجّلها مرة واحدة بس مهما اتبعتت (الحماية من التكرار في 0029/0032).
 * • بتتبعت **بالترتيب** لما النت يرجع. لو عملية وقفت، اللي بعدها بيستنى (التحصيل على عقد
 *   اتعمل من غير نت لازم يوصل بعد العقد نفسه).
 * • نوعين أخطاء: **نت/مهلة** → نستنى ونعيد لوحدنا. **رفض حقيقي** (السيريال اتباع، المبلغ أكبر من
 *   المتبقي...) → العملية بتقف وتظهر للمستخدم بالسبب، وهو يلغيها.
 * • الطابور مبيتمسحش مع تسجيل الخروج (عمليات لسه موصلتش = فلوس وعقود حقيقية)، ومحفوظ لكل محل لوحده —
 *   مبيتبعتش غير وصاحب نفس المحل داخل. */

export type QueuedCollect = {
  kind: "collect";
  /** = idempotency_key بتاع الإيصال. */
  id: string;
  tenantId: string;
  /** وقت العملية الحقيقي على الجهاز. */
  at: string;
  actorUserId: string | null;
  contractId: string;
  contractNumber: string;
  customerName: string;
  amount: number;
  /** تاريخ مفتوح اختاره المستخدم بإيده (لو فيه). */
  createdAt?: string;
};

export type QueuedContract = {
  kind: "contract";
  /** = رقم العقد (id) نفسه — اتولّد على الجهاز. */
  id: string;
  tenantId: string;
  at: string;
  actorUserId: string | null;
  customerName: string;
  totalAmount: number;
  /** بيانات العقد زي ما البرنامج حسبها على الجهاز (create_installment_contract_offline). */
  payload: {
    contract: Record<string, unknown>;
    newCustomer: Record<string, unknown> | null;
    newPlan: Record<string, unknown> | null;
  };
  /** تسوية الشركاء على الصفقة — بتحصل بعد ما العقد يوصل. */
  partners: unknown;
};

export type QueuedOp = QueuedCollect | QueuedContract;

export type OutboxEntry = QueuedOp & {
  status: "pending" | "rejected" | "waiting_update";
  error?: string;
  attempts: number;
  /** السيرفر سجّل العملية، ولسه الخزينة/القيد/التدقيق/الشركاء ما خلصوش (لو النت قطع بينهم). */
  serverDone?: boolean;
};

const key = (tenantId: string) => `outbox:${tenantId}`;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export async function outboxList(tenantId: string): Promise<OutboxEntry[]> {
  return (await localGet<OutboxEntry[]>(key(tenantId))) ?? [];
}

// كل التعديلات على الطابور بتمشي واحدة ورا التانية (مفيش تعديلين يكتبوا فوق بعض).
let chain: Promise<unknown> = Promise.resolve();
function mutate(tenantId: string, fn: (list: OutboxEntry[]) => OutboxEntry[]) {
  const next = chain.then(async () => {
    const list = await outboxList(tenantId);
    await localSet(key(tenantId), fn(list));
    notify();
  });
  chain = next.catch(() => undefined);
  return next;
}

export function outboxAdd(op: QueuedOp) {
  return mutate(op.tenantId, (list) =>
    list.some((e) => e.id === op.id) ? list : [...list, { ...op, status: "pending", attempts: 0 }],
  );
}

export function outboxUpdate(tenantId: string, id: string, patch: Partial<OutboxEntry>) {
  return mutate(tenantId, (list) =>
    list.map((e) => (e.id === id ? ({ ...e, ...patch } as OutboxEntry) : e)),
  );
}

export function outboxRemove(tenantId: string, id: string) {
  return mutate(tenantId, (list) => list.filter((e) => e.id !== id));
}

/** نت أو مهلة أو السيرفر مشغول = نعيد بعدين. غير كده = رفض حقيقي. */
export function isTransient(error: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const e = error as { status?: number; code?: string; message?: string; name?: string } | null;
  if (!e) return false;
  if (e.status === 0 || e.status === 408 || e.status === 429 || (e.status ?? 0) >= 500) return true;
  if (e.code === "57014" || e.code === "PGRST000" || e.code === "PGRST001") return true;
  const msg = `${e.name ?? ""} ${e.message ?? ""}`.toLowerCase();
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|timeout|timed out|aborted|retryable/.test(
    msg,
  );
}

/** نتيجة إرسال عملية: تمت، أو نستنى (نت/تحديث القاعدة)، أو اترفضت بسبب. */
export type SendResult =
  | { ok: true }
  | { ok: false; retry: true; waitingUpdate?: boolean }
  | { ok: false; retry: false; error: string };

type Sender = (entry: OutboxEntry) => Promise<SendResult>;
const senders: Partial<Record<QueuedOp["kind"], Sender>> = {};

/** supabase-queries بيسجّل هنا طريقة إرسال كل نوع (عشان الملفين ميستوردوش بعض). */
export function registerOutboxSender(kind: QueuedOp["kind"], sender: Sender) {
  senders[kind] = sender;
}

const running = new Set<string>();
const afterSyncListeners = new Set<(tenantId: string) => void>();

export function onOutboxSynced(fn: (tenantId: string) => void) {
  afterSyncListeners.add(fn);
  return () => {
    afterSyncListeners.delete(fn);
  };
}

export async function processOutbox(tenantId: string): Promise<void> {
  if (running.has(tenantId)) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  running.add(tenantId);
  let sentAny = false;
  try {
    for (;;) {
      const list = await outboxList(tenantId);
      const entry = list[0];
      // أول عملية واقفة (اترفضت) بتوقف اللي بعدها لحد ما المستخدم يلغيها — الترتيب مهم.
      if (!entry || entry.status === "rejected") break;
      const send = senders[entry.kind];
      if (!send) break;
      let result: SendResult;
      try {
        result = await send(entry);
      } catch (e) {
        result = isTransient(e)
          ? { ok: false, retry: true }
          : { ok: false, retry: false, error: e instanceof Error ? e.message : String(e) };
      }
      if (result.ok) {
        await outboxRemove(tenantId, entry.id);
        sentAny = true;
        continue;
      }
      if (result.retry) {
        await outboxUpdate(tenantId, entry.id, {
          attempts: entry.attempts + 1,
          status: result.waitingUpdate ? "waiting_update" : "pending",
        });
        break;
      }
      await outboxUpdate(tenantId, entry.id, { status: "rejected", error: result.error });
      break;
    }
  } finally {
    running.delete(tenantId);
    if (sentAny) afterSyncListeners.forEach((l) => l(tenantId));
  }
}

/** بيشغّل الإرسال أول ما البرنامج يفتح، ولما النت يرجع، وكل 20 ثانية. */
export function useOutboxRunner(tenantId: string | undefined) {
  useEffect(() => {
    if (!tenantId) return;
    const run = () => void processOutbox(tenantId);
    run();
    window.addEventListener("online", run);
    const timer = window.setInterval(run, 20_000);
    listeners.add(run);
    return () => {
      window.removeEventListener("online", run);
      window.clearInterval(timer);
      listeners.delete(run);
    };
  }, [tenantId]);
}

export function useOutbox(tenantId: string | undefined): OutboxEntry[] {
  const [entries, setEntries] = useState<OutboxEntry[]>([]);
  useEffect(() => {
    if (!tenantId) {
      setEntries([]);
      return;
    }
    let alive = true;
    const load = () =>
      void outboxList(tenantId).then((l) => {
        if (alive) setEntries(l);
      });
    load();
    listeners.add(load);
    return () => {
      alive = false;
      listeners.delete(load);
    };
  }, [tenantId]);
  return entries;
}

export function newOperationId(): string {
  return crypto.randomUUID();
}

/** مجموع التحصيلات اللي لسه في الطابور على عقد (مش المرفوضة) — بتتطرح من المتبقي المعروض. */
export function pendingCollectedFor(entries: OutboxEntry[], contractId: string): number {
  return (
    Math.round(
      entries
        .filter(
          (e) => e.kind === "collect" && e.contractId === contractId && e.status !== "rejected",
        )
        .reduce((sum, e) => sum + (e.kind === "collect" ? e.amount : 0), 0) * 100,
    ) / 100
  );
}
