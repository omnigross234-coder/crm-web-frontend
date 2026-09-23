import { API_BASE_URL } from "./constants";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("crm_token");
}

function getErrorMessage(json: unknown, fallback: string) {
  if (!json || typeof json !== "object") return fallback;

  const body = json as { message?: unknown; data?: unknown };

  if (body.data && typeof body.data === "object") {
    const errors = Object.values(body.data as Record<string, unknown>);
    const first = errors[0];
    if (Array.isArray(first) && typeof first[0] === "string") return first[0];
    if (typeof first === "string") return first;
  }

  return typeof body.message === "string" ? body.message : fallback;
}

async function parseResponseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  const body = await parseResponseBody(res);

  if (!res.ok) {
    const statusText = res.statusText ? ` ${res.statusText}` : "";
    const fallback =
      typeof body === "string" && body.trim()
        ? body
        : `Request failed: ${res.status}${statusText}`;

    throw new Error(getErrorMessage(body, fallback));
  }
  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

// ── Types ──────────────────────────────────────────────────────────────────

export interface User {
  id: number;
  name: string;
  email: string;
  role: "admin" | "sales";
  phone: string | null;         
  status: "active" | "inactive";
}

export interface Lead {
  [key: string]: unknown;
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  source: string | null;
  status: "new" | "contacted" | "followup" | "converted" | "lost";
  notes: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  pin_code?: string | null;
  referral_name?: string | null;
  industry_type?: string | null;
  business_type?: string | null;
  product_service_interested_in?: string | null;
  budget?: string | null;
  documents?: string | null;
  annual_turnover?: string | null;
  gst_number?: string | null;
  requirement?: string | null;
  call_notes: string | null;
  assigned_to: User | null;
  created_at: string;
  updated_at: string;
}

export interface Followup {
  id: number;
  lead_id: number;
  note: string;
  status: string;
  next_followup_datetime: string | null;
  created_at: string;
}

export interface DashboardStats {
  total_leads: number;
  new_leads: number;
  followup_leads: number;
  converted: number;
  followups_today: number;
  recent_leads: Lead[];
}

export interface PaginatedLeads {
  data: Lead[];
  current_page: number;
  last_page: number;
  total: number;
  per_page: number;
}

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}
export interface CallLog {
  id: number;
  lead_id: number;
  user_id: number;
  called_at: string;
  duration_seconds: number;
  is_connected: boolean;
  lead: { id: number; name: string } | null;
  user: { id: number; name: string } | null;
}

export interface ExecutiveSummary {
  user_id: number;
  user_name: string;
  total_seconds: number;
  call_count: number;
}

export interface CallReportResponse {
  summary: ExecutiveSummary[];
  logs: CallLog[];
}

// Phase 5 (Client / Tenant Management Control Center).
export interface TenantSubscriptionSummary {
  status: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
  plan: { id: number; name: string; price: string | number; billing_cycle: string } | null;
}

export interface TenantListRow {
  id: number;
  name: string;
  slug: string;
  status: "active" | "suspended";
  created_at: string;
  users_count: number;
  leads_count: number;
  latest_lead_at: string | null;
  admin: { name: string; email: string } | null;
  subscription: TenantSubscriptionSummary | null;
}

export interface TenantDetail {
  client: TenantListRow;
  admin: { id: number; name: string; email: string } | null;
  users: {
    total: number;
    active: number;
    inactive: number;
    by_role: Record<string, number>;
  };
  crm: {
    leads_count: number;
    recent_leads: { id: number; name: string; status: string; source: string; created_at: string }[];
    calls_last_30d: number;
    followups_last_30d: number;
  };
  billing: {
    active_subscription: {
      id: number;
      status: string;
      trial_ends_at: string | null;
      current_period_end: string | null;
      plan: { id: number; name: string; price: string | number; billing_cycle: string } | null;
    } | null;
    latest_subscription: {
      id: number;
      status: string;
      current_period_end: string | null;
      plan: { id: number; name: string } | null;
    } | null;
    recent_payments: {
      id: number;
      subscription_id: number;
      gateway: string;
      amount: string | number;
      status: string;
      paid_at: string | null;
      created_at: string;
    }[];
  };
  operations: {
    per_tenant_backups_supported: boolean;
  };
}

