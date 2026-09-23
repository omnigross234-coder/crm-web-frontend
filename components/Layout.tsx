"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, ReactNode } from "react";
import {
  FaBuilding,
  FaChartLine,
  FaChartPie,
  FaHistory,
  FaListAlt,
  FaShieldAlt,
  FaUsers,
  FaUserShield,
  FaCloudDownloadAlt,
  FaSun,
  FaMoon,
  FaSignOutAlt
} from "react-icons/fa";
import type { IconType } from "react-icons";
import BrandLogo from "@/components/BrandLogo";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/components/ThemeProvider";
import AppFooter from "@/components/AppFooter";

const navItems: { href: string; label: string; icon: IconType }[] = [
  { href: "/dashboard", label: "Dashboard", icon: FaChartPie },
  { href: "/leads", label: "Leads", icon: FaUsers },
  { href: "/performance", label: "Performance", icon: FaChartLine },
];

const clientAdminItems: { href: string; label: string; icon: IconType }[] = [
  { href: "/admin/users",       label: "Users",       icon: FaShieldAlt },
  { href: "/admin/lead-fields",  label: "Lead Fields", icon: FaListAlt },
];

const platformItems: { href: string; label: string; icon: IconType }[] = [
  { href: "/admin/clients", label: "Clients", icon: FaBuilding },
  { href: "/admin/backups", label: "Backups", icon: FaCloudDownloadAlt },
];

// Super-admin-only — NOT part of platformItems, because platformItems.slice(1)
// is also used below to show client_admins just the Backups link via
// canViewBackups. Appending here instead of to platformItems keeps that
// slice(1) usage (Backups only) from also picking up Audit Log.
const superAdminOnlyItems: { href: string; label: string; icon: IconType }[] = [
  // Phase 6: distinct from the client-admin-only "/admin/users" (tenant-
  // scoped, in clientAdminItems above) — this is the cross-tenant Super
  // Admin console, deliberately a different route so the existing
  // client-admin page/behavior is never touched.
  { href: "/admin/platform/users", label: "Users", icon: FaUsers },
  { href: "/admin/audit-logs", label: "Audit Log", icon: FaHistory },
  // Security Center, Phase 2: backed entirely by the Super-Admin-only
  // /admin/security-center/* backend routes (Phase 1) — never exposed to
  // client_admin/admin/sales/etc., same as every other item in this array.
  { href: "/admin/security", label: "Security", icon: FaUserShield },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { user, loading, logout, isClientAdmin, isSuperAdmin, canViewBackups, canImportLeads } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" role="status" aria-live="polite">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin shadow-md" />
        <span className="sr-only">Loading…</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground transition-colors duration-250">

      {/* Main Body Section: Sidebar + Main Content */}
      <div className="flex flex-col md:flex-row flex-1 min-h-0">

        {/* Left Sidebar */}
        <aside className="w-full md:w-64 bg-card border-b md:border-b-0 md:border-r border-border flex flex-col flex-shrink-0 transition-colors duration-250">
          
          {/* Header with Brand Logo */}
          <div className="h-16 flex items-center justify-between px-4 sm:px-5 border-b border-border">
            <BrandLogo compact />
            
            {/* Quick Actions Header */}
            <div className="flex items-center gap-2">
              <button
                onClick={toggleTheme}
                className="p-2 rounded-xl bg-input text-primary border border-border cursor-pointer hover:bg-border/60 transition-all hover:scale-105"
                aria-label="Toggle Theme"
                title="Toggle Theme"
              >
                {theme === "dark" ? <FaSun className="w-3.5 h-3.5 text-yellow-400" /> : <FaMoon className="w-3.5 h-3.5 text-[#206B6E]" />}
              </button>
              <button
                onClick={logout}
                className="p-2 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white border border-red-500/20 transition-all cursor-pointer hover:scale-105"
                title="Sign out"
                aria-label="Sign out"
              >
                <FaSignOutAlt className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* User Profile Card - shifted to top */}
          <div className="p-3 mx-3 my-3 rounded-xl bg-input/70 border border-border/80 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#206B6E] to-[#4BC3C4] flex items-center justify-center text-[#091718] text-xs font-black shadow-sm shrink-0">
                {(user?.name?.[0] || "U").toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-foreground truncate">{user.name}</p>
                <span className="inline-block text-[10px] px-1.5 py-0.2 rounded bg-primary/10 text-primary font-medium capitalize">
                  {user.role}
                </span>
              </div>
            </div>
            <button
              onClick={logout}
              className="text-[11px] font-semibold text-red-400 hover:text-red-300 hover:underline transition-colors px-1"
            >
              Exit
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="flex md:flex-col gap-1.5 overflow-x-auto md:overflow-visible px-3 pb-6 md:space-y-1">
            {(isSuperAdmin ? navItems.slice(0, 1) : navItems).map((item) => {
              const Icon = item.icon;
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex flex-shrink-0 md:flex-shrink items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? "bg-primary/15 text-primary shadow-xs font-semibold border border-primary/30"
                      : "text-muted-text hover:bg-input/60 hover:text-foreground"
                  }`}
                >
                  <Icon className={`w-4 h-4 flex-shrink-0 transition-colors ${isActive ? "text-primary" : "text-muted-text"}`} />
                  {item.label}
                </Link>
              );
            })}

            {isClientAdmin && (
              <>
                <div className="pt-4 pb-1 px-3 text-[11px] font-bold text-muted-text/70 uppercase tracking-wider">
                  Admin
                </div>
                {[...clientAdminItems, ...(canViewBackups ? platformItems.slice(1) : [])].map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex flex-shrink-0 md:flex-shrink items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                        isActive
                          ? "bg-primary/15 text-primary shadow-xs font-semibold border border-primary/30"
                          : "text-muted-text hover:bg-input/60 hover:text-foreground"
                      }`}
                    >
                      <Icon className={`w-4 h-4 flex-shrink-0 transition-colors ${isActive ? "text-primary" : "text-muted-text"}`} />
                      {item.label}
                    </Link>
                  );
                })}
              </>
            )}

            {isSuperAdmin && (
              <>
                <div className="pt-4 pb-1 px-3 text-[11px] font-bold text-muted-text/70 uppercase tracking-wider">
                  Platform
                </div>
                {[...platformItems, ...superAdminOnlyItems].map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex flex-shrink-0 md:flex-shrink items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                        isActive
                          ? "bg-primary/15 text-primary shadow-xs font-semibold border border-primary/30"
                          : "text-muted-text hover:bg-input/60 hover:text-foreground"
                      }`}
                    >
                      <Icon className={`w-4 h-4 flex-shrink-0 transition-colors ${isActive ? "text-primary" : "text-muted-text"}`} />
                      {item.label}
                    </Link>
                  );
                })}
              </>
            )}
          </nav>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 min-w-0 bg-background transition-colors duration-250 pb-8">
          {children}
        </main>

      </div>

      {/* Full-width Footer spanning entire screen below whole body section */}
      <AppFooter />

    </div>
  );
}
