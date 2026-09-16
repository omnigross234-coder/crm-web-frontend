"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Layout from "@/components/Layout";
import { api, AuditLogEntry, AuditLogListResponse } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const PER_PAGE = 25;

/**
 * Phase 2 Foundation: minimal Super Admin viewer for the new GET
 * /audit-logs endpoint. Deliberately a plain hand-rolled table matching
 * this app's existing admin-page pattern (see admin/users/page.tsx) rather
 * than a new reusable table/filter-bar component — this is the only page
 * that needs one so far, and extracting shared primitives now would be
 * ahead of actual need (per the Phase 2 brief's "do not create speculative
 * components" instruction). The full dashboard/billing/security-center
 * pages are later phases.
 */
export default function AuditLogsPage() {
  const { isSuperAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Phase 5: a tenant detail page links here with ?client_id=<id> to
  // pre-filter to that tenant's audit history, reusing this reader instead
  // of building a second one.
  const [clientId, setClientId] = useState(() => searchParams.get("client_id") ?? "");
  const [action, setAction] = useState("");

  const fetchLogs = useCallback(async (targetPage: number, filters: { clientId: string; action: string }) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(targetPage), per_page: String(PER_PAGE) });
      if (filters.clientId.trim()) params.set("client_id", filters.clientId.trim());
      if (filters.action.trim()) params.set("action", filters.action.trim());
      const response = await api.get<AuditLogListResponse>(`/audit-logs?${params.toString()}`);
      setLogs(response.data);
      setLastPage(response.meta.last_page);
      setTotal(response.meta.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load audit logs.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && !isSuperAdmin) { router.replace("/dashboard"); return; }
    if (!authLoading && isSuperAdmin) void fetchLogs(page, { clientId, action });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isSuperAdmin, page]);

  function applyFilters(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    void fetchLogs(1, { clientId, action });
  }

  if (authLoading || !isSuperAdmin) return null;

  return (
    <Layout>
      <div className="p-6 sm:p-8 bg-background min-h-screen">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground tracking-tight">Audit Log</h1>
          <p className="mt-1 text-foreground/60 text-sm">Platform-wide record of sensitive administrative actions</p>
        </div>

        <form onSubmit={applyFilters} className="bg-card rounded-2xl border border-border/50 p-4 mb-6 shadow-sm flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-foreground/50 uppercase tracking-wider mb-1">Client ID</label>
            <input
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="e.g. 12"
              inputMode="numeric"
              className="px-3 py-2 bg-input border border-border/50 rounded-xl text-sm text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all w-32"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-foreground/50 uppercase tracking-wider mb-1">Action</label>
            <input
              value={action}
              onChange={(e) => setAction(e.target.value)}
              placeholder="e.g. client.created"
              className="px-3 py-2 bg-input border border-border/50 rounded-xl text-sm text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all w-56"
            />
          </div>
          <button type="submit" className="bg-primary hover:brightness-110 text-primary-foreground text-sm font-semibold px-4 py-2 rounded-xl transition-all shadow-sm shadow-primary/20">
            Apply Filters
          </button>
          {(clientId || action) && (
            <button
              type="button"
              onClick={() => { setClientId(""); setAction(""); setPage(1); void fetchLogs(1, { clientId: "", action: "" }); }}
              className="text-sm font-semibold text-foreground/60 hover:text-foreground px-3 py-2 rounded-xl border border-border/50 hover:bg-input/50 transition-all"
            >
              Clear
            </button>
          )}
        </form>

        {error && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary">
            <span>{error}</span>
            <button type="button" onClick={() => void fetchLogs(page, { clientId, action })} className="font-semibold underline underline-offset-2">
              Retry
            </button>
          </div>
        )}

        <div className="bg-card rounded-2xl border border-border/50 overflow-hidden shadow-sm">
          {loading ? (
            <div className="flex items-center justify-center py-16 gap-2 text-foreground/50">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              Loading…
            </div>
          ) : logs.length === 0 ? (
            <p className="text-center py-16 text-foreground/40 text-sm">No audit log entries match these filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="bg-input/50 border-b border-border/50">
                  <tr>
                    <th className="text-left px-6 py-4 text-xs font-bold text-foreground/50 uppercase tracking-wider">When</th>
                    <th className="text-left px-6 py-4 text-xs font-bold text-foreground/50 uppercase tracking-wider">Action</th>
                    <th className="text-left px-6 py-4 text-xs font-bold text-foreground/50 uppercase tracking-wider">Actor</th>
                    <th className="text-left px-6 py-4 text-xs font-bold text-foreground/50 uppercase tracking-wider">Client</th>
                    <th className="text-left px-6 py-4 text-xs font-bold text-foreground/50 uppercase tracking-wider">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-input/30 transition-colors duration-150">
                      <td className="px-6 py-4 whitespace-nowrap text-foreground/70">{new Date(log.created_at).toLocaleString()}</td>
                      <td className="px-6 py-4">
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
                          {log.action}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-foreground/70">{log.actor ? `${log.actor.name} (${log.actor.email})` : "System"}</td>
                      <td className="px-6 py-4 text-foreground/70">{log.client?.name ?? "—"}</td>
                      <td className="px-6 py-4 text-foreground/70">{log.description ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {lastPage > 1 && (
          <div className="mt-4 flex items-center justify-between text-sm text-foreground/60">
            <span>Page {page} of {lastPage} ({total} total)</span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-lg border border-border/50 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-input/50 transition-all"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= lastPage}
                onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
                className="px-3 py-1.5 rounded-lg border border-border/50 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-input/50 transition-all"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
