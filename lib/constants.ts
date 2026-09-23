// Phase 3 certification, W10-F03 closure: this used to fall back to the
// real production backend, so a build that forgot to set
// NEXT_PUBLIC_API_BASE_URL would silently talk to production instead of
// failing to build a working app. ".invalid" is the RFC 2606 reserved TLD
// that is guaranteed to never resolve, so an unconfigured build now fails
// every API call immediately and obviously (a DNS/network error in the
// console) instead of quietly reaching real production data. Every real
// deployment (local, staging, production) must set
// NEXT_PUBLIC_API_BASE_URL explicitly at build time.
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "https://REPLACE_WITH_YOUR_API_BASE_URL.invalid/api";

// The production deployment is a static export served by Apache under
// /ogclient/ogc (see next.config.ts's basePath, public/.htaccess). Local
// dev serves from the domain root instead, so every hardcoded absolute
// asset/redirect path in the app (logo images, the metadata icons, the
// logout redirect, the 401 session-expiry redirect) needs this same prefix
// — Next does NOT automatically rewrite a manually-hardcoded string path
// to match a configured basePath, only next/link and next/image's own
// internal handling of it. process.env.NODE_ENV is a special case Next
// always inlines at build time (dev vs production build), so this needs
// no NEXT_PUBLIC_ prefix or extra env file entry.
export const BASE_PATH = process.env.NODE_ENV === "production" ? "/ogclient/ogc" : "";
