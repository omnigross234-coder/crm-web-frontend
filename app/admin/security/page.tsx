"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Layout from "@/components/Layout";
import SecurityCenter from "@/components/SecurityCenter";
import { useAuth } from "@/lib/auth";

/**
 * Super Admin Security Center, Phase 2 (frontend). Backed entirely by the
 * Phase 1 backend (GET /admin/security-center/overview and .../auth-events,
 * both already Super-Admin-only, tested, and live-verified — see
 * OGCLIENT-SUPERADMIN-SECURITY-CENTER-PHASE1-REPORT.md).
 *
 * The guard below is a UX convenience only (redirect before an unauthorized
 * user sees anything) — it is never the actual security boundary. Every
 * request this page makes still goes through the real, unchanged backend
 * super_admin middleware, which returns 403 regardless of what this guard
 * does or doesn't do.
 */
export default function SecurityCenterPage() {
  const { isSuperAdmin, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !isSuperAdmin) router.replace("/dashboard");
  }, [authLoading, isSuperAdmin, router]);

  if (authLoading || !isSuperAdmin) return null;

  return (
    <Layout>
      <SecurityCenter />
    </Layout>
  );
}
