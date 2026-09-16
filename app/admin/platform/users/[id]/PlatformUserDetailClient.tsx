"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import Layout from "@/components/Layout";
import ConfirmDialog from "@/components/ConfirmDialog";
import StatusBadge from "@/components/StatusBadge";
import { api, ApiResponse, AuditLogEntry, PaginatedResponse, PlatformRole, PlatformUserDetail, TenantListRow } from "@/lib/api";
import { useAuth } from "@/lib/auth";

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

type PendingAction = "status" | "reset" | null;

// Static export (output: 'export') — same placeholder pattern as
// admin/clients/[id] and admin/billing/subscriptions/[id]. The real ID is
// parsed from the URL at runtime rather than trusted from useParams().
function getUserIdFromPath(pathname: string, fallback: string) {
  const match = pathname.match(/\/admin\/platform\/users\/([^/]+)\/?$/);
  return match?.[1] ?? fallback;
}

export default function PlatformUserDetailPage() {
  const { isSuperAdmin, user: currentUser, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const id = getUserIdFromPath(pathname, params.id);

  const [detail, setDetail] = useState<PlatformUserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [activity, setActivity] = useState<AuditLogEntry[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [tenants, setTenants] = useState<TenantListRow[]>([]);

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editRole, setEditRole] = useState<PlatformRole>("sales");
  const [editClientId, setEditClientId] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [busy, setBusy] = useState(false);

  const fetchDetail = useCallback(() => {
    setLoading(true);
    setError("");
    api.get<ApiResponse<PlatformUserDetail>>(`/admin/users/${id}`)
      .then((res) => setDetail(res.data))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load user."))
      .finally(() => setLoading(false));
  }, [id]);

  const fetchActivity = useCallback(() => {
    setActivityLoading(true);
    api.get<ApiResponse<AuditLogEntry[]> & { meta: unknown }>(`/audit-logs?resource=user&subject_id=${id}&per_page=10`)
      .then((res) => setActivity(res.data))
      .catch(() => {})
      .finally(() => setActivityLoading(false));
  }, [id]);

  useEffect(() => {
    if (!authLoading && !isSuperAdmin) { router.replace("/dashboard"); return; }
    if (!authLoading) {
      fetchDetail();
      fetchActivity();
      api.get<PaginatedResponse<TenantListRow>>("/admin/tenants?per_page=100").then((res) => setTenants(res.data)).catch(() => {});
    }
  }, [authLoading, isSuperAdmin, router, fetchDetail, fetchActivity]);

  function startEdit() {
    if (!detail) return;
    setEditName(detail.name);
    setEditEmail(detail.email);
    setEditPhone(detail.phone ?? "");
    setEditRole(detail.role);
    setEditClientId(detail.client_id ? String(detail.client_id) : "");
    setSaveError("");
    setEditing(true);
  }

  async function saveEdit() {
    setSaving(true);
    setSaveError("");
    try {
      await api.put(`/admin/users/${id}`, {
        name: editName.trim(),
        email: editEmail.trim(),
        phone: editPhone.trim() || null,
        role: editRole,
        client_id: editRole === "super_admin" ? null : (editClientId ? Number(editClientId) : null),
      });
      setMessage("User updated.");
      setEditing(false);
      await Promise.all([fetchDetail(), fetchActivity()]);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to update user.");
    } finally {
      setSaving(false);
    }
  }

  async function runPendingAction() {
    if (!pendingAction || !detail) return;
    setBusy(true);
    setError("");
    try {
      if (pendingAction === "status") {
        await api.patch(`/admin/users/${id}/status`, {});
        setMessage(`${detail.name}'s status has been updated.`);
      } else {
        await api.post(`/admin/users/${id}/send-password-reset`, {});
        setMessage(`Password reset email sent to ${detail.email}.`);
      }
      setPendingAction(null);
      await Promise.all([fetchDetail(), fetchActivity()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
      setPendingAction(null);
    } finally {
      setBusy(false);
    }
  }

  if (authLoading || !isSuperAdmin) return null;

  const d = detail;
  const isSelf = currentUser?.id === Number(id);

  return (
    <Layout>
      <div className="p-4 sm:p-6 lg:p-8 bg-background min-h-screen max-w-5xl mx-auto">
        <div className="mb-6">
          <p className="text-sm text-foreground/60 mb-1">
            <Link href="/admin/platform/users" className="text-primary hover:underline">Platform Users</Link> / {d?.name ?? `#${id}`}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold text-foreground tracking-tight">{d?.name ?? `User #${id}`}</h1>
            {d && <StatusBadge status={d.status} />}
            {isSelf && <span className="text-xs font-semibold px-2.5 py-1 rounded-full border bg-foreground/5 border-border/50 text-foreground/50">You</span>}
          </div>
        </div>

        {message && <div className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400">{message}</div>}
        {error && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-500">
            <span>{error}</span>
            <button type="button" onClick={fetchDetail} className="font-semibold underline underline-offset-2">Retry</button>
          </div>
        )}

        {loading && !d ? (
          // Only the very first load (no data yet) shows the full-page
          // spinner. A refetch after an edit/action (loading briefly true
          // again while `d` already holds the previous data) must keep
          // showing that existing content instead of blanking the whole
          // page to a spinner on every successful mutation.
          <div className="flex items-center justify-center py-24"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : !d ? (
          <p className="text-center py-24 text-foreground/40 text-sm">User not found.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="bg-card border border-border/50 rounded-2xl p-5"><p className="text-xs font-bold text-foreground/50 uppercase tracking-wider">Email</p><p className="mt-2 font-semibold text-foreground truncate">{d.email}</p></div>
              <div className="bg-card border border-border/50 rounded-2xl p-5"><p className="text-xs font-bold text-foreground/50 uppercase tracking-wider">Role</p><p className="mt-2 font-semibold text-foreground">{ROLE_LABELS[d.role] ?? d.role}</p></div>
              <div className="bg-card border border-border/50 rounded-2xl p-5">
                <p className="text-xs font-bold text-foreground/50 uppercase tracking-wider">Tenant</p>
                <p className="mt-2 font-semibold text-foreground">
                  {d.client ? (
                    <Link href={`/admin/clients/${d.client.id}`} className="text-primary hover:underline">{d.client.name} →</Link>
                  ) : (
                    <span className="text-foreground/40">None (platform account)</span>
                  )}
                </p>
              </div>
              <div className="bg-card border border-border/50 rounded-2xl p-5"><p className="text-xs font-bold text-foreground/50 uppercase tracking-wider">Created</p><p className="mt-2 font-semibold text-foreground">{new Date(d.created_at).toLocaleDateString()}</p></div>
            </div>

            <div className="bg-card border border-border/50 rounded-2xl p-5 mb-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-foreground text-sm">Administrative Actions</h2>
                {!editing && <button type="button" onClick={startEdit} className="text-xs font-semibold text-primary px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 hover:bg-primary/20 transition-all">Edit Profile / Role / Tenant</button>}
              </div>

              {editing ? (
                <div className="space-y-3">
                  {saveError && <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-500">{saveError}</div>}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Full name" className="px-3 py-2 bg-input border border-border/50 rounded-xl text-sm text-foreground placeholder:text-foreground/40" />
                    <input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="Email" className="px-3 py-2 bg-input border border-border/50 rounded-xl text-sm text-foreground placeholder:text-foreground/40" />
                    <input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="Phone (optional)" className="px-3 py-2 bg-input border border-border/50 rounded-xl text-sm text-foreground placeholder:text-foreground/40" />
                    <select
                      value={editRole}
                      disabled={isSelf}
                      title={isSelf ? "You cannot change your own role" : undefined}
                      onChange={(e) => setEditRole(e.target.value as PlatformRole)}
                      className="px-3 py-2 bg-input border border-border/50 rounded-xl text-sm text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                      <option value="sales_manager" disabled>Sales Manager (not yet available)</option>
                    </select>
                    <select
                      value={editClientId}
                      disabled={isSelf || editRole === "super_admin"}
                      title={isSelf ? "You cannot change your own tenant" : undefined}
                      onChange={(e) => setEditClientId(e.target.value)}
                      className="px-3 py-2 bg-input border border-border/50 rounded-xl text-sm text-foreground disabled:opacity-40 disabled:cursor-not-allowed sm:col-span-2"
                    >
                      <option value="">{editRole === "super_admin" ? "No tenant (Super Admin)" : "Select tenant…"}</option>
                      {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  <div className="flex justify-end gap-3">
                    <button type="button" onClick={() => setEditing(false)} className="px-4 py-2 text-sm font-semibold text-foreground/70 border border-border/50 rounded-xl hover:bg-input transition-all">Cancel</button>
                    <button type="button" disabled={saving} onClick={() => void saveEdit()} className="bg-primary hover:brightness-110 text-primary-foreground text-sm font-semibold px-5 py-2 rounded-xl disabled:opacity-50 transition-all">
                      {saving ? "Saving…" : "Save Changes"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-3 items-center">
                  <button
                    type="button"
                    disabled={isSelf}
                    title={isSelf ? "You cannot deactivate your own account" : undefined}
                    onClick={() => setPendingAction("status")}
                    className={`text-xs font-semibold px-3 py-2 rounded-lg border transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                      d.status === "active"
                        ? "text-red-500 bg-red-500/10 border-red-500/20 hover:bg-red-500/20"
                        : "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/20"
                    }`}
                  >
                    {d.status === "active" ? "Deactivate User" : "Activate User"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingAction("reset")}
                    className="text-xs font-semibold text-primary px-3 py-2 rounded-lg bg-primary/10 border border-primary/20 hover:bg-primary/20 transition-all"
                  >
                    Send Password Reset
                  </button>
                  {isSelf && (
                    <p className="text-xs text-foreground/40">Self-protection: you cannot deactivate, demote, or reassign your own account.</p>
                  )}
                </div>
              )}
            </div>

            <div className="bg-card border border-border/50 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-border/50 bg-input/30">
                <h2 className="font-semibold text-foreground text-sm">Security &amp; Activity</h2>
                <p className="text-xs text-foreground/40 mt-0.5">Recent actions recorded against this account.</p>
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
        open={pendingAction !== null}
        title={
          pendingAction === "reset"
            ? "Send password reset email?"
            : d?.status === "active"
              ? "Deactivate this user?"
              : "Activate this user?"
        }
        message={
          pendingAction === "reset"
            ? `${d?.name} will receive an email with a link to set a new password. No password is shown or set here.`
            : d?.status === "active"
              ? "This immediately blocks the user from logging in and revokes their active sessions."
              : "This restores login access for this user."
        }
        confirmLabel="Confirm"
        destructive={pendingAction === "status" && d?.status === "active"}
        busy={busy}
        onConfirm={() => void runPendingAction()}
        onCancel={() => setPendingAction(null)}
      />
    </Layout>
  );
}
