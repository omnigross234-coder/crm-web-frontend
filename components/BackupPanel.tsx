"use client";
import { useEffect, useState } from "react";
import {
  FiAlertCircle,
  FiCheckCircle,
  FiDatabase,
  FiRefreshCw,
  FiUploadCloud,
} from "react-icons/fi";
import { FaGoogleDrive } from "react-icons/fa";
import { api, ApiResponse } from "@/lib/api";

interface BackupFile {
  name: string;
  size: number;
  modified: string;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

export default function BackupPanel() {
  const [backups, setBackups]       = useState<BackupFile[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [running, setRunning]       = useState(false);
  const [message, setMessage]       = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function loadBackups() {
    setLoadingList(true);
    try {
      const res = await api.get<ApiResponse<BackupFile[]>>("/backup/list");
      setBackups(res.data);
    } catch (e: unknown) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Failed to load backups" });
    } finally {
      setLoadingList(false);
    }
  }

  async function handleManualBackup() {
    setRunning(true);
    setMessage(null);
    try {
      const res = await api.post<ApiResponse<{ filename: string }>>("/backup/run", {});
      setMessage({ type: "success", text: `${res.message} — ${res.data.filename}` });
      loadBackups();
    } catch (e: unknown) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Backup failed" });
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => { loadBackups(); }, []);

  return (
    <div className="mt-8 bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Database Backup</h2>
          <p className="flex items-center gap-1.5 text-sm text-gray-500 mt-0.5">
            <span>
              Auto backup daily at <span className="font-medium text-gray-700">2:00 AM</span>
            </span>
            <FaGoogleDrive className="h-4 w-4 shrink-0 text-green-600" aria-hidden="true" />
            <span>Google Drive</span>
          </p>
        </div>
        <button
          onClick={handleManualBackup}
          disabled={running}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          {running ? (
            <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Backing up…</>
          ) : (
            <><FiUploadCloud className="h-4 w-4" aria-hidden="true" /> Backup Now</>
          )}
        </button>
      </div>

      {message && (
        <div className={`mb-4 flex items-center gap-2 text-sm rounded-lg px-4 py-3 ${
          message.type === "success"
            ? "bg-green-50 border border-green-200 text-green-700"
            : "bg-red-50 border border-red-200 text-red-700"
        }`}>
          {message.type === "success" ? (
            <FiCheckCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <FiAlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      <div className="border border-gray-100 rounded-lg overflow-hidden">
        <div className="bg-gray-50 px-4 py-2.5 flex items-center justify-between border-b border-gray-100">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Google Drive — CRM_Backups
          </span>
          <button
            onClick={loadBackups}
            className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700"
          >
            <FiRefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Refresh
          </button>
        </div>

        {loadingList ? (
          <div className="flex items-center justify-center py-8 gap-2 text-gray-400 text-sm">
            <span className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            Loading…
          </div>
        ) : backups.length === 0 ? (
          <p className="text-center py-8 text-gray-400 text-sm">No backups yet.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {backups.map((b, idx) => (
              <div key={b.name} className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50">
                <FiDatabase className="h-5 w-5 shrink-0 text-blue-600" aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{b.name}</p>
                  <p className="text-xs text-gray-400">{b.modified}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">{formatBytes(b.size)}</span>
                  {idx === 0 && (
                    <span className="text-xs bg-green-100 text-green-700 font-medium px-2 py-0.5 rounded-full">
                      Latest
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
