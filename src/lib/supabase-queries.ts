import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase-client";
import type { AuditLogEntry, TenantSettings } from "@/types";

/** Tenant-scoped reads/writes for the Foundation layer, going straight through the browser
 * Supabase client (anon key) — Row Level Security (supabase/migrations/0001_foundation.sql)
 * is what actually restricts these to the signed-in user's own tenant, not application code.
 * Cross-tenant reads/writes (the Platform Control Room) go through src/lib/platform-server.ts
 * instead, which uses the service role key from a server function. */

export function useCurrentTenantSettings(tenantId: string | undefined) {
  return useQuery({
    queryKey: ["tenant-settings", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_settings")
        .select("*")
        .eq("tenant_id", tenantId as string)
        .single();
      if (error) throw new Error(error.message);
      return data as TenantSettings;
    },
    enabled: Boolean(tenantId),
  });
}

export function useUpdateTenantSettings(tenantId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<Omit<TenantSettings, "tenant_id">>) => {
      if (!tenantId) throw new Error("لا توجد جلسة نشطة");
      const { error } = await supabase
        .from("tenant_settings")
        .update(patch)
        .eq("tenant_id", tenantId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tenant-settings", tenantId] });
    },
  });
}

export function useAuditLogs(tenantId: string | undefined) {
  return useQuery({
    queryKey: ["audit-logs", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .eq("tenant_id", tenantId as string)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw new Error(error.message);
      return (data ?? []) as AuditLogEntry[];
    },
    enabled: Boolean(tenantId),
  });
}
