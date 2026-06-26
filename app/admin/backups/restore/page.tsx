"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FaArrowLeft, FaUndo } from "react-icons/fa";
import Layout from "@/components/Layout";
import { useAuth } from "@/lib/auth";

export default function RestoreBackupPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.replace("/dashboard");
    }
  }, [authLoading, isAdmin, router]);

  if (authLoading || !isAdmin) {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto px-4 py-12">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 py-12">
        <Link
          href="/admin/backups"
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-blue-600 mb-6"
        >
          <FaArrowLeft className="w-3.5 h-3.5" />
          Back to backups
        </Link>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-5">
            <FaUndo className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Restore Data</h1>
          <p className="text-gray-600 mt-3">
            To restore data, please contact the admin.
          </p>
        </div>
      </div>
    </Layout>
  );
}
