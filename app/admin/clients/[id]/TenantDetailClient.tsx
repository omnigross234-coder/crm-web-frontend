"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import Layout from "@/components/Layout";
import ConfirmDialog from "@/components/ConfirmDialog";
import StatusBadge from "@/components/StatusBadge";
import { api, ApiResponse, AuditLogEntry, TenantDetail } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatCurrency } from "@/lib/billingFormat";

// Static export (output: 'export') — see admin/billing/subscriptions/[id]
// for the same pattern. The real ID is parsed from the URL at runtime
// rather than trusted from useParams(), which only ever says "placeholder".
function getTenantIdFromPath(pathname: string, fallback: string) {
  const match = pathname.match(/\/admin\/clients\/([^/]+)\/?$/);
  return match?.[1] ?? fallback;
}

export default function TenantDetailPage() {
  const { isSuperAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const id = getTenantIdFromPath(pathname, params.id);

  const [detail, setDetail] = useState<TenantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [activity, setActivity] = useState<AuditLogEntry[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);

  const [confirmingStatusChange, setConfirmingStatusChange] = useState(false);
  const [busy, setBusy] = useState(false);

  const fetchDetail = useCallback(() => {
    setLoading(true);
    setError("");
    api.get<ApiResponse<TenantDetail>>(`/admin/tenants/${id}`)
      .then((res) => setDetail(res.data))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load tenant."))
      .finally(() => setLoading(false));
  }, [id]);

  const fetchActivity = useCallback(() => {
    setActivityLoading(true);
    // Two calls, merged: client_id catches tenant-scoped activity (leads,
    // users, billing actions performed BY the tenant's own admins);
    // resource=client&subject_id catches super-admin-initiated lifecycle
    // events (client.created/client.updated), which log with client_id=null
    // (ActivityLogger records the ACTOR's client_id, not the affected
    // tenant's) — see AuditLogController's subject_id filter and the Phase
    // 5 report's Audit Logging section for why both calls are needed.
    Promise.all([
      api.get<ApiResponse<AuditLogEntry[]> & { meta: unknown }>(`/audit-logs?client_id=${id}&per_page=10`),
      api.get<ApiResponse<AuditLogEntry[]> & { meta: unknown }>(`/audit-logs?resource=client&subject_id=${id}&per_page=10`),
    ])
      .then(([byClient, byLifecycle]) => {
        const merged = [...byClient.data, ...byLifecycle.data]
          .filter((entry, index, all) => all.findIndex((e) => e.id === entry.id) === index)
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 10);
        setActivity(merged);
      })
      .catch(() => {})
      .finally(() => setActivityLoading(false));
  }, [id]);

  useEffect(() => {
    if (!authLoading && !isSuperAdmin) { router.replace("/dashboard"); return; }
    if (!authLoading) { fetchDetail(); fetchActivity(); }
  }, [authLoading, isSuperAdmin, router, fetchDetail, fetchActivity]);

  async function toggleStatus() {
    if (!detail) return;
    setBusy(true);
    setError("");
    const nextStatus = detail.client.status === "active" ? "suspended" : "active";
    try {
      await api.put(`/clients/${id}`, { status: nextStatus });
      setMessage(`${detail.client.name} is now ${nextStatus}.`);
      setConfirmingStatusChange(false);
      await Promise.all([fetchDetail(), fetchActivity()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update tenant status.");
      setConfirmingStatusChange(false);
    } finally {
      setBusy(false);
    }
  }

  if (authLoading || !isSuperAdmin) return null;

  const d = detail;

  return (
    <Layout>
      <div className="p-4 sm:p-6 lg:p-8 bg-background min-h-screen max-w-6xl mx-auto">
        <div className="mb-6">
          <p className="text-sm text-foreground/60 mb-1">
            <Link href="/admin/clients" className="text-primary hover:underline">Tenants</Link> / {d?.client.name ?? `#${id}`}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold text-foreground tracking-tight">{d?.client.name ?? `Tenant #${id}`}</h1>
            {d && <StatusBadge status={d.client.status} />}
          </div>
        </div>

        {message && <div className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400">{message}</div>}
        {error && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-500">
            <span>{error}</span>
            <button type="button" onClick={fetchDetail} className="font-semibold underline underline-offset-2">Retry</button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-24"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : !d ? (
          <p className="text-center py-24 text-foreground/40 text-sm">Tenant not found.</p>
        ) : (
          <>
            {/* Overview */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="bg-card border border-border/50 rounded-2xl p-5"><p className="text-xs font-bold text-foreground/50 uppercase tracking-wider">Slug</p><p className="mt-2 font-semibold text-foreground truncate">{d.client.slug}</p></div>
              <div className="bg-card border border-border/50 rounded-2xl p-5"><p className="text-xs font-bold text-foreground/50 uppercase tracking-wider">Created</p><p className="mt-2 font-semibold text-foreground">{new Date(d.client.created_at).toLocaleDateString()}</p></div>
              <div className="bg-card border border-border/50 rounded-2xl p-5"><p className="text-xs font-bold text-foreground/50 uppercase tracking-wider">Users</p><p className="mt-2 font-semibold text-foreground">{d.users.total} ({d.users.active} active)</p></div>
              <div className="bg-card border border-border/50 rounded-2xl p-5"><p className="text-xs font-bold text-foreground/50 uppercase tracking-wider">Leads</p><p className="mt-2 font-semibold text-foreground">{d.crm.leads_count.toLocaleString()}</p></div>
            </div>

            <div className="bg-card border border-border/50 rounded-2xl p-5 mb-6">
              <h2 className="font-semibold text-foreground text-sm mb-3">Administrative Actions</h2>
              <div className="flex flex-wrap gap-3 items-center">
                <button
                  type="button"
                  onClick={() => setConfirmingStatusChange(true)}
                  className={`text-xs font-semibold px-3 py-2 rounded-lg border transition-all ${
                    d.client.status === "active"
                      ? "text-red-500 bg-red-500/10 border-red-500/20 hover:bg-red-500/20"
                      : "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/20"
                  }`}
                >
                  {d.client.status === "active" ? "Suspend Tenant" : "Activate Tenant"}
                </button>
                {d.billing.active_subscription && (
                  <Link
                    href={`/admin/billing/subscriptions/${d.billing.active_subscription.id}`}
                    className="text-xs font-semibold text-primary px-3 py-2 rounded-lg bg-primary/10 border border-primary/20 hover:bg-primary/20 transition-all"
                  >
                    Manage Subscription →
                  </Link>
                )}
                <p className="text-xs text-foreground/40">
                  Editing the tenant name or client-admin login is not yet exposed here — use the existing client-admin account settings, or contact engineering.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
              {/* Users */}
              <div className="bg-card border border-border/50 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-border/50 bg-input/30"><h2 className="font-semibold text-foreground text-sm">Users</h2></div>
                <div className="p-5">
                  {d.admin && (
                    <div className="mb-4 pb-4 border-b border-border/50">
                      <p className="text-xs font-bold text-foreground/50 uppercase tracking-wider mb-1">Primary Admin</p>
                      <p className="text-sm text-foreground">{d.admin.name}</p>
                      <p className="text-xs text-foreground/50">{d.admin.email}</p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3"><p className="text-xs text-emerald-600 dark:text-emerald-400">Active</p><p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{d.users.active}</p></div>
                    <div className="rounded-xl bg-foreground/5 border border-border/50 p-3"><p className="text-xs text-foreground/50">Inactive</p><p className="text-lg font-bold text-foreground/70">{d.users.inactive}</p></div>
                  </div>
                  <p className="text-xs font-bold text-foreground/50 uppercase tracking-wider mb-2">By Role</p>
                  <div className="space-y-1.5">
                    {Object.entries(d.users.by_role).length === 0 && <p className="text-xs text-foreground/40">No users yet.</p>}
                    {Object.entries(d.users.by_role).map(([role, count]) => (
                      <div key={role} className="flex items-center justify-between text-sm">
                        <span className="text-foreground/70 capitalize">{role.replace("_", " ")}</span>
                        <span className="font-semibold text-foreground">{count}</span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 text-xs text-foreground/40">Full user management is a separate workstream — this is a summary only.</p>
                </div>
              </div>

              {/* CRM */}
              <div className="bg-card border border-border/50 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-border/50 bg-input/30"><h2 className="font-semibold text-foreground text-sm">CRM Activity</h2></div>
                <div className="p-5">
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="rounded-xl bg-input/40 p-3"><p className="text-xs text-foreground/50">Leads</p><p className="text-lg font-bold text-foreground">{d.crm.leads_count.toLocaleString()}</p></div>
                    <div className="rounded-xl bg-input/40 p-3"><p className="text-xs text-foreground/50">Calls (30d)</p><p className="text-lg font-bold text-foreground">{d.crm.calls_last_30d}</p></div>
                    <div className="rounded-xl bg-input/40 p-3"><p className="text-xs text-foreground/50">Followups (30d)</p><p className="text-lg font-bold text-foreground">{d.crm.followups_last_30d}</p></div>
                  </div>
                  <p className="text-xs font-bold text-foreground/50 uppercase tracking-wider mb-2">Recent Leads</p>
                  <div className="space-y-2">
                    {d.crm.recent_leads.length === 0 && <p className="text-xs text-foreground/40">No leads yet.</p>}
                    {d.crm.recent_leads.map((lead) => (
                      <div key={lead.id} className="flex items-center justify-between text-sm">
                        <span className="text-foreground/80 truncate">{lead.name}</span>
                        <span className="text-xs text-foreground/40 whitespace-nowrap ml-2">{new Date(lead.created_at).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
              {/* Billing */}
              <div className="bg-card border border-border/50 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-border/50 bg-input/30"><h2 className="font-semibold text-foreground text-sm">Billing</h2></div>
                <div className="p-5">
                  {d.billing.active_subscription ? (
                    <div className="mb-4 pb-4 border-b border-border/50 space-y-1.5 text-sm">
                      <div className="flex justify-between"><span className="text-foreground/50">Plan</span><span className="text-foreground font-medium">{d.billing.active_subscription.plan?.name ?? "—"}</span></div>
                      <div className="flex justify-between"><span className="text-foreground/50">Status</span><StatusBadge status={d.billing.active_subscription.status} /></div>
                      {d.billing.active_subscription.trial_ends_at && (
                        <div className="flex justify-between"><span className="text-foreground/50">Trial ends</span><span className="text-foreground">{new Date(d.billing.active_subscription.trial_ends_at).toLocaleDateString()}</span></div>
                      )}
                      {d.billing.active_subscription.current_period_end && (
                        <div className="flex justify-between"><span className="text-foreground/50">Renews / expires</span><span className="text-foreground">{new Date(d.billing.active_subscription.current_period_end).toLocaleDateString()}</span></div>
                      )}
                    </div>
                  ) : d.billing.latest_subscription ? (
                    <div className="mb-4 pb-4 border-b border-border/50 text-sm">
                      <p className="text-foreground/50 text-xs mb-1">No active subscription. Last known:</p>
                      <div className="flex justify-between"><span className="text-foreground/50">Plan</span><span className="text-foreground">{d.billing.latest_subscription.plan?.name ?? "—"}</span></div>
                      <div className="flex justify-between mt-1"><span className="text-foreground/50">Status</span><StatusBadge status={d.billing.latest_subscription.status} /></div>
                    </div>
                  ) : (
                    <p className="mb-4 pb-4 border-b border-border/50 text-sm text-foreground/40">This tenant has never had a subscription.</p>
                  )}
                  <p className="text-xs font-bold text-foreground/50 uppercase tracking-wider mb-2">Recent Payments</p>
                  <div className="space-y-2">
                    {d.billing.recent_payments.length === 0 && <p className="text-xs text-foreground/40">No payments yet.</p>}
                    {d.billing.recent_payments.map((p) => (
                      <div key={p.id} className="flex items-center justify-between text-sm">
                        <span className="text-foreground/80">{formatCurrency(p.amount)}</span>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={p.status} />
                          <span className="text-xs text-foreground/40 whitespace-nowrap">{new Date(p.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Operations */}
              <div className="bg-card border border-border/50 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-border/50 bg-input/30"><h2 className="font-semibold text-foreground text-sm">Operations</h2></div>
                <div className="p-5">
                  <p className="text-sm text-foreground/60">
                    Backups in this application are platform-wide only — there is no per-tenant backup status to show.
                    See the platform <Link href="/admin/backups" className="text-primary hover:underline">Backups</Link> page for the shared database backup schedule.
                  </p>
                </div>
              </div>
            </div>

            {/* Security / Activity */}
            <div className="bg-card border border-border/50 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-border/50 bg-input/30 flex items-center justify-between">
                <h2 className="font-semibold text-foreground text-sm">Security &amp; Activity</h2>
                <Link href={`/admin/audit-logs?client_id=${id}`} className="text-xs font-semibold text-primary hover:underline">View full audit log →</Link>
              </div>
              <div className="divide-y divide-border/50">
                {activityLoading ? (
                  <div className="flex items-center justify-center py-8"><div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
                ) : activity.length === 0 ? (
                  <p className="text-center py-8 text-foreground/40 text-xs">No recorded activity yet.</p>
                ) : (
                  activity.map((entry) => (
                    <div key={entry.id} className="px-5 py-3 flex items-center justify-between text-sm">
                      <div><p className="text-foreground/80">{entry.description ?? entry.action}</p><p className="text-xs text-foreground/40">{entry.actor?.name ?? "System"}</p></div>
                      <span className="text-xs text-foreground/40 whitespace-nowrap">{new Date(entry.created_at).toLocaleString()}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmingStatusChange}
        title={d?.client.status === "active" ? "Suspend this tenant?" : "Activate this tenant?"}
        message={
          d?.client.status === "active"
            ? "Every user in this tenant is immediately blocked from logging in and issuing new API tokens. Existing sessions are revoked."
            : "This restores login and API access for every user in this tenant."
        }
        confirmLabel="Confirm"
        destructive={d?.client.status === "active"}
        busy={busy}
        onConfirm={() => void toggleStatus()}
        onCancel={() => setConfirmingStatusChange(false)}
      />
    </Layout>
  );
}