// Phase 6 (Super Admin User Management Control Center).
export type PlatformRole = "super_admin" | "client_admin" | "admin" | "sales" | "sales_employee" | "sales_manager";

export interface PlatformUserListRow {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role: PlatformRole;
  status: "active" | "inactive";
  client_id: number | null;
  client: { id: number; name: string; status: string } | null;
  created_at: string;
  updated_at: string;
}

export type PlatformUserDetail = PlatformUserListRow;

export interface Client {
  id: number;
  name: string;
  slug: string;
  status: "active" | "suspended";
  users_count: number;
  leads_count: number;
  users?: User[];
}

// Phase 2 Foundation: Super Admin audit-log reader (GET /audit-logs).
export interface AuditLogEntry {
  id: number;
  action: string;
  module: string;
  subject_type: string | null;
  subject_id: number | null;
  description: string | null;
  meta: Record<string, unknown> | null;
  ip_address: string | null;
  actor: { id: number; name: string; email: string } | null;
  client: { id: number; name: string } | null;
  created_at: string;
}

export interface AuditLogListResponse {
  success: boolean;
  data: AuditLogEntry[];
  meta: {
    current_page: number;
    per_page: number;
    total: number;
    last_page: number;
  };
}

// Phase 4 (Billing, Plans & Subscription Control Center).
export interface PlanRecord {
  id: number;
  name: string;
  slug: string;
  price: string | number;
  billing_cycle: "monthly" | "yearly";
  seat_limit: number | null;
  features: Record<string, boolean> | string[] | null;
  status: "active" | "inactive";
  active_subscriptions_count?: number;
  trial_subscriptions_count?: number;
  cancelled_subscriptions_count?: number;
  total_subscriptions_count?: number;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  meta: { current_page: number; per_page: number; total: number; last_page: number };
}

// Super Admin Security Center (Phase 2 frontend, backed by the Phase 1
// backend: GET /admin/security-center/overview and .../auth-events).
// Every field here mirrors the backend contract exactly — nothing here
// is a score, a percentage, or an inferred risk level; see
// OGCLIENT-SUPERADMIN-SECURITY-CENTER-PHASE1-REPORT.md for the backend
// side of this contract.
export type AuthEventType =
  | "login_success"
  | "login_failed"
  | "logout"
  | "password_reset_requested"
  | "password_reset_succeeded"
  | "password_reset_failed";

export type AuthEventResult = "success" | "failure";

export interface SecurityRateLimitStatus {
  enabled: boolean;
  max_attempts: number;
  decay_minutes: number;
}

export interface SecurityOverviewData {
  period: { from: string; to: string };
  authentication: {
    login_success_count: number;
    login_failed_count: number;
    logout_count: number;
    password_reset_requested_count: number;
    password_reset_succeeded_count: number;
    password_reset_failed_count: number;
  };
  sessions: { active_count: number };
  audit_activity: { recent_count: number };
  backups: {
    latest: { status: string; created_at: string; triggered_via: string | null } | null;
  };
  rate_limiting: {
    login: SecurityRateLimitStatus;
    password_reset_request: SecurityRateLimitStatus;
    password_reset_attempt: SecurityRateLimitStatus;
    trial_signup: SecurityRateLimitStatus;
  };
  security_headers: {
    x_content_type_options: boolean;
    x_frame_options: boolean;
    referrer_policy: boolean;
    permissions_policy: boolean;
    strict_transport_security: string;
  };
  health: { up: boolean; database: boolean };
}

export interface SecurityAuthEvent {
  id: number;
  event: AuthEventType;
  result: AuthEventResult;
  failure_reason: string | null;
  login_identifier: string | null;
  ip_address: string | null;
  user: { id: number; name: string; email: string } | null;
  client: { id: number; name: string } | null;
  created_at: string;
}

export interface SecurityAuthEventListResponse {
  success: boolean;
  data: SecurityAuthEvent[];
  meta: { current_page: number; per_page: number; total: number; last_page: number };
}

// Reused from Security Workstream D (per-user session visibility) — the
// Security Center's own "your active sessions" panel calls this for the
// signed-in Super Admin's own account rather than any new endpoint.
export interface SecuritySession {
  id: number;
  name: string;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  status: "active" | "expired";
  is_current: boolean;
}

export interface SecuritySessionListResponse {
  success: boolean;
  data: SecuritySession[];
}
