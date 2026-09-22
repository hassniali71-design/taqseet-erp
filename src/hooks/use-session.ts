import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  getSession,
  signOut,
  subscribeData,
  validateSession,
  type Session,
} from "@/lib/data-store";

/**
 * `undefined` = not yet checked (matches both the server render and the client's first paint,
 * since reading localStorage during render would desync SSR/CSR output and trigger a
 * hydration mismatch — see the note left in the original dashboard.tsx).
 */
export function useSession(): Session | null | undefined {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    setSession(getSession());
    return subscribeData(() => setSession(getSession()));
  }, []);

  // الجلسة المخزَّنة محليًا ممكن تفضل شايفة المستخدم "داخل" حتى لو جلسة Supabase الحقيقية باظت
  // أو اختلفت (تاب فضل مفتوح فترة طويلة، تبديل حساب من غير مزامنة كاملة...) — القراءة بتفضل
  // شغالة (أو بترجع فاضية بصمت)، لكن أول عملية كتابة كانت بترفض من الـRLS برسالة Postgres
  // مبهمة للمستخدم النهائي. هنا بنتأكد فعليًا مع السيرفر عند أول تحميل للصفحة وعند رجوع التاب
  // للتركيز (أكتر لحظة واقعية لاكتشاف جلسة باظت وهي مفتوحة)، وبنسجّل خروج برسالة واضحة بدل ما
  // نسيبه يوصل للرسالة المبهمة دي.
  useEffect(() => {
    let cancelled = false;
    async function check() {
      const cached = getSession();
      if (!cached) return;
      const valid = await validateSession(cached);
      if (!cancelled && !valid) {
        toast.error("انتهت الجلسة — سجّل دخول تاني");
        signOut();
      }
    }
    void check();
    window.addEventListener("focus", check);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", check);
    };
  }, []);

  return session;
}

/** Same as `useSession`, but redirects to /login once it's confirmed there's no session. */
export function useRequireSession(): Session | null {
  const session = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (session === null) void navigate({ to: "/login" });
  }, [session, navigate]);

  return session ?? null;
}
