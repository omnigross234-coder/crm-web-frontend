"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  FaCheckCircle, FaClock, FaCloudDownloadAlt, FaDatabase, FaExclamationTriangle,
  FaFilter, FaHistory, FaShieldAlt, FaSync, FaTimesCircle, FaUserShield,
} from "react-icons/fa";
import Pagination from "@/components/Pagination";
import StatusBadge from "@/components/StatusBadge";
import {
  api, ApiResponse, AuditLogEntry, AuditLogListResponse, AuthEventResult, AuthEventType,
  SecurityAuthEvent, SecurityAuthEventListResponse, SecurityOverviewData, SecuritySession,
  SecuritySessionListResponse,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";

// ── Date range (mirrors the backend's own validated contract exactly:
// max 90 days, default trailing 30 days — see
// SecurityCenterController::MAX_RANGE_DAYS / resolveDateRange()) ──────────
type QuickRange = "today" | "7d" | "30d" | "90d";

const RANGE_OPTIONS: { value: QuickRange; label: string; days: number }[] = [
  { value: "today", label: "Today", days: 0 },
  { value: "7d", label: "7 days", days: 7 },
  { value: "30d", label: "30 days", days: 30 },
  { value: "90d", label: "90 days", days: 90 },
];

// The backend interprets `from`/`to` as calendar dates in ITS OWN application
// timezone (config('app.timezone') = Asia/Kolkata), not the browser's. Building
// the dates from the browser's clock made "Today" (and every preset) off by one
// day for any viewer outside IST around the IST midnight boundary — proven in
// Phase 3 certification (e.g. a UTC or Los Angeles browser at 00:00:30 IST asked
// for the previous IST day as "Today"). Dates are therefore computed in the same
// zone the backend uses; displayed event timestamps still use the viewer's locale.
const APP_TIMEZONE = "Asia/Kolkata";

function todayInAppTimezone(): string {
  // "en-CA" formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIMEZONE }).format(new Date());
}

function shiftDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function rangeFor(preset: QuickRange): { from: string; to: string } {
  const to = todayInAppTimezone();
  const days = RANGE_OPTIONS.find((r) => r.value === preset)?.days ?? 30;
  return { from: shiftDays(to, -days), to };
}

const EVENT_LABELS: Record<AuthEventType, string> = {
  login_success: "Login succeeded",
  login_failed: "Login failed",
  logout: "Logout",
  password_reset_requested: "Password reset requested",
  password_reset_succeeded: "Password reset succeeded",
  password_reset_failed: "Password reset failed",
};

const AUTH_EVENT_SORTS: { value: string; label: string }[] = [
  { value: "created_at", label: "Time" },
  { value: "event", label: "Event" },
  { value: "result", label: "Result" },
];

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

// Strings such as login identifiers, user names and tenant names are
// attacker- or tenant-controlled. React escapes them (no XSS), but Unicode
// bidirectional-override characters (e.g. U+202E) can still visually reverse
// or reorder text and spoof what an operator reads, so they are stripped for
// display. (Length is handled separately with truncation/wrapping.)
const BIDI_CONTROLS = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;
function safeText(value: string): string {
  return value.replace(BIDI_CONTROLS, "");
}

function describeWho(ev: SecurityAuthEvent): string | null {
  if (ev.user) return safeText(`${ev.user.name} (${ev.user.email})`);
  return ev.login_identifier ? safeText(ev.login_identifier) : null;
}

// The per-user sessions endpoint is unpaginated; the panel stays bounded.
const MAX_SESSIONS_SHOWN = 5;

const UNEXPECTED_RESPONSE = "The server returned an unexpected response. Please retry.";
// Sections fed by the overview show this (without a duplicate Retry) when the
// single overview request failed — the banner above carries the one Retry.
const OVERVIEW_UNAVAILABLE = "Not available — the security overview could not be loaded.";

// Shape guards: a 200 response with an unexpected body must degrade to a
// clear, retryable error state — never a thrown TypeError that blanks the
// whole page. Only the fields this page actually dereferences are checked.
function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isValidOverview(v: unknown): v is SecurityOverviewData {
  if (!isObject(v)) return false;
  return (
    isObject(v.authentication) && isObject(v.sessions) && isObject(v.audit_activity) &&
    isObject(v.backups) && isObject(v.rate_limiting) && isObject(v.security_headers) && isObject(v.health) &&
    typeof (v.authentication as Record<string, unknown>).login_success_count === "number" &&
    typeof (v.authentication as Record<string, unknown>).login_failed_count === "number" &&
    isObject(v.rate_limiting.login) && isObject(v.rate_limiting.password_reset_request) &&
    isObject(v.rate_limiting.password_reset_attempt) && isObject(v.rate_limiting.trial_signup)
  );
}

function isValidEventList(res: unknown): res is SecurityAuthEventListResponse {
  return isObject(res) && Array.isArray(res.data) && isObject(res.meta) && typeof res.meta.last_page === "number" && typeof res.meta.total === "number";
}

// fetch() rejects with a bare TypeError ("Failed to fetch") when the server is
// unreachable; every other error here already carries the backend's own
// sanitized message (or the generic "Request failed: <status>" fallback).
function friendlyError(err: unknown, fallback: string): string {
  if (err instanceof TypeError) return "Unable to reach the server. Check your connection and retry.";
  return err instanceof Error && err.message ? err.message : fallback;
}

function NotAvailable({ label = "Not available" }: { label?: string }) {
  return <span className="text-foreground/65 italic">{label}</span>;
}

// Same loading/error/empty/retry shell already established by
// PlatformDashboard.tsx's SectionCard — repeated here rather than
// imported, matching this codebase's existing convention of each
// dashboard-style page defining its own local copy (see also
// app/admin/audit-logs/page.tsx, which does the same for its own
// simpler inline patterns) rather than a shared cross-page primitive.
function SectionCard({
  title, icon, action, loading, error, onRetry, hideRetry, empty, emptyLabel, children,
}: {
  title: string; icon?: React.ReactNode; action?: React.ReactNode; loading: boolean;
  error: string; onRetry: () => void; hideRetry?: boolean; empty?: boolean; emptyLabel?: string; children: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-border/50 rounded-2xl shadow-sm overflow-hidden flex flex-col h-full">
      <div className="px-5 py-4 border-b border-border/50 bg-input/30 flex items-center justify-between gap-3">
        <h2 className="font-bold text-foreground text-sm flex items-center gap-2">
          {icon}
          {title}
        </h2>
        {action}
      </div>
      <div className="p-5 flex-1 min-h-[140px]">
        {loading ? (
          <div className="h-full flex items-center justify-center py-8" role="status" aria-live="polite">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin motion-reduce:animate-none" />
            <span className="sr-only motion-reduce:not-sr-only motion-reduce:ml-2 motion-reduce:text-xs motion-reduce:text-foreground/65">Loading…</span>
          </div>
        ) : error ? (
          <div role="alert" className="flex flex-col items-center justify-center gap-2 py-8 text-center">
            <FaExclamationTriangle className="w-4 h-4 text-red-600 dark:text-red-400" aria-hidden="true" />
            <p className="text-xs text-foreground/70">{error}</p>
            {!hideRetry && (
              <button type="button" onClick={onRetry} className="inline-flex items-center min-h-6 pointer-coarse:min-h-11 text-xs font-semibold text-primary underline underline-offset-2">
                Retry
              </button>
            )}
          </div>
        ) : empty ? (
          <p className="text-xs text-foreground/65 text-center py-8">{emptyLabel ?? "No data for this period."}</p>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

function KpiTile({
  label, value, tone, loading, icon,
}: {
  label: string; value: string | number; tone?: "neutral" | "success" | "warning" | "error"; loading: boolean; icon?: React.ReactNode;
}) {
  const toneClass = {
    neutral: "text-foreground",
    success: "text-emerald-700 dark:text-emerald-400",
    warning: "text-amber-700 dark:text-amber-400",
    error: "text-red-600 dark:text-red-400",
  }[tone ?? "neutral"];

  return (
    <div className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm">
      <p className="text-xs font-bold text-foreground/70 uppercase tracking-wider flex items-center gap-1.5">
        {icon}
        {label}
      </p>
      {loading ? (
        <div className="mt-3 h-8 w-16 rounded-lg bg-input/60 animate-pulse motion-reduce:animate-none" />
      ) : (
        <p className={`mt-2 text-2xl font-bold ${toneClass}`}>{typeof value === "number" ? value.toLocaleString() : value}</p>
      )}
    </div>
  );
}

export default function SecurityCenter() {
  const { user } = useAuth();

  // ── Global date-range filter (shared by overview + auth events) ────────
  const [preset, setPreset] = useState<QuickRange>("30d");
  const [range, setRange] = useState(() => rangeFor("30d"));

  // ── Overview ─────────────────────────────────────────────────────────
  const [overviewRaw, setOverview] = useState<SecurityOverviewData | null>(null);
  // Data belonging to a previously selected period is never shown as if it
  // were the current selection: until a response for the CURRENT range
  // arrives, sections show their loading (or error) state instead.
  const overview =
    overviewRaw && overviewRaw.period?.from === range.from && overviewRaw.period?.to === range.to ? overviewRaw : null;
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState("");
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const overviewSeq = useRef(0);

  const fetchOverview = useCallback(() => {
    const seq = ++overviewSeq.current;
    setOverviewLoading(true);
    setOverviewError("");
    const params = new URLSearchParams({ from: range.from, to: range.to });
    api.get<ApiResponse<SecurityOverviewData>>(`/admin/security-center/overview?${params.toString()}`)
      .then((res) => {
        if (seq !== overviewSeq.current) return; // stale response — a newer request already fired
        if (!isValidOverview(res?.data)) {
          setOverview(null);
          setOverviewError(UNEXPECTED_RESPONSE);
          return;
        }
        setOverview(res.data);
        setLastRefreshed(new Date());
      })
      .catch((err) => {
        if (seq !== overviewSeq.current) return;
        // A failed (re)load must not leave the previous response on screen as if
        // it were current: every overview-derived tile/card falls back to
        // "Not available" together (found in Phase 3 certification — the KPI
        // tiles kept stale numbers while the cards beside them said unavailable).
        setOverview(null);
        setOverviewError(friendlyError(err, "Failed to load the security overview."));
      })
      .finally(() => {
        if (seq === overviewSeq.current) setOverviewLoading(false);
      });
  }, [range]);

  useEffect(() => { fetchOverview(); }, [fetchOverview]);

  // ── Authentication events (paginated, filtered, sortable) ──────────────
  const [events, setEvents] = useState<SecurityAuthEvent[]>([]);
  const [eventsPage, setEventsPage] = useState(1);
  const [eventsLastPage, setEventsLastPage] = useState(1);
  const [eventsTotal, setEventsTotal] = useState(0);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState("");
  const [eventFilter, setEventFilter] = useState<AuthEventType | "">("");
  const [resultFilter, setResultFilter] = useState<AuthEventResult | "">("");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const eventsSeq = useRef(0);

  const fetchEvents = useCallback(() => {
    const seq = ++eventsSeq.current;
    setEventsLoading(true);
    setEventsError("");
    const params = new URLSearchParams({
      from: range.from, to: range.to, page: String(eventsPage), per_page: "25",
      sort_by: sortBy, sort_dir: sortDir,
    });
    if (eventFilter) params.set("event", eventFilter);
    if (resultFilter) params.set("result", resultFilter);

    api.get<SecurityAuthEventListResponse>(`/admin/security-center/auth-events?${params.toString()}`)
      .then((res) => {
        if (seq !== eventsSeq.current) return;
        if (!isValidEventList(res)) {
          setEvents([]);
          setEventsError(UNEXPECTED_RESPONSE);
          return;
        }
        setEvents(res.data);
        setEventsLastPage(res.meta.last_page);
        setEventsTotal(res.meta.total);
      })
      .catch((err) => {
        if (seq !== eventsSeq.current) return;
        setEventsError(friendlyError(err, "Failed to load authentication events."));
      })
      .finally(() => {
        if (seq === eventsSeq.current) setEventsLoading(false);
      });
  }, [range, eventsPage, sortBy, sortDir, eventFilter, resultFilter]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  // Changing a filter/sort/range returns to page 1 in the same state batch as the
  // change itself, so exactly one request fires (a reset effect would first
  // request the new filter on the old page, then request page 1 again).
  function changeEventFilter(value: AuthEventType | "") { setEventFilter(value); setEventsPage(1); }
  function changeResultFilter(value: AuthEventResult | "") { setResultFilter(value); setEventsPage(1); }
  function changeSortBy(value: string) { setSortBy(value); setEventsPage(1); }
  function toggleSortDir() { setSortDir((d) => (d === "asc" ? "desc" : "asc")); setEventsPage(1); }

  // ── Recent audit activity preview (reuses the existing /audit-logs
  // endpoint — no duplicate audit reader is created here) ────────────────
  const [auditPreview, setAuditPreview] = useState<AuditLogEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditError, setAuditError] = useState("");

  const fetchAuditPreview = useCallback(() => {
    setAuditLoading(true);
    setAuditError("");
    api.get<AuditLogListResponse>("/audit-logs?per_page=5&sort_by=created_at&sort_dir=desc")
      .then((res) => {
        if (!Array.isArray(res?.data)) { setAuditPreview([]); setAuditError(UNEXPECTED_RESPONSE); return; }
        setAuditPreview(res.data);
      })
      .catch((err) => setAuditError(friendlyError(err, "Failed to load recent activity.")))
      .finally(() => setAuditLoading(false));
  }, []);

  useEffect(() => { fetchAuditPreview(); }, [fetchAuditPreview]);

  // ── Your active sessions (reuses Workstream D's existing per-user
  // session endpoint for the signed-in Super Admin's own account — no new
  // backend surface) ──────────────────────────────────────────────────────
  const [sessions, setSessions] = useState<SecuritySession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState("");

  const fetchSessions = useCallback(() => {
    if (!user) return;
    setSessionsLoading(true);
    setSessionsError("");
    api.get<SecuritySessionListResponse>(`/admin/users/${user.id}/sessions`)
      .then((res) => {
        if (!Array.isArray(res?.data)) { setSessions([]); setSessionsError(UNEXPECTED_RESPONSE); return; }
        setSessions(res.data);
      })
      .catch((err) => setSessionsError(friendlyError(err, "Failed to load your sessions.")))
      .finally(() => setSessionsLoading(false));
  }, [user]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  // ── Manual refresh (all sections; prevents overlapping concurrent
  // requests via the same seq-ref guards each fetch already uses) ────────
  const anyLoading = overviewLoading || eventsLoading || auditLoading || sessionsLoading;
  const refreshAll = useCallback(() => {
    fetchOverview();
    fetchEvents();
    fetchAuditPreview();
    fetchSessions();
  }, [fetchOverview, fetchEvents, fetchAuditPreview, fetchSessions]);

  function selectPreset(value: QuickRange) {
    setPreset(value);
    setRange(rangeFor(value));
    setEventsPage(1);
  }

  const authChartData = useMemo(() => {
    if (!overview) return [];
    return [
      { label: "Login success", count: overview.authentication.login_success_count, key: "success" },
      { label: "Login failed", count: overview.authentication.login_failed_count, key: "failure" },
    ];
  }, [overview]);

  const rateLimiters = overview
    ? ([
        ["Login", overview.rate_limiting.login],
        ["Password reset request", overview.rate_limiting.password_reset_request],
        ["Password reset attempt", overview.rate_limiting.password_reset_attempt],
        ["Trial signup", overview.rate_limiting.trial_signup],
      ] as const)
    : [];

  return (
    <div className="p-4 sm:p-6 lg:p-8 bg-background min-h-screen max-w-[1600px] mx-auto">
      {/* HEADER */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight flex items-center gap-2.5">
            <FaShieldAlt className="w-6 h-6 text-primary" aria-hidden="true" />
            Security Center
          </h1>
          <p className="mt-1 text-foreground/70 text-sm">
            Factual authentication, session, audit, and backup visibility for {range.from} to {range.to} (dates in IST).
            {lastRefreshed && <span className="text-foreground/65"> · Last refreshed {lastRefreshed.toLocaleTimeString()}</span>}
          </p>
        </div>
      </div>

      {/* GLOBAL FILTER BAR */}
      <div className="mb-6 bg-card border border-border/50 rounded-2xl shadow-sm p-4 flex flex-wrap items-center gap-3">
        <span className="text-xs font-bold text-foreground/65 uppercase tracking-wider flex items-center gap-1.5">
          <FaFilter className="w-3 h-3" aria-hidden="true" />
          Period
        </span>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick date range">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => selectPreset(opt.value)}
              aria-pressed={preset === opt.value}
              className={`px-3 py-1.5 pointer-coarse:min-h-11 rounded-xl text-sm font-medium transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                preset === opt.value
                  ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                  : "bg-input border border-border/50 text-foreground/75 hover:text-foreground hover:border-primary/40"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <button
          type="button"
          onClick={refreshAll}
          disabled={anyLoading}
          className="p-2.5 pointer-coarse:min-h-11 pointer-coarse:min-w-11 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary inline-flex items-center justify-center rounded-xl bg-input border border-border/50 text-foreground/75 hover:text-primary hover:border-primary/40 transition-all disabled:opacity-50"
          title="Refresh"
          aria-label="Refresh security center data"
        >
          <FaSync className={`w-3.5 h-3.5 ${anyLoading ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden="true" />
        </button>
      </div>

      {/* OVERVIEW */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
        <KpiTile
          label="Login Successes"
          value={overview ? overview.authentication.login_success_count : "—"}
          tone="success"
          loading={overviewLoading && !overview}
          icon={<FaCheckCircle className="w-3 h-3" aria-hidden="true" />}
        />
        <KpiTile
          label="Login Failures"
          value={overview ? overview.authentication.login_failed_count : "—"}
                    loading={overviewLoading && !overview}
          icon={<FaTimesCircle className="w-3 h-3" aria-hidden="true" />}
        />
        <KpiTile
          label="Active Sessions"
          value={overview ? overview.sessions.active_count : "—"}
          loading={overviewLoading && !overview}
          icon={<FaUserShield className="w-3 h-3" aria-hidden="true" />}
        />
        <KpiTile
          label="Audit Events"
          value={overview ? overview.audit_activity.recent_count : "—"}
          loading={overviewLoading && !overview}
          icon={<FaHistory className="w-3 h-3" aria-hidden="true" />}
        />
        <div className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm">
          <p className="text-xs font-bold text-foreground/70 uppercase tracking-wider flex items-center gap-1.5">
            <FaCloudDownloadAlt className="w-3 h-3" aria-hidden="true" />
            Latest Backup
          </p>
          {overviewLoading && !overview ? (
            <div className="mt-3 h-8 w-20 rounded-lg bg-input/60 animate-pulse motion-reduce:animate-none" />
          ) : overview?.backups.latest ? (
            <div className="mt-2 flex items-center gap-2">
              {overview.backups.latest.status === "created" ? (
                <FaCheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" aria-hidden="true" />
              ) : (
                <FaTimesCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" aria-hidden="true" />
              )}
              <span className="text-sm font-bold text-foreground capitalize">{overview.backups.latest.status}</span>
            </div>
          ) : overview ? (
            <p className="mt-3 text-sm text-foreground/65">No backup activity recorded yet.</p>
          ) : (
            <p className="mt-3 text-sm"><NotAvailable /></p>
          )}
        </div>
        <div className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm">
          <p className="text-xs font-bold text-foreground/70 uppercase tracking-wider flex items-center gap-1.5">
            <FaDatabase className="w-3 h-3" aria-hidden="true" />
            Readiness
          </p>
          {overviewLoading && !overview ? (
            <div className="mt-3 h-8 w-20 rounded-lg bg-input/60 animate-pulse motion-reduce:animate-none" />
          ) : overview ? (
            <div className="mt-2 flex items-center gap-2">
              {overview.health.up && overview.health.database ? (
                <FaCheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" aria-hidden="true" />
              ) : (
                <FaExclamationTriangle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" aria-hidden="true" />
              )}
              <span className="text-sm font-bold text-foreground">{overview.health.up && overview.health.database ? "Ready" : "Degraded"}</span>
            </div>
          ) : (
            <NotAvailable />
          )}
        </div>
      </div>

      {overviewError && (
        <div role="alert" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm font-medium text-red-700 dark:text-red-400">
          <span>{overviewError}</span>
          <button type="button" onClick={fetchOverview} className="inline-flex items-center min-h-6 pointer-coarse:min-h-11 font-semibold underline underline-offset-2">Retry</button>
        </div>
      )}

      {/* AUTHENTICATION + SESSIONS */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 mb-6">
        <div className="xl:col-span-2">
          <SectionCard
            title="Authentication — Success vs. Failure"
            icon={<FaCheckCircle className="w-3.5 h-3.5 text-primary" aria-hidden="true" />}
            loading={overviewLoading && !overview}
            error={overviewError ? OVERVIEW_UNAVAILABLE : ""}
            hideRetry
            onRetry={fetchOverview}
            empty={!!overview && overview.authentication.login_success_count === 0 && overview.authentication.login_failed_count === 0}
            emptyLabel="No login attempts recorded for this period."
          >
            <p className="text-xs text-foreground/65 mb-3">
              Totals for the selected period ({range.from} to {range.to}) — not a time-series trend.
            </p>
            <div role="img" aria-label={`Authentication totals: ${authChartData.map((d) => `${d.label} ${d.count}`).join(", ")}`}>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={authChartData} layout="vertical" margin={{ left: 8 }} accessibilityLayer={false}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: "var(--foreground)" }} allowDecimals={false} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="label" tick={{ fontSize: 11, fill: "var(--foreground)" }} width={100} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--foreground)", fontSize: 12 }}
                />
                <Bar dataKey="count" radius={[0, 6, 6, 0]} isAnimationActive={false}>
                  {authChartData.map((entry) => (
                    <Cell key={entry.key} className={entry.key === "failure" ? "fill-red-600 dark:fill-red-400" : "fill-emerald-600 dark:fill-emerald-400"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            </div>
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-input/40">
                <span className="text-foreground/70">Logout</span>
                <span className="font-semibold text-foreground">{overview?.authentication.logout_count ?? 0}</span>
              </div>
              <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-input/40">
                <span className="text-foreground/70">Reset requested</span>
                <span className="font-semibold text-foreground">{overview?.authentication.password_reset_requested_count ?? 0}</span>
              </div>
              <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-input/40">
                <span className="text-foreground/70">Reset succeeded</span>
                <span className="font-semibold text-foreground">{overview?.authentication.password_reset_succeeded_count ?? 0}</span>
              </div>
              <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-input/40">
                <span className="text-foreground/70">Reset failed</span>
                <span className="font-semibold text-foreground">{overview?.authentication.password_reset_failed_count ?? 0}</span>
              </div>
            </div>
          </SectionCard>
        </div>

        <SectionCard
          title="Your Sessions"
          icon={<FaUserShield className="w-3.5 h-3.5 text-primary" aria-hidden="true" />}
          loading={sessionsLoading}
          error={sessionsError}
          onRetry={fetchSessions}
          empty={sessions.length === 0}
          emptyLabel="No active sessions found for your account."
        >
          <ul className="space-y-2">
            {[...sessions]
              .sort((a, b) => Number(b.is_current) - Number(a.is_current))
              .slice(0, MAX_SESSIONS_SHOWN)
              .map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 text-sm px-1">
                <div className="min-w-0">
                  <p className="text-foreground/80 truncate flex items-center gap-1.5">
                    {s.name}
                    {s.is_current && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary/15 text-primary uppercase tracking-wide">This device</span>
                    )}
                  </p>
                  <p className="text-xs text-foreground/65">Last used {formatDateTime(s.last_used_at)}</p>
                </div>
                <StatusBadge status={s.status} />
              </li>
            ))}
          </ul>
          {sessions.length > MAX_SESSIONS_SHOWN && (
            <p className="mt-3 text-xs text-foreground/65">
              Showing {MAX_SESSIONS_SHOWN} of {sessions.length} sessions ({sessions.length - MAX_SESSIONS_SHOWN} more not shown).
            </p>
          )}
        </SectionCard>
      </div>

      {/* AUDIT ACTIVITY + BACKUPS */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-6">
        <SectionCard
          title="Recent Audit Activity"
          icon={<FaHistory className="w-3.5 h-3.5 text-primary" aria-hidden="true" />}
          loading={auditLoading}
          error={auditError}
          onRetry={fetchAuditPreview}
          empty={auditPreview.length === 0}
          emptyLabel="No recent administrative activity."
          action={<Link href="/admin/audit-logs" className="inline-flex items-center min-h-6 pointer-coarse:min-h-11 text-xs font-semibold text-primary hover:brightness-110">View all →</Link>}
        >
          <div className="divide-y divide-border/50">
            {auditPreview.map((entry) => (
              <div key={entry.id} className="py-2.5 first:pt-0 flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="text-foreground/80 truncate">{entry.description ?? entry.action}</p>
                  <p className="text-xs text-foreground/65 truncate">{entry.actor ? safeText(entry.actor.name) : "System"}{entry.client ? ` · ${safeText(entry.client.name)}` : ""}</p>
                </div>
                <span className="text-xs text-foreground/65 whitespace-nowrap">{formatDateTime(entry.created_at)}</span>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Backup Status"
          icon={<FaCloudDownloadAlt className="w-3.5 h-3.5 text-primary" aria-hidden="true" />}
          loading={overviewLoading && !overview}
          error={overviewError ? OVERVIEW_UNAVAILABLE : ""}
            hideRetry
          onRetry={fetchOverview}
          empty={!!overview && !overview.backups.latest}
          emptyLabel="No backup activity recorded yet."
          action={<Link href="/admin/backups" className="inline-flex items-center min-h-6 pointer-coarse:min-h-11 text-xs font-semibold text-primary hover:brightness-110">Manage backups →</Link>}
        >
          {overview?.backups.latest && (
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                overview.backups.latest.status === "created" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-red-500/10 text-red-600 dark:text-red-400"
              }`}>
                {overview.backups.latest.status === "created" ? <FaCheckCircle className="w-4 h-4" aria-hidden="true" /> : <FaTimesCircle className="w-4 h-4" aria-hidden="true" />}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground capitalize">Last attempt: {overview.backups.latest.status}</p>
                <p className="text-xs text-foreground/65">{formatDateTime(overview.backups.latest.created_at)}</p>
                <p className="text-xs text-foreground/65">
                  {overview.backups.latest.triggered_via ? `Triggered via ${overview.backups.latest.triggered_via.replace(/_/g, " ")}` : <NotAvailable label="Trigger source not available" />}
                </p>
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      {/* PROTECTION STATUS */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-6">
        <SectionCard
          title="Rate Limiting"
          icon={<FaClock className="w-3.5 h-3.5 text-primary" aria-hidden="true" />}
          loading={overviewLoading && !overview}
          error={overviewError ? OVERVIEW_UNAVAILABLE : ""}
            hideRetry
          onRetry={fetchOverview}
        >
          <div className="space-y-2">
            {rateLimiters.map(([label, status]) => (
              <div key={label} className="flex items-center justify-between text-sm px-1 py-1">
                <span className="text-foreground/75">{label}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-foreground/65">{status.max_attempts} / {status.decay_minutes}m</span>
                  <StatusBadge status={status.enabled ? "active" : "inactive"} />
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Security Headers & Health"
          icon={<FaShieldAlt className="w-3.5 h-3.5 text-primary" aria-hidden="true" />}
          loading={overviewLoading && !overview}
          error={overviewError ? OVERVIEW_UNAVAILABLE : ""}
            hideRetry
          onRetry={fetchOverview}
        >
          {overview && (
            <div className="space-y-1.5 text-sm">
              {[
                ["X-Content-Type-Options", overview.security_headers.x_content_type_options],
                ["X-Frame-Options", overview.security_headers.x_frame_options],
                ["Referrer-Policy", overview.security_headers.referrer_policy],
                ["Permissions-Policy", overview.security_headers.permissions_policy],
              ].map(([label, on]) => (
                <div key={label as string} className="flex items-center justify-between px-1 py-1">
                  <span className="text-foreground/75">{label}</span>
                  {on ? <FaCheckCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" aria-label="Enabled" /> : <FaTimesCircle className="w-3.5 h-3.5 text-red-600 dark:text-red-400" aria-label="Disabled" />}
                </div>
              ))}
              <div className="flex items-center justify-between px-1 py-1">
                <span className="text-foreground/75">Strict-Transport-Security</span>
                <span className="text-xs text-foreground/65 text-right">{overview.security_headers.strict_transport_security.replace(/_/g, " ")}</span>
              </div>
              <div className="border-t border-border/50 my-2" />
              <div className="flex items-center justify-between px-1 py-1">
                <span className="text-foreground/75">Database connectivity</span>
                {overview.health.database ? <FaCheckCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" aria-label="Connected" /> : <FaTimesCircle className="w-3.5 h-3.5 text-red-600 dark:text-red-400" aria-label="Unavailable" />}
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      {/* AUTHENTICATION EVENTS TABLE */}
      <div className="bg-card border border-border/50 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-border/50 bg-input/30 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-bold text-foreground text-sm flex items-center gap-2">
            <FaHistory className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
            Authentication Events
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={eventFilter}
              onChange={(e) => changeEventFilter(e.target.value as AuthEventType | "")}
              aria-label="Filter by event type"
              className="px-3 py-1.5 pointer-coarse:min-h-11 bg-input border border-border/50 rounded-xl text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <option value="">All events</option>
              {(Object.keys(EVENT_LABELS) as AuthEventType[]).map((ev) => (
                <option key={ev} value={ev}>{EVENT_LABELS[ev]}</option>
              ))}
            </select>
            <select
              value={resultFilter}
              onChange={(e) => changeResultFilter(e.target.value as AuthEventResult | "")}
              aria-label="Filter by result"
              className="px-3 py-1.5 pointer-coarse:min-h-11 bg-input border border-border/50 rounded-xl text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <option value="">All results</option>
              <option value="success">Success</option>
              <option value="failure">Failure</option>
            </select>
            <select
              value={sortBy}
              onChange={(e) => changeSortBy(e.target.value)}
              aria-label="Sort by"
              className="px-3 py-1.5 pointer-coarse:min-h-11 bg-input border border-border/50 rounded-xl text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {AUTH_EVENT_SORTS.map((s) => <option key={s.value} value={s.value}>Sort: {s.label}</option>)}
            </select>
            <button
              type="button"
              onClick={toggleSortDir}
              className="px-3 py-1.5 pointer-coarse:min-h-11 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary rounded-xl border border-border/50 text-xs font-semibold text-foreground/75 hover:text-foreground hover:border-primary/40 transition-all"
              aria-label={`Sort direction: ${sortDir === "asc" ? "ascending" : "descending"}`}
            >
              {sortDir === "asc" ? "↑ Asc" : "↓ Desc"}
            </button>
          </div>
        </div>

        <div className="p-5">
          {eventsError && (
            <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-400">
              <span>{eventsError}</span>
              <button type="button" onClick={fetchEvents} className="inline-flex items-center min-h-6 pointer-coarse:min-h-11 font-semibold underline underline-offset-2">Retry</button>
            </div>
          )}

          <p className="sr-only" role="status" aria-live="polite">
            {!eventsLoading && !eventsError ? `${eventsTotal.toLocaleString()} authentication events, page ${eventsPage} of ${eventsLastPage}.` : ""}
          </p>

          {eventsLoading ? (
            <div className="flex items-center justify-center py-16 gap-2 text-foreground/65" role="status" aria-live="polite">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin motion-reduce:animate-none" />
              Loading…
            </div>
          ) : !eventsError && events.length === 0 ? (
            <p className="text-center py-16 text-foreground/65 text-sm">
              {eventFilter || resultFilter ? "No events match these filters." : "No authentication events for this period."}
            </p>
          ) : !eventsError && (
            <>
              {/* Desktop / tablet: real table */}
              <div className="hidden xl:block overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">Authentication events for the selected period</caption>
                  <thead className="bg-input/50 border-b border-border/50">
                    <tr>
                      <th scope="col" className="text-left px-3 py-3 text-xs font-bold text-foreground/65 uppercase tracking-wider">When</th>
                      <th scope="col" className="text-left px-3 py-3 text-xs font-bold text-foreground/65 uppercase tracking-wider">Event</th>
                      <th scope="col" className="text-left px-3 py-3 text-xs font-bold text-foreground/65 uppercase tracking-wider">Result</th>
                      <th scope="col" className="text-left px-3 py-3 text-xs font-bold text-foreground/65 uppercase tracking-wider">User</th>
                      <th scope="col" className="text-left px-3 py-3 text-xs font-bold text-foreground/65 uppercase tracking-wider">Client</th>
                      <th scope="col" className="text-left px-3 py-3 text-xs font-bold text-foreground/65 uppercase tracking-wider">IP Address</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {events.map((ev) => (
                      <tr key={ev.id} className="hover:bg-input/30 transition-colors duration-150">
                        <td className="px-3 py-3 text-foreground/75 min-w-[7.5rem]">{formatDateTime(ev.created_at)}</td>
                        <td className="px-3 py-3 text-foreground/80">{EVENT_LABELS[ev.event]}</td>
                        <td className="px-3 py-3"><StatusBadge status={ev.result} /></td>
                        <td className="px-3 py-3 text-foreground/75">
                          {(() => {
                            const who = describeWho(ev);
                            return who ? <span className="block max-w-[15rem] truncate" title={who}>{who}</span> : <NotAvailable />;
                          })()}
                        </td>
                        <td className="px-3 py-3 text-foreground/75">
                          {ev.client ? <span className="block max-w-[10rem] truncate" title={safeText(ev.client.name)}>{safeText(ev.client.name)}</span> : "—"}
                        </td>
                        <td className="px-3 py-3 text-foreground/70 font-mono text-xs">{ev.ip_address ?? <NotAvailable />}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile: card list, not a squeezed horizontal table */}
              <div className="xl:hidden space-y-3">
                {events.map((ev) => (
                  <div key={ev.id} className="rounded-xl border border-border/50 bg-input/20 p-3.5">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-sm font-semibold text-foreground">{EVENT_LABELS[ev.event]}</span>
                      <StatusBadge status={ev.result} />
                    </div>
                    <p className="text-xs text-foreground/70 [overflow-wrap:anywhere]">
                      {describeWho(ev) ?? "Unknown identifier"}
                    </p>
                    {ev.client && <p className="text-xs text-foreground/65 [overflow-wrap:anywhere]">{safeText(ev.client.name)}</p>}
                    <div className="mt-2 flex items-center justify-between text-xs text-foreground/65">
                      <span className="font-mono">{ev.ip_address ?? "—"}</span>
                      <span>{formatDateTime(ev.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>

              <Pagination page={eventsPage} lastPage={eventsLastPage} total={eventsTotal} onChange={setEventsPage} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
