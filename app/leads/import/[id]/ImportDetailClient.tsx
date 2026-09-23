"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  FaArrowLeft,
  FaBan,
  FaCheckCircle,
  FaExclamationTriangle,
  FaFileDownload,
  FaRedo,
} from "react-icons/fa";
import Layout from "@/components/Layout";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useAuth } from "@/lib/auth";
import {
  ACTIVE_STATUSES,
  DuplicateStrategy,
  LeadImport,
  LeadImportError,
  PreviewResponse,
  STATUS_LABELS,
  SuggestedMappingEntry,
  cancelImport,
  confirmImport,
  downloadErrorReport,
  getImport,
  getImportErrors,
  getPreview,
  listMappingTemplates,
  MappingTemplate,
  resumeImport,
  submitMapping,
} from "@/lib/leadImport";
import StepIndicator from "@/components/import/StepIndicator";
import MappingTable from "@/components/import/MappingTable";
import DuplicateStrategyPicker from "@/components/import/DuplicateStrategyPicker";
import RowErrorsTable from "@/components/import/RowErrorsTable";
import ImportProgressCard from "@/components/import/ImportProgressCard";

const POLL_INTERVAL_MS = 2500;
const SETTLE_POLL_COUNT = 3;

function getImportIdFromPath(pathname: string, fallback: string) {
  const match = pathname.match(/\/leads\/import\/([^/]+)\/?$/);
  return match?.[1] ?? fallback;
}

function suggestionCacheKey(id: string) {
  return `lead_import_suggested_${id}`;
}

