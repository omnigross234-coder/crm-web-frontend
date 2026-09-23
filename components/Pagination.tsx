// Phase 4 (Billing Control Center): shared prev/next pagination control,
// matching the pattern already used inline on the Phase 2 audit-logs page
// but extracted now that four billing pages need the identical thing.
export default function Pagination({
  page, lastPage, total, onChange,
}: {
  page: number; lastPage: number; total: number; onChange: (page: number) => void;
}) {
  if (lastPage <= 1) return null;

  return (
    <div className="mt-4 flex items-center justify-between text-sm text-foreground/60">
      <span>Page {page} of {lastPage} ({total.toLocaleString()} total)</span>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onChange(Math.max(1, page - 1))}
          className="px-3 py-1.5 pointer-coarse:min-h-11 rounded-lg border border-border/50 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-input/50 transition-all"
        >
          Previous
        </button>
        <button
          type="button"
          disabled={page >= lastPage}
          onClick={() => onChange(Math.min(lastPage, page + 1))}
          className="px-3 py-1.5 pointer-coarse:min-h-11 rounded-lg border border-border/50 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-input/50 transition-all"
        >
          Next
        </button>
      </div>
    </div>
  );
}
