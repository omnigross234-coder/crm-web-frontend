"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Layout from "@/components/Layout";
import PasswordInput from "@/components/PasswordInput";
import Pagination from "@/components/Pagination";
import StatusBadge from "@/components/StatusBadge";
import { api, ApiResponse, Client, PaginatedResponse, PlanRecord, TenantListRow } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatCurrency } from "@/lib/billingFormat";

const emptyForm = { name: "", adminName: "", adminEmail: "", adminPassword: "" };

const SUBSCRIPTION_STATUS_OPTIONS = ["", "trial", "active", "cancelled", "none"];

export default function TenantsPage() {
  const { isSuperAdmin, loading: authLoading } = useAuth();
  const router = useRouter();

  const [rows, setRows] = useState<TenantListRow[]>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [subscriptionStatus, setSubscriptionStatus] = useState("");
  const [planId, setPlanId] = useState("");
  const [plans, setPlans] = useState<PlanRecord[]>([]);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const fetchTenants = useCallback(
    (targetPage: number, s: string, st: string, sub: string, plan: string) => {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({ page: String(targetPage), per_page: "25" });
      if (s.trim()) params.set("search", s.trim());
      if (st) params.set("status", st);
      if (sub) params.set("subscription_status", sub);
      if (plan) params.set("plan_id", plan);
      api
        .get<PaginatedResponse<TenantListRow>>(`/admin/tenants?${params.toString()}`)
        .then((res) => {
          setRows(res.data);
          setLastPage(res.meta.last_page);
          setTotal(res.meta.total);
        })
        .catch((err) => setError(err instanceof Error ? err.message : "Failed to load tenants."))
        .finally(() => setLoading(false));
    },
    []
  );

  // Search debounces on its own (WEB-014-style — avoid a request per
  // keystroke); status/subscription/plan filters apply immediately since
  // they're discrete choices, not free text.
  useEffect(() => {
    if (authLoading || !isSuperAdmin) return;
    const handle = setTimeout(() => {
      setPage(1);
      fetchTenants(1, search, status, subscriptionStatus, planId);
    }, 350);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    if (!authLoading && !isSuperAdmin) { router.replace("/dashboard"); return; }
    if (!authLoading) {
      fetchTenants(page, search, status, subscriptionStatus, planId);
      api.get<ApiResponse<PlanRecord[]>>("/admin/billing/plans").then((res) => setPlans(res.data)).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isSuperAdmin, page, status, subscriptionStatus, planId]);

  function clearFilters() {
    setSearch("");
    setStatus("");
    setSubscriptionStatus("");
    setPlanId("");
    setPage(1);
    fetchTenants(1, "", "", "", "");
  }

  async function createTenant(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await api.post<ApiResponse<Client>>("/clients", {
        name: form.name.trim(),
        admin_name: form.adminName.trim(),
        admin_email: form.adminEmail.trim(),
        admin_password: form.adminPassword,
      });
      setForm(emptyForm);
      setShowCreateForm(false);
      setMessage("Tenant and first client-admin account created successfully.");
      fetchTenants(1, search, status, subscriptionStatus, planId);
      setPage(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create tenant.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(row: TenantListRow) {
    setUpdatingId(row.id);
    setError("");
    setMessage("");
    const nextStatus = row.status === "active" ? "suspended" : "active";
    try {
      await api.put<ApiResponse<Client>>(`/clients/${row.id}`, { status: nextStatus });
      setRows((items) => items.map((item) => (item.id === row.id ? { ...item, status: nextStatus } : item)));
      setMessage(`${row.name} is now ${nextStatus}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update tenant.");
    } finally {
      setUpdatingId(null);
    }
  }

  const hasFilters = Boolean(search || status || subscriptionStatus || planId);

  if (authLoading || !isSuperAdmin) return null;

  return (
    <Layout>
      <div className="p-4 sm:p-6 lg:p-8 bg-background min-h-screen max-w-7xl mx-auto">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground tracking-tight">Client / Tenant Management</h1>
            <p className="mt-1 text-foreground/60 text-sm">Manage every tenant&apos;s lifecycle, billing standing and CRM footprint.</p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreateForm((v) => !v)}
            className="bg-primary hover:brightness-110 text-primary-foreground text-sm font-semibold px-4 py-2 rounded-xl transition-all"
          >
            {showCreateForm ? "Cancel" : "+ Add Tenant"}
          </button>
        </div>

        {showCreateForm && (
          <form onSubmit={createTenant} className="mb-6 bg-card border border-border/50 rounded-2xl p-5">
            <h2 className="mb-4 font-semibold text-foreground text-sm">New Tenant + Client Admin</h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Client/company name" className="px-3 py-2 bg-input border border-border/50 rounded-xl text-sm text-foreground placeholder:text-foreground/40" />
              <input required value={form.adminName} onChange={(e) => setForm({ ...form, adminName: e.target.value })} placeholder="Admin name" className="px-3 py-2 bg-input border border-border/50 rounded-xl text-sm text-foreground placeholder:text-foreground/40" />
              <input required type="email" value={form.adminEmail} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} placeholder="Admin email" className="px-3 py-2 bg-input border border-border/50 rounded-xl text-sm text-foreground placeholder:text-foreground/40" />
              <PasswordInput required minLength={8} value={form.adminPassword} onChange={(e) => setForm({ ...form, adminPassword: e.target.value })} placeholder="Password (8+ characters)" autoComplete="new-password" className="px-3 py-2 bg-input border border-border/50 rounded-xl text-sm text-foreground placeholder:text-foreground/40" />
              <button disabled={saving} className="bg-primary hover:brightness-110 text-primary-foreground text-sm font-semibold px-4 py-2 rounded-xl disabled:opacity-50 transition-all">
                {saving ? "Creating…" : "Create Tenant"}
              </button>
            </div>
            <p className="mt-3 text-xs text-foreground/40">
              This creates the tenant and its first client-admin account only. No trial/subscription is created automatically — set one up from the tenant&apos;s detail page after creation.
            </p>
          </form>
        )}

        {message && <div className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400">{message}</div>}
        {error && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-500">
            <span>{error}</span>
            <button type="button" onClick={() => fetchTenants(page, search, status, subscriptionStatus, planId)} className="font-semibold underline underline-offset-2">Retry</button>
          </div>
        )}

        <div className="mb-6 bg-card border border-border/50 rounded-2xl p-4 flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-foreground/50 uppercase tracking-wider mb-1">Search</label>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, slug or admin email…" className="px-3 py-2 bg-input border border-border/50 rounded-xl text-sm text-foreground placeholder:text-foreground/40 w-64" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-foreground/50 uppercase tracking-wider mb-1">Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="px-3 py-2 bg-input border border-border/50 rounded-xl text-sm text-foreground w-36">
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-foreground/50 uppercase tracking-wider mb-1">Subscription</label>
            <select value={subscriptionStatus} onChange={(e) => setSubscriptionStatus(e.target.value)} className="px-3 py-2 bg-input border border-border/50 rounded-xl text-sm text-foreground w-40">
              {SUBSCRIPTION_STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s === "" ? "All subscriptions" : s === "none" ? "No subscription" : s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-foreground/50 uppercase tracking-wider mb-1">Plan</label>
            <select value={planId} onChange={(e) => setPlanId(e.target.value)} className="px-3 py-2 bg-input border border-border/50 rounded-xl text-sm text-foreground w-40">
              <option value="">All plans</option>
              {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          {hasFilters && (
            <button type="button" onClick={clearFilters} className="text-sm font-semibold text-foreground/60 hover:text-foreground px-3 py-2 rounded-xl border border-border/50 hover:bg-input/50 transition-all">
              Clear filters
            </button>
          )}
        </div>

        <div className="bg-card border border-border/50 rounded-2xl overflow-hidden shadow-sm">
          {loading ? (
            <div className="p-4 space-y-3">
              {[...Array(6)].map((_, i) => <div key={i} className="h-12 rounded-xl bg-input/40 animate-pulse" />)}
            </div>
          ) : rows.length === 0 ? (
            <p className="text-center py-16 text-foreground/40 text-sm">
              {hasFilters ? "No tenants match these filters." : "No tenants have been created yet."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] text-sm">
                <thead className="bg-input/50 border-b border-border/50">
                  <tr>
                    <th className="text-left px-5 py-3 text-xs font-bold text-foreground/50 uppercase tracking-wider">Tenant</th>
                    <th className="text-left px-5 py-3 text-xs font-bold text-foreground/50 uppercase tracking-wider">Users</th>
                    <th className="text-left px-5 py-3 text-xs font-bold text-foreground/50 uppercase tracking-wider">Leads</th>
                    <th className="text-left px-5 py-3 text-xs font-bold text-foreground/50 uppercase tracking-wider">Plan</th>
                    <th className="text-left px-5 py-3 text-xs font-bold text-foreground/50 uppercase tracking-wider">Subscription</th>
                    <th className="text-left px-5 py-3 text-xs font-bold text-foreground/50 uppercase tracking-wider">Recent Activity</th>
                    <th className="text-left px-5 py-3 text-xs font-bold text-foreground/50 uppercase tracking-wider">Status</th>
                    <th className="text-right px-5 py-3 text-xs font-bold text-foreground/50 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {rows.map((row) => (
                    <tr key={row.id} className="hover:bg-input/30 transition-colors">
                      <td className="px-5 py-4">
                        <Link href={`/admin/clients/${row.id}`} className="font-semibold text-foreground hover:text-primary transition-colors">{row.name}</Link>
                        <p className="text-xs text-foreground/40">{row.admin?.email ?? "No admin on record"}</p>
                      </td>
                      <td className="px-5 py-4 text-foreground/80">{row.users_count}</td>
                      <td className="px-5 py-4 text-foreground/80">{row.leads_count.toLocaleString()}</td>
                      <td className="px-5 py-4 text-foreground/80">{row.subscription?.plan ? `${row.subscription.plan.name} (${formatCurrency(row.subscription.plan.price)})` : <span className="text-foreground/40">—</span>}</td>
                      <td className="px-5 py-4">{row.subscription ? <StatusBadge status={row.subscription.status} /> : <span className="text-foreground/40 text-xs">None</span>}</td>
                      <td className="px-5 py-4 text-foreground/60 text-xs">{row.latest_lead_at ? new Date(row.latest_lead_at).toLocaleDateString() : "No leads yet"}</td>
                      <td className="px-5 py-4"><StatusBadge status={row.status} /></td>
                      <td className="px-5 py-4 text-right space-x-2 whitespace-nowrap">
                        <Link href={`/admin/clients/${row.id}`} className="text-xs font-semibold text-primary px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 hover:bg-primary/20 transition-all inline-block">
                          View
                        </Link>
                        <button
                          type="button"
                          onClick={() => void toggleStatus(row)}
                          disabled={updatingId === row.id}
                          className="text-xs font-semibold text-foreground/60 px-3 py-1.5 rounded-lg bg-foreground/5 border border-border/50 hover:bg-foreground/10 disabled:opacity-50 transition-all"
                        >
                          {updatingId === row.id ? "Saving…" : row.status === "active" ? "Suspend" : "Activate"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <Pagination page={page} lastPage={lastPage} total={total} onChange={setPage} />
      </div>
    </Layout>
  );
}
