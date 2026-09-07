import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { getSession, subscribeData, type Session } from "@/lib/data-store";

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
