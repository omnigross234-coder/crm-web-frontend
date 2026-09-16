"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Layout from "@/components/Layout";
import ConfirmDialog from "@/components/ConfirmDialog";
import Pagination from "@/components/Pagination";
import StatusBadge from "@/components/StatusBadge";
import { api, ApiResponse, PaginatedResponse, PlatformRole, PlatformUserListRow, TenantListRow } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const emptyForm = { name: "", email: "", role: "sales" as PlatformRole, client_id: "" };

const ROLE_OPTIONS: { value: PlatformRole; label: string }[] = [
  { value: "super_admin", label: "Super Admin" },
  { value: "client_admin", label: "Client Admin" },
  { value: "admin", label: "Admin" },
  { value: "sales", label: "Sales" },
  { value: "sales_employee", label: "Sales Employee" },
];

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  client_admin: "Client Admin",
  admin: "Admin",
  sales: "Sales",
  sales_employee: "Sales Employee",
  sales_manager: "Sales Manager",
};

type PendingAction =
  | { kind: "status"; user: PlatformUserListRow }
  | { kind: "reset"; user: PlatformUserListRow }
  | null;

export default function PlatformUsersPage() {
  const { isSuperAdmin, loading: authLoading } = useAuth();
  const router = useRouter();

  const [rows, setRows] = useState<PlatformUserListRow[]>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [clientId, setClientId] = useState("");
  const [tenants, setTenants] = useState<TenantListRow[]>([]);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [busy, setBusy] = useState(false);

  const fetchUsers = useCallback(
    (targetPage: number, s: string, r: string, st: string, cid: string) => {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({ page: String(targetPage), per_page: "25" });
      if (s.trim()) params.set("search", s.trim());
      if (r) params.set("role", r);
      if (st) params.set("status", st);
      if (cid) params.set("client_id", cid);
      api
        .get<PaginatedResponse<PlatformUserListRow>>(`/admin/users?${params.toString()}`)
        .then((res) => {
          setRows(res.data);
          setLastPage(res.meta.last_page);
          setTotal(res.meta.total);
        })
        .catch((err) => setError(err instanceof Error ? err.message : "Failed to load users."))
        .finally(() => setLoading(false));
    },
    []
  );

  useEffect(() => {
    if (authLoading || !isSuperAdmin) return;
    const handle = setTimeout(() => {
      setPage(1);
      fetchUsers(1, search, role, status, clientId);
    }, 350);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    if (!authLoading && !isSuperAdmin) { router.replace("/dashboard"); return; }
    if (!authLoading) {
      fetchUsers(page, search, role, status, clientId);
      api.get<PaginatedResponse<TenantListRow>>("/admin/tenants?per_page=100").then((res) => setTenants(res.data)).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isSuperAdmin, page, role, status, clientId]);

  function clearFilters() {
    setSearch("");
    setRole("");
    setStatus("");
    setClientId("");
    setPage(1);
    fetchUsers(1, "", "", "", "");
  }

  async function createUser(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setFormError("");
    setMessage("");
    try {
      await api.post<ApiResponse<PlatformUserListRow>>("/admin/users", {
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
        client_id: form.role === "super_admin" ? undefined : (form.client_id ? Number(form.client_id) : undefined),
      });
      setForm(emptyForm);
      setShowCreateForm(false);
      setMessage("User created. A password setup email has been sent.");
      setPage(1);
      fetchUsers(1, search, role, status, clientId);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create user.");
    } finally {
      setSaving(false);
    }
  }

  async function runPendingAction() {
    if (!pendingAction) return;
    setBusy(true);
    setError("");
    try {
      if (pendingAction.kind === "status") {
        const res = await api.patch<ApiResponse<{ id: number; status: string }>>(`/admin/users/${pendingAction.user.id}/status`, {});
        setRows((items) => items.map((item) => (item.id === pendingAction.user.id ? { ...item, status: res.data.status as "active" | "inactive" } : item)));
        setMessage(`${pendingAction.user.name} is now ${res.data.status}.`);
      } else {
        await api.post(`/admin/users/${pendingAction.user.id}/send-password-reset`, {});
        setMessage(`Password reset email sent to ${pendingAction.user.email}.`);
      }
      setPendingAction(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
      setPendingAction(null);
    } finally {
      setBusy(false);
    }
  }

  const hasFilters = Boolean(search || role || status || clientId);

  if (authLoading || !isSuperAdmin) return null;

  return (
    <Layout>
      <div className="p-4 sm:p-6 lg:p-8 bg-background min-h-screen max-w-7xl mx-auto">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground tracking-tight">Platform User Management</h1>
            <p className="mt-1 text-foreground/60 text-sm">Manage user accounts across every tenant on the platform.</p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreateForm((v) => !v)}
            className="bg-primary hover:brightness-110 text-primary-foreground text-sm font-semibold px-4 py-2 rounded-xl transition-all"
          >
            {showCreateForm ? "Cancel" : "+ Add User"}
          </button>
        </div>

        {showCreateForm && (
          <form onSubmit={createUser} className="mb-6 bg-card border border-border/50 rounded-2xl p-5">
            <h2 className="mb-4 font-semibold text-foreground text-sm">New Platform User</h2>
            {formError && <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-500">{formError}</div>}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name" className="px-3 py-2 bg-input border border-border/50 rounded-xl text-sm text-foreground placeholder:text-foreground/40" />
              <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" className="px-3 py-2 bg-input border border-border/50 rounded-xl text-sm text-foreground placeholder:text-foreground/40" />
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as PlatformRole, client_id: e.target.value === "super_admin" ? "" : form.client_id })} className="px-3 py-2 bg-input border border-border/50 rounded-xl text-sm text-foreground">
                {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                <option value="sales_manager" disabled>Sales Manager (not yet available)</option>
              </select>
              <select
                required={form.role !== "super_admin"}
                disabled={form.role === "super_admin"}
                value={form.client_id}
                onChange={(e) => setForm({ ...form, client_id: e.target.value })}
                className="px-3 py-2 bg-input border border-border/50 rounded-xl text-sm text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <option value="">{form.role === "super_admin" ? "No tenant (Super Admin)" : "Select tenant…"}</option>
                {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <button disabled={saving} className="bg-primary hover:brightness-110 text-primary-foreground text-sm font-semibold px-4 py-2 rounded-xl disabled:opacity-50 transition-all">
                {saving ? "Creating…" : "Create User"}
              </button>
            </div>
            <p className="mt-3 text-xs text-foreground/40">
              No password is set here. The new user receives a password setup email using the existing secure reset flow.
            </p>
          </form>
        )}

        {message && <div className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400">{message}</div>}
        {error && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-500">
            <span>{error}</span>
            <button type="button" onClick={() => fetchUsers(page, search, role, status, clientId)} className="font-semibold underline underline-offset-2">Retry</button>
          </div>
        )}

        <div className="mb-6 bg-card border border-border/50 rounded-2xl p-4 flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-foreground/50 uppercase tracking-wider mb-1">Search</label>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or email…" className="px-3 py-2 bg-input border border-border/50 rounded-xl text-sm text-foreground placeholder:text-foreground/40 w-56" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-foreground/50 uppercase tracking-wider mb-1">Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value)} className="px-3 py-2 bg-input border border-border/50 rounded-xl text-sm text-foreground w-40">
              <option value="">All roles</option>
              {Object.entries(ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-foreground/50 uppercase tracking-wider mb-1">Tenant</label>
            <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="px-3 py-2 bg-input border border-border/50 rounded-xl text-sm text-foreground w-44">
              <option value="">All tenants</option>
              {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-foreground/50 uppercase tracking-wider mb-1">Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="px-3 py-2 bg-input border border-border/50 rounded-xl text-sm text-foreground w-36">
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
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
              {hasFilters ? "No users match these filters." : "No users have been created yet."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="bg-input/50 border-b border-border/50">
                  <tr>
                    <th className="text-left px-5 py-3 text-xs font-bold text-foreground/50 uppercase tracking-wider">User</th>
                    <th className="text-left px-5 py-3 text-xs font-bold text-foreground/50 uppercase tracking-wider">Role</th>
                    <th className="text-left px-5 py-3 text-xs font-bold text-foreground/50 uppercase tracking-wider">Tenant</th>
                    <th className="text-left px-5 py-3 text-xs font-bold text-foreground/50 uppercase tracking-wider">Status</th>
                    <th className="text-left px-5 py-3 text-xs font-bold text-foreground/50 uppercase tracking-wider">Created</th>
                    <th className="text-right px-5 py-3 text-xs font-bold text-foreground/50 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {rows.map((u) => (
                    <tr key={u.id} className="hover:bg-input/30 transition-colors">
                      <td className="px-5 py-4">
                        <Link href={`/admin/platform/users/${u.id}`} className="font-semibold text-foreground hover:text-primary transition-colors">{u.name}</Link>
                        <p className="text-xs text-foreground/40">{u.email}</p>
                      </td>
                      <td className="px-5 py-4 text-foreground/80 capitalize">{ROLE_LABELS[u.role] ?? u.role}</td>
                      <td className="px-5 py-4 text-foreground/70">{u.client?.name ?? <span className="text-foreground/40">—</span>}</td>
                      <td className="px-5 py-4"><StatusBadge status={u.status} /></td>
                      <td className="px-5 py-4 text-foreground/60 text-xs">{new Date(u.created_at).toLocaleDateString()}</td>
                      <td className="px-5 py-4 text-right space-x-2 whitespace-nowrap">
                        <Link href={`/admin/platform/users/${u.id}`} className="text-xs font-semibold text-primary px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 hover:bg-primary/20 transition-all inline-block">
                          View
                        </Link>
                        <button
                          type="button"
                          onClick={() => setPendingAction({ kind: "status", user: u })}
                          className="text-xs font-semibold text-foreground/60 px-3 py-1.5 rounded-lg bg-foreground/5 border border-border/50 hover:bg-foreground/10 transition-all"
                        >
                          {u.status === "active" ? "Deactivate" : "Activate"}
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

      <ConfirmDialog
        open={pendingAction !== null}
        title={
          pendingAction?.kind === "reset"
            ? "Send password reset email?"
            : pendingAction?.user.status === "active"
              ? "Deactivate this user?"
              : "Activate this user?"
        }
        message={
          pendingAction?.kind === "reset"
            ? `${pendingAction.user.name} will receive an email with a link to set a new password. No password is shown or set here.`
            : pendingAction?.user.status === "active"
              ? "This immediately blocks the user from logging in and revokes their active sessions."
              : "This restores login access for this user."
        }
        confirmLabel="Confirm"
        destructive={pendingAction?.kind === "status" && pendingAction.user.status === "active"}
        busy={busy}
        onConfirm={() => void runPendingAction()}
        onCancel={() => setPendingAction(null)}
      />
    </Layout>
  );
}
