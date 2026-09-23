// Phase 4 (Billing Control Center): one shared status-badge look, reused
// across plans/subscriptions/payments/invoices — four pages that would
// otherwise each hand-roll the same colored-pill markup with slightly
// different class combinations.
const TONE_BY_STATUS: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  paid: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  trial: "bg-primary/10 text-primary border-primary/20",
  pending: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  cancelled: "bg-foreground/5 text-foreground/70 border-border/50",
  suspended: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
  expired: "bg-foreground/5 text-foreground/70 border-border/50",
  trial_expired: "bg-foreground/5 text-foreground/70 border-border/50",
  failed: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
  // Security Center (Phase 2): auth_events.result uses "failure", not
  // "failed" — added rather than remapped at each call site.
  failure: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
  inactive: "bg-foreground/5 text-foreground/70 border-border/50",
};

const LABEL_OVERRIDES: Record<string, string> = {
  trial_expired: "Trial Expired",
};

export default function StatusBadge({ status }: { status: string }) {
  const tone = TONE_BY_STATUS[status] ?? "bg-foreground/5 text-foreground/70 border-border/50";
  const label = LABEL_OVERRIDES[status] ?? status.charAt(0).toUpperCase() + status.slice(1);

  return (
    <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full border capitalize ${tone}`}>
      {label}
    </span>
  );
}
