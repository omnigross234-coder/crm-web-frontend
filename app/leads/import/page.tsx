"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FaCloudUploadAlt, FaFileCsv, FaHistory } from "react-icons/fa";
import Layout from "@/components/Layout";
import { useAuth } from "@/lib/auth";
import { api, ApiResponse, Client } from "@/lib/api";
import { uploadImport } from "@/lib/leadImport";

const ACCEPTED_EXTENSIONS = [".csv", ".xlsx", ".xls"];

function hasAcceptedExtension(filename: string): boolean {
  const lower = filename.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export default function LeadImportUploadPage() {
  const { canImportLeads, isSuperAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState<number | "">("");
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!authLoading && !canImportLeads) {
      router.replace("/dashboard");
    }
  }, [authLoading, canImportLeads, router]);

  useEffect(() => {
    if (isSuperAdmin) {
      api.get<ApiResponse<Client[]>>("/clients").then((res) => setClients(res.data)).catch(() => {
        // The client picker just won't populate; the inline validation
        // below still requires a selection before upload is possible.
      });
    }
  }, [isSuperAdmin]);

  // Cancel any in-flight upload if the user navigates away mid-upload.
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  function validateAndSetFile(file: File) {
    setError("");
    if (!hasAcceptedExtension(file.name)) {
      setError("Unsupported file type. Please choose a .csv, .xlsx, or .xls file.");
      setSelectedFile(null);
      return;
    }
    setSelectedFile(file);
  }

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    if (uploading) return;
    const file = e.dataTransfer.files?.[0];
    if (file) validateAndSetFile(file);
  }, [uploading]);

  async function handleUpload() {
    if (!selectedFile || uploading) return; // guards against double-submit
    if (isSuperAdmin && !clientId) {
      setError("Select which client tenant to import leads into.");
      return;
    }

    setError("");
    setUploading(true);
    setProgress(0);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await uploadImport(
        selectedFile,
        isSuperAdmin ? (clientId as number) : null,
        setProgress,
        controller.signal
      );
      // Cached so the mapping step can still show auto-suggestions if the
      // user refreshes the detail page in this same browser — see
      // ImportDetailClient, which reads this same key.
      try {
        sessionStorage.setItem(
          `lead_import_suggested_${res.data.import.id}`,
          JSON.stringify(res.data.suggested_mapping)
        );
      } catch {
        // Best-effort convenience only; mapping still works without it.
      }

      // The production app is a static export, so only the generated
      // /leads/import/placeholder/ detail page exists on the host. Keep the
      // actual UUID in the query string rather than navigating to a file the
      // static host cannot serve.
      const query = new URLSearchParams({ import_id: res.data.import.id });
      if (isSuperAdmin && clientId) query.set("client_id", String(clientId));
      router.push(`/leads/import/placeholder?${query.toString()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
      setUploading(false);
    }
  }

  if (authLoading || !canImportLeads) return null;

  return (
    <Layout>
      <div className="mx-auto max-w-3xl p-4 sm:p-6 lg:p-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Import Leads</h1>
            <p className="mt-1 text-sm text-muted-text">
              Upload a spreadsheet to bulk-add leads. You&apos;ll map columns and review everything before anything is created.
            </p>
          </div>
          <Link
            href={isSuperAdmin && clientId ? `/leads/import/history?client_id=${clientId}` : "/leads/import/history"}
            className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-input/60"
          >
            <FaHistory className="h-3.5 w-3.5" /> Import History
          </Link>
        </div>

        {isSuperAdmin && (
          <div className="mb-5 rounded-2xl border border-border bg-card p-4">
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-text">
              Client Tenant <span className="text-red-500">*</span>
            </label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value ? Number(e.target.value) : "")}
              className="w-full rounded-xl border border-border bg-input px-4 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="">— Select a client —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-muted-text">
              As a super admin, you must explicitly choose which tenant these leads belong to.
            </p>
          </div>
        )}

        {error && (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
            {error}
          </div>
        )}

        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (!uploading) setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          onClick={() => !uploading && fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === " ") && !uploading) fileInputRef.current?.click();
          }}
          className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${
            dragActive ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/50"
          } ${uploading ? "pointer-events-none opacity-60" : ""}`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_EXTENSIONS.join(",")}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) validateAndSetFile(file);
              e.target.value = "";
            }}
          />
          {selectedFile ? (
            <>
              <FaFileCsv className="h-10 w-10 text-primary" aria-hidden="true" />
              <p className="font-semibold text-foreground">{selectedFile.name}</p>
              <p className="text-xs text-muted-text">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
            </>
          ) : (
            <>
              <FaCloudUploadAlt className="h-10 w-10 text-muted-text" aria-hidden="true" />
              <p className="font-semibold text-foreground">Drag and drop your file here</p>
              <p className="text-xs text-muted-text">or click to browse — .csv, .xlsx, or .xls</p>
            </>
          )}
        </div>

        {uploading && (
          <div className="mt-5">
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-input">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-2 text-center text-xs text-muted-text">Uploading… {progress}%</p>
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={handleUpload}
            disabled={!selectedFile || uploading || (isSuperAdmin && !clientId)}
            className="rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {uploading ? "Uploading…" : "Upload and Continue"}
          </button>
        </div>
      </div>
    </Layout>
  );
}
