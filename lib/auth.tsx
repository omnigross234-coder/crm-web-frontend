"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { api, User, ApiResponse } from "./api";
import { BASE_PATH } from "./constants";
import { clearLeadFieldSettings } from "./leadFieldConfig";

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isAdmin: boolean;
  isClientAdmin: boolean;
  isSuperAdmin: boolean;
  canViewBackups: boolean;
  /**
   * Lead Import is client_admin/super_admin only — unlike most other
   * admin-level features in this app, 'admin' does NOT have access (backend
   * enforces this; this flag only controls what's shown, never security).
   */
  canImportLeads: boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const isSuperAdmin = (user?.role as string | undefined) === "super_admin";
  const isClientAdmin = (user?.role as string | undefined) === "client_admin" || user?.role === "admin";
  const canImportLeads = (user?.role as string | undefined) === "client_admin" || isSuperAdmin;

  useEffect(() => {
    const saved = localStorage.getItem("crm_token");
    if (saved) {
      setToken(saved);
      api
        .get<ApiResponse<User>>("/auth/me")
        .then((r) => setUser(r.data))
        .catch(() => {
          localStorage.removeItem("crm_token");
          setToken(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.post<ApiResponse<{ user: User; token: string; role: string }>>(
      "/auth/login",
      { email, password }
    );
    const { user: u, token: t } = res.data;
    clearLeadFieldSettings();
    localStorage.setItem("crm_token", t);
    setToken(t);
    setUser(u);
    router.push("/dashboard");
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout", {});
    } catch {
      // Ignore network errors on logout
    } finally {
      localStorage.removeItem("crm_token");
      clearLeadFieldSettings();
      setToken(null);
      setUser(null);
      if (typeof window !== "undefined") {
        window.location.href = `${BASE_PATH}/`;
      } else {
        router.push("/");
      }
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        logout,
        isAdmin: isClientAdmin,
        isClientAdmin,
        isSuperAdmin,
        canViewBackups: isClientAdmin || isSuperAdmin,
        canImportLeads,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
