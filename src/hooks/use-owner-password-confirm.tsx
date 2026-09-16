import { useCallback, useRef, useState } from "react";

import { supabase } from "@/lib/supabase-client";

/** Re-verifies the currently signed-in user's real password via a fresh
 * `signInWithPassword` call — never a local/plaintext comparison. A failed attempt does not
 * disturb the existing session (Supabase only replaces the session on success), so this is
 * safe to use as a lightweight "confirm it's really you" gate before an irreversible action
 * (bulk delete, clearing all notifications). */
export function useOwnerPasswordConfirm() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const resolveRef = useRef<((confirmed: boolean) => void) | null>(null);

  const requestConfirm = useCallback((): Promise<boolean> => {
    setPassword("");
    setError(null);
    setOpen(true);
    return new Promise((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  function finish(confirmed: boolean) {
    setOpen(false);
    resolveRef.current?.(confirmed);
    resolveRef.current = null;
  }

  async function handleSubmit() {
    if (!password.trim()) {
      setError("اكتب كلمة السر");
      return;
    }
    setVerifying(true);
    setError(null);
    const { data: userData } = await supabase.auth.getUser();
    const email = userData.user?.email;
    if (!email) {
      setVerifying(false);
      setError("تعذّر التحقق من الجلسة الحالية");
      return;
    }
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    setVerifying(false);
    if (authError) {
      setError("كلمة السر غير صحيحة");
      return;
    }
    finish(true);
  }

  const dialog = open ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-lg">
        <h3 className="text-sm font-bold text-foreground">تأكيد بكلمة سر المالك</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          هذا إجراء نهائي — أدخل كلمة سر حسابك للتأكيد قبل المتابعة.
        </p>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void handleSubmit()}
          className="form-input mt-3"
          placeholder="كلمة السر"
        />
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => void handleSubmit()}
            disabled={verifying}
            className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {verifying ? "جارٍ التحقق..." : "تأكيد"}
          </button>
          <button
            onClick={() => finish(false)}
            disabled={verifying}
            className="rounded-md border border-input px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            إلغاء
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { requestConfirm, dialog };
}