export default function ImportDetailClient() {
  const { id: routeId } = useParams<{ id: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  // Static exports only include the placeholder route. The real import ID is
  // therefore carried in the URL query string; direct dynamic routes remain
  // supported for non-static deployments.
  const id = searchParams.get("import_id") ?? getImportIdFromPath(pathname, routeId);
  const clientId = searchParams.get("client_id") ? Number(searchParams.get("client_id")) : null;
  // Carries the tenant context through to the history list — a super_admin
  // viewing this page arrived via a client_id in the URL (see above), and
  // the history endpoint requires that same client_id for a super_admin
  // caller (LeadImportController::resolveClientId). Without it, "Import
  // History" from here would 422.
  const historyHref = clientId ? `/leads/import/history?client_id=${clientId}` : "/leads/import/history";
  const { canImportLeads, loading: authLoading } = useAuth();

  const [importJob, setImportJob] = useState<LeadImport | null>(null);
  const [loadError, setLoadError] = useState("");
  const [initialLoading, setInitialLoading] = useState(true);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  // ── Mapping step state ──────────────────────────────────────────
  const [suggested, setSuggested] = useState<Record<string, SuggestedMappingEntry> | null>(null);
  const [mappingDraft, setMappingDraft] = useState<Record<string, string | null>>({});
  const [mappingError, setMappingError] = useState("");
  const [mappingSubmitting, setMappingSubmitting] = useState(false);
  const [templates, setTemplates] = useState<MappingTemplate[]>([]);
  const [saveTemplateName, setSaveTemplateName] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");

  // ── Confirm step state ───────────────────────────────────────────
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [strategy, setStrategy] = useState<DuplicateStrategy | null>(null);
  const [confirmSubmitting, setConfirmSubmitting] = useState(false);
  const [confirmError, setConfirmError] = useState("");

  // ── Errors table state ───────────────────────────────────────────
  const [errorsData, setErrorsData] = useState<LeadImportError[]>([]);
  const [errorsPage, setErrorsPage] = useState(1);
  const [errorsLastPage, setErrorsLastPage] = useState(1);
  const [errorsLoading, setErrorsLoading] = useState(false);

  // ── Cancel state ─────────────────────────────────────────────────
  const [cancelling, setCancelling] = useState(false);
  const [cancelRequested, setCancelRequested] = useState(false);
  const [resuming, setResuming] = useState(false);

  // ── Confirmation dialogs (UX-WEB-006) ─────────────────────────────
  const [confirmingStart, setConfirmingStart] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [confirmingLeaveMapping, setConfirmingLeaveMapping] = useState(false);
  const mappingTouchedRef = useRef(false);

  const fetchImport = useCallback(async (): Promise<LeadImport | null> => {
    try {
      const res = await getImport(id, clientId);
      if (!mountedRef.current) return null;
      setImportJob(res.data);
      setLoadError("");
      return res.data;
    } catch (err) {
      if (!mountedRef.current) return null;
      setLoadError(err instanceof Error ? err.message : "Could not load this import.");
      return null;
    }
  }, [id, clientId]);

  // Initial load.
  useEffect(() => {
    mountedRef.current = true;
    setInitialLoading(true);
    fetchImport().finally(() => mountedRef.current && setInitialLoading(false));
    return () => {
      mountedRef.current = false;
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Polling loop while the backend is actively doing work — never a
  // long-held HTTP request, just a short GET every couple seconds. Stops
  // entirely once the status needs a user action or has reached a terminal
  // state.
  useEffect(() => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    if (!importJob) return;
    if (!ACTIVE_STATUSES.includes(importJob.status)) return;

    pollTimer.current = setTimeout(() => {
      if (mountedRef.current) fetchImport();
    }, POLL_INTERVAL_MS);

    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, [importJob, fetchImport]);

  // Load mapping suggestions (cached at upload time — see the upload page)
  // and saved templates once we reach the mapping step.
  useEffect(() => {
    if (importJob?.status !== "mapping") return;

    try {
      const cached = sessionStorage.getItem(suggestionCacheKey(id));
      if (cached) {
        const parsed = JSON.parse(cached) as Record<string, SuggestedMappingEntry> | null;
        setSuggested(parsed);
        if (parsed) {
          const draft: Record<string, string | null> = {};
          for (const [header, entry] of Object.entries(parsed)) {
            draft[header] = entry.field;
          }
          setMappingDraft((prev) => (Object.keys(prev).length ? prev : draft));
        }
      }
    } catch {
      // No cached suggestion (different session/device, or storage cleared)
      // — mapping just starts blank; still fully usable.
    }

    listMappingTemplates(clientId)
      .then((res) => setTemplates(res.data))
      .catch(() => setTemplates([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importJob?.status, id]);

  // Load the preview once we reach awaiting_confirmation.
  useEffect(() => {
    if (importJob?.status !== "awaiting_confirmation") return;
    setPreviewLoading(true);
    getPreview(id, clientId)
      .then((res) => mountedRef.current && setPreview(res.data))
      .catch((err) => mountedRef.current && setConfirmError(err instanceof Error ? err.message : "Could not load preview."))
      .finally(() => mountedRef.current && setPreviewLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importJob?.status, id]);

  // Load row errors whenever invalid_rows > 0 and we're at a step where
  // they're relevant (confirm/results).
  const shouldShowErrors =
    importJob && importJob.invalid_rows + importJob.failed_rows > 0 &&
    (importJob.status === "awaiting_confirmation" || importJob.status === "completed" || importJob.status === "failed");

  useEffect(() => {
    if (!shouldShowErrors) return;
    setErrorsLoading(true);
    getImportErrors(id, errorsPage, clientId)
      .then((res) => {
        if (!mountedRef.current) return;
        setErrorsData(res.data.data);
        setErrorsLastPage(res.data.last_page);
      })
      .catch(() => {})
      .finally(() => mountedRef.current && setErrorsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldShowErrors, errorsPage, id]);

  function toggleMapping(header: string, field: string | null) {
    mappingTouchedRef.current = true;
    setMappingDraft((prev) => ({ ...prev, [header]: field }));
  }

  function applyTemplate(templateId: string) {
    setSelectedTemplateId(templateId);
    const template = templates.find((t) => String(t.id) === templateId);
    if (!template || !importJob?.header_map) return;
    const draft: Record<string, string | null> = {};
    for (const header of importJob.header_map) {
      draft[header] = template.mapping[header] ?? null;
    }
    setMappingDraft(draft);
  }

  async function handleSubmitMapping() {
    if (mappingSubmitting) return;
    setMappingError("");
    setMappingSubmitting(true);
    try {
      const mapping: Record<string, string> = {};
      for (const [header, field] of Object.entries(mappingDraft)) {
        if (field) mapping[header] = field;
      }
      const res = await submitMapping(id, mapping, saveTemplateName.trim() || null, clientId);
      setImportJob(res.data);
      sessionStorage.removeItem(suggestionCacheKey(id));
    } catch (err) {
      setMappingError(err instanceof Error ? err.message : "Could not save this mapping.");
    } finally {
      setMappingSubmitting(false);
    }
  }

  function requestConfirm() {
    if (!strategy || confirmSubmitting) return;
    setConfirmingStart(true);
  }

  async function handleConfirm() {
    if (!strategy) return;
    setConfirmingStart(false);
    setConfirmError("");
    setConfirmSubmitting(true);
    try {
      const res = await confirmImport(id, strategy, clientId);
      setImportJob(res.data);
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : "Could not confirm this import.");
    } finally {
      setConfirmSubmitting(false);
    }
  }

  async function handleCancel() {
    if (cancelling) return;
    setConfirmingCancel(false);
    setCancelling(true);
    setCancelRequested(true);
    try {
      const res = await cancelImport(id, clientId);
      setImportJob(res.data);
      // Settle: a batch that was already in flight elsewhere (a cron tick)
      // can commit its last few rows moments after this call returns —
      // a few short follow-up polls let the final counts catch up before
      // showing the Results view as final.
      for (let i = 0; i < SETTLE_POLL_COUNT; i++) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        if (!mountedRef.current) return;
        await fetchImport();
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not cancel this import.");
    } finally {
      if (mountedRef.current) {
        setCancelling(false);
        setCancelRequested(false);
      }
    }
  }

  async function handleResume() {
    if (resuming) return;
    setResuming(true);
    try {
      const res = await resumeImport(id, clientId);
      setImportJob(res.data);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not resume this import.");
    } finally {
      if (mountedRef.current) setResuming(false);
    }
  }

  async function handleDownloadErrors() {
    if (!importJob) return;
    try {
      await downloadErrorReport(id, `import-errors-${id}.csv`, clientId);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not download the error report.");
    }
  }

  if (authLoading || !canImportLeads) return null;

  return (
    <Layout>
      <div className="mx-auto max-w-4xl p-4 sm:p-6 lg:p-8">
        <Link
          href="/leads/import"
          onClick={(e) => {
            if (importJob?.status === "mapping" && mappingTouchedRef.current) {
              e.preventDefault();
              setConfirmingLeaveMapping(true);
            }
          }}
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          <FaArrowLeft className="h-3 w-3" /> New Import
        </Link>

        {initialLoading ? (
          <div className="mt-10 flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : !importJob ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
            <p className="font-semibold">{loadError || "This import could not be found."}</p>
            <p className="mt-1 text-xs">It may belong to a different tenant, have been removed, or the link may be incorrect.</p>
            <Link href={historyHref} className="mt-4 inline-block text-sm font-semibold underline">
              View Import History
            </Link>
          </div>
        ) : (
          <div className="mt-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h1 className="text-xl font-bold text-foreground">{importJob.original_filename}</h1>
                <p className="text-xs text-muted-text">Import ID: {importJob.id}</p>
              </div>
              {loadError && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-yellow-100 px-3 py-1 text-xs font-semibold text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-400">
                  <FaExclamationTriangle className="h-3 w-3" /> {loadError} — retrying
                </span>
              )}
            </div>

            <StepIndicator status={importJob.status} />

            {/* ── Analyzing ── */}
            {(importJob.status === "uploaded" || importJob.status === "analyzing") && (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-10 text-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                <p className="font-semibold text-foreground">Analyzing your file…</p>
                <p className="text-sm text-muted-text">
                  {importJob.total_rows
                    ? `${importJob.total_rows.toLocaleString()} rows read so far. Large files may take a little while — you can safely leave this page and come back.`
                    : "This usually only takes a moment. You can safely leave this page and come back."}
                </p>
              </div>
            )}

            {/* ── Mapping ── */}
            {importJob.status === "mapping" && importJob.header_map && (
              <div className="space-y-5">
                {templates.length > 0 && (
                  <div className="rounded-xl border border-border bg-card p-4">
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-text">
                      Use a saved mapping template
                    </label>
                    <select
                      value={selectedTemplateId}
                      onChange={(e) => applyTemplate(e.target.value)}
                      className="w-full max-w-xs rounded-lg border border-border bg-input px-3 py-2 text-sm"
                    >
                      <option value="">— None —</option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <MappingTable
                  headers={importJob.header_map}
                  suggested={suggested}
                  mapping={mappingDraft}
                  onChange={toggleMapping}
                />

                <div className="rounded-xl border border-border bg-card p-4">
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-text">
                    Save this mapping as a template (optional)
                  </label>
                  <input
                    value={saveTemplateName}
                    onChange={(e) => setSaveTemplateName(e.target.value)}
                    placeholder="e.g. Standard export from our old CRM"
                    maxLength={100}
                    className="w-full max-w-sm rounded-lg border border-border bg-input px-3 py-2 text-sm"
                  />
                </div>

                {mappingError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
                    {mappingError}
                  </div>
                )}

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleSubmitMapping}
                    disabled={mappingSubmitting}
                    className="rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-40"
                  >
                    {mappingSubmitting ? "Validating…" : "Continue to Validation"}
                  </button>
                </div>
              </div>
            )}

            {/* ── Validating ── */}
            {importJob.status === "validating" && (
              <div className="space-y-5">
                <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-10 text-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                  <p className="font-semibold text-foreground">Validating rows…</p>
                  <p className="text-sm text-muted-text">Checking every row against your CRM&apos;s lead rules and existing records for duplicates.</p>
                </div>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <MiniStat label="Valid" value={importJob.valid_rows} />
                  <MiniStat label="Invalid" value={importJob.invalid_rows} />
                  <MiniStat label="Duplicate" value={importJob.duplicate_rows} />
                </div>
              </div>
            )}

            {/* ── Awaiting confirmation: preview + duplicate strategy ── */}
            {importJob.status === "awaiting_confirmation" && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <MiniStat label="Total Rows" value={importJob.total_rows ?? 0} />
                  <MiniStat label="Valid" value={importJob.valid_rows} tone="good" />
                  <MiniStat label="Invalid" value={importJob.invalid_rows} tone={importJob.invalid_rows > 0 ? "bad" : "neutral"} />
                  <MiniStat label="Duplicate" value={importJob.duplicate_rows} />
                </div>

                <div>
                  <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-text">Duplicate Handling</h2>
                  <DuplicateStrategyPicker
                    value={strategy}
                    onChange={setStrategy}
                    counts={{
                      total: importJob.total_rows,
                      valid: importJob.valid_rows,
                      invalid: importJob.invalid_rows,
                      duplicate: importJob.duplicate_rows,
                    }}
                  />
                </div>

                <div>
                  <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-text">
                    Preview {preview && `(first ${preview.sample.length.toLocaleString()} rows)`}
                  </h2>
                  {previewLoading ? (
                    <div className="flex justify-center py-8">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    </div>
                  ) : preview && preview.sample.length > 0 && preview.headers ? (
                    <div className="overflow-hidden rounded-2xl border border-border bg-card">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="border-b border-border bg-input/50">
                            <tr>
                              <th className="px-3 py-2 text-left font-semibold uppercase text-muted-text">Row</th>
                              {preview.headers.map((h) => (
                                <th key={h} className="px-3 py-2 text-left font-semibold uppercase text-muted-text">
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {preview.sample.map((row) => (
                              <tr key={row._row}>
                                <td className="px-3 py-2 font-mono text-muted-text">{row._row}</td>
                                {preview.headers!.map((h) => (
                                  <td key={h} className="max-w-[160px] truncate px-3 py-2 text-foreground" title={String(row[h] ?? "")}>
                                    {row[h] ?? <span className="italic text-muted-text">empty</span>}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="border-t border-border bg-input/30 px-3 py-2 text-[11px] text-muted-text">
                        Showing a sample — the full file will be processed after you confirm.
                        {importJob.mapping?.phone && " Phone numbers shown here are already normalized to the format that will be saved."}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-text">No preview rows available.</p>
                  )}
                </div>

                {shouldShowErrors && (
                  <div>
                    <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-text">Row-Level Errors</h2>
                    <RowErrorsTable
                      errors={errorsData}
                      page={errorsPage}
                      lastPage={errorsLastPage}
                      onPageChange={setErrorsPage}
                      loading={errorsLoading}
                    />
                  </div>
                )}

                {confirmError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
                    {confirmError}
                  </div>
                )}

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={requestConfirm}
                    disabled={!strategy || confirmSubmitting}
                    className="rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {confirmSubmitting ? "Starting Import…" : `Confirm and Import ${importJob.valid_rows + importJob.duplicate_rows} Lead(s)`}
                  </button>
                </div>
              </div>
            )}

            {/* ── Importing ── */}
            {(importJob.status === "queued" || importJob.status === "processing" || importJob.status === "paused") && (
              <div className="space-y-4">
                {cancelRequested && (
                  <div className="rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm font-medium text-yellow-800 dark:border-yellow-500/30 dark:bg-yellow-500/10 dark:text-yellow-400">
                    Cancellation requested — waiting for the current batch to finish…
                  </div>
                )}
                <ImportProgressCard importJob={importJob} />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setConfirmingCancel(true)}
                    disabled={cancelling}
                    className="inline-flex items-center gap-2 rounded-xl border border-red-300 px-5 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10"
                  >
                    <FaBan className="h-3.5 w-3.5" /> {cancelling ? "Cancelling…" : "Cancel Import"}
                  </button>
                </div>
              </div>
            )}

            {/* ── Results ── */}
            {(importJob.status === "completed" || importJob.status === "failed" || importJob.status === "cancelled") && (
              <div className="space-y-5">
                <div
                  className={`flex items-center gap-3 rounded-2xl border p-5 ${
                    importJob.status === "completed"
                      ? "border-green-200 bg-green-50 dark:border-green-500/30 dark:bg-green-500/10"
                      : importJob.status === "failed"
                        ? "border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-500/10"
                        : "border-gray-300 bg-gray-100 dark:border-gray-500/30 dark:bg-gray-500/10"
                  }`}
                >
                  {importJob.status === "completed" ? (
                    <FaCheckCircle className="h-6 w-6 shrink-0 text-green-600" />
                  ) : (
                    <FaExclamationTriangle className={`h-6 w-6 shrink-0 ${importJob.status === "failed" ? "text-red-600" : "text-gray-500"}`} />
                  )}
                  <div>
                    <p className="font-semibold text-foreground">{STATUS_LABELS[importJob.status]}</p>
                    {importJob.status === "failed" && importJob.failure_message && (
                      <p className="mt-0.5 text-sm text-muted-text">{importJob.failure_message}</p>
                    )}
                    {importJob.status === "cancelled" && (
                      <p className="mt-0.5 text-sm text-muted-text">Any leads already created before cancellation remain in your CRM.</p>
                    )}
                  </div>
                </div>

                <ImportProgressCard importJob={importJob} showEstimate={false} />

                {shouldShowErrors && (
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <h2 className="text-sm font-bold uppercase tracking-wide text-muted-text">Row-Level Errors</h2>
                      <button
                        type="button"
                        onClick={handleDownloadErrors}
                        className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-input/60"
                      >
                        <FaFileDownload className="h-3 w-3" /> Download Error Report
                      </button>
                    </div>
                    <RowErrorsTable
                      errors={errorsData}
                      page={errorsPage}
                      lastPage={errorsLastPage}
                      onPageChange={setErrorsPage}
                      loading={errorsLoading}
                    />
                  </div>
                )}

                <div className="flex flex-wrap justify-end gap-3">
                  {importJob.status === "failed" && (
                    <button
                      type="button"
                      onClick={handleResume}
                      disabled={resuming}
                      className="inline-flex items-center gap-2 rounded-xl border border-border px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-input/60 disabled:opacity-40"
                    >
                      <FaRedo className="h-3.5 w-3.5" /> {resuming ? "Resuming…" : "Resume Import"}
                    </button>
                  )}
                  <Link
                    href={historyHref}
                    className="rounded-xl bg-primary px-5 py-2.5 text-center text-sm font-bold text-primary-foreground hover:opacity-90"
                  >
                    View Import History
                  </Link>
                  <Link
                    href="/leads"
                    className="rounded-xl border border-border px-5 py-2.5 text-center text-sm font-semibold text-foreground hover:bg-input/60"
                  >
                    Go to Leads
                  </Link>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmingStart}
        title="Start the import now?"
        message={
          strategy
            ? `Duplicate strategy: ${strategy === "skip" ? "Skip duplicates" : "Update duplicates"}. ${
                strategy === "skip"
                  ? "Existing matching leads will be left untouched."
                  : "Existing matching leads will be overwritten with the spreadsheet's values."
              } This cannot be undone.`
            : ""
        }
        confirmLabel="Start Import"
        busy={confirmSubmitting}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmingStart(false)}
      />

      <ConfirmDialog
        open={confirmingCancel}
        title="Cancel this import?"
        message="Any leads already created will remain — this only stops further processing."
        confirmLabel="Cancel Import"
        destructive
        busy={cancelling}
        onConfirm={handleCancel}
        onCancel={() => setConfirmingCancel(false)}
      />

      <ConfirmDialog
        open={confirmingLeaveMapping}
        title="Discard your column mapping?"
        message="You've manually mapped columns for this import that haven't been saved yet. Leaving now will discard that mapping — the import itself stays in your history."
        confirmLabel="Discard and leave"
        cancelLabel="Keep mapping"
        destructive
        onConfirm={() => {
          setConfirmingLeaveMapping(false);
          router.push("/leads/import");
        }}
        onCancel={() => setConfirmingLeaveMapping(false)}
      />
    </Layout>
  );
}

function MiniStat({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "good" | "bad" | "neutral" }) {
  const toneClass = tone === "good" ? "text-green-600" : tone === "bad" ? "text-red-600" : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-input/40 px-3 py-2.5 text-center">
      <p className={`text-lg font-bold ${toneClass}`}>{value.toLocaleString()}</p>
      <p className="text-[11px] uppercase tracking-wide text-muted-text">{label}</p>
    </div>
  );
}
