"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FaArrowLeft, FaArrowRight, FaFileDownload, FaPlus } from "react-icons/fa";
import Layout from "@/components/Layout";
import { useAuth } from "@/lib/auth";
import {
  LeadImport,
  STATUS_LABELS,
  downloadErrorReport,
  listImports,
  statusBadgeClass,
} from "@/lib/leadImport";

function formatDateTime(value: string): string {
  try {
    return new Date(value).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return value;
  }
}

function formatDuration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt || !completedAt) return "—";
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) return `${minutes}m ${totalSeconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export default function LeadImportHistoryPage() {
  return (
    <Suspense fallback={null}>
      <LeadImportHistoryPageContent />
    </Suspense>
  );
}

function LeadImportHistoryPageContent() {
  const { canImportLeads, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const clientId = searchParams.get("client_id") ? Number(searchParams.get("client_id")) : null;

  const [imports, setImports] = useState<LeadImport[]>([]);
  const [pagination, setPagination] = useState({ page: 1, last: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchHistory = useCallback(
    async (page: number) => {
      setLoading(true);
      setError("");
      try {
        const res = await listImports(page, clientId);
        setImports(res.data.data);
        setPagination({ page: res.data.current_page, last: res.data.last_page, total: res.data.total });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load import history.");
      } finally {
        setLoading(false);
      }
    },
    [clientId]
  );

  useEffect(() => {
    if (!authLoading && !canImportLeads) {
      router.replace("/dashboard");
      return;
    }
    if (!authLoading && canImportLeads) fetchHistory(1);
  }, [authLoading, canImportLeads, fetchHistory, router]);

  async function handleDownload(importJob: LeadImport) {
    try {
      await downloadErrorReport(importJob.id, `import-errors-${importJob.id}.csv`, clientId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not download the error report.");
    }
  }

  const detailHref = (id: string) => {
    const query = new URLSearchParams({ import_id: id });
    if (clientId) query.set("client_id", String(clientId));

    return `/leads/import/placeholder?${query.toString()}`;
  };

  if (authLoading || !canImportLeads) return null;

  return (
    <Layout>
      <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Import History</h1>
            <p className="mt-1 text-sm text-muted-text">
              {pagination.total.toLocaleString()} import{pagination.total === 1 ? "" : "s"} for your tenant.
            </p>
          </div>
          <Link
            href={clientId ? `/leads/import?client_id=${clientId}` : "/leads/import"}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            <FaPlus className="h-3.5 w-3.5" /> New Import
          </Link>
        </div>

        {error && (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => fetchHistory(pagination.page)}
              className="font-semibold underline underline-offset-2"
            >
              Retry
            </button>
          </div>
        )}

        {/* Only rendered once a request has actually succeeded — an error
            means we don't know how many imports exist, so it must never be
            presented next to (or instead of) the real "No imports yet."
            empty state, which is only correct after a genuine zero-result
            success. */}
        {!error && (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-muted-text">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                Loading…
              </div>
            ) : imports.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-sm text-muted-text">No imports yet.</p>
                <Link href="/leads/import" className="mt-3 inline-block text-sm font-semibold text-primary hover:underline">
                  Import your first spreadsheet
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] text-sm">
                  <thead className="border-b border-border bg-input/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-text">File</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-text">Created By</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-text">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-text">Status</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-text">Total</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-text">Created</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-text">Updated</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-text">Skipped</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-text">Errors</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-text">Duration</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-text">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {imports.map((item) => (
                      <tr key={item.id} className="hover:bg-input/30">
                        <td className="max-w-[200px] truncate px-4 py-3 font-medium text-foreground" title={item.original_filename}>
                          {item.original_filename}
                        </td>
                        <td className="px-4 py-3 text-muted-text">{item.user?.name ?? "—"}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-text">{formatDateTime(item.created_at)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(item.status)}`}>
                            {STATUS_LABELS[item.status]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-foreground">{(item.total_rows ?? 0).toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-green-600">{item.created_rows.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-foreground">{item.updated_rows.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-foreground">{item.skipped_rows.toLocaleString()}</td>
                        <td className={`px-4 py-3 text-right ${item.failed_rows > 0 ? "text-red-600" : "text-foreground"}`}>
                          {item.failed_rows.toLocaleString()}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-text">
                          {formatDuration(item.started_at, item.completed_at)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {item.failed_rows + item.invalid_rows > 0 && (
                              <button
                                type="button"
                                onClick={() => handleDownload(item)}
                                aria-label="Download error report"
                                title="Download error report"
                                className="rounded-lg border border-border p-1.5 text-muted-text hover:bg-input/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                              >
                                <FaFileDownload className="h-3.5 w-3.5" />
                              </button>
                            )}
                            <Link
                              href={detailHref(item.id)}
                              className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-input/60"
                            >
                              View
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {!error && pagination.last > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              disabled={pagination.page === 1}
              onClick={() => fetchHistory(pagination.page - 1)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground disabled:opacity-40"
            >
              <FaArrowLeft className="h-3 w-3" /> Previous
            </button>
            <span className="text-xs text-muted-text">
              Page {pagination.page} of {pagination.last}
            </span>
            <button
              type="button"
              disabled={pagination.page === pagination.last}
              onClick={() => fetchHistory(pagination.page + 1)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground disabled:opacity-40"
            >
              Next <FaArrowRight className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
}
