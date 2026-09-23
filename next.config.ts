// import type { NextConfig } from "next";

// const nextConfig = {
//   output: 'export',
//   trailingSlash: true,
//   basePath: '/crm_web',
//   images: { unoptimized: true },
// };
// export default nextConfig;
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: process.env.NODE_ENV === 'production' ? 'export' : undefined,
  trailingSlash: true,
  // Local dev serves from the domain root; only the production static
  // export (deployed under Apache) needs the /ogclient/ogc prefix. Keep
  // this in sync with BASE_PATH in lib/constants.ts, which every hardcoded
  // absolute asset/redirect path in the app uses for the same reason.
  basePath: process.env.NODE_ENV === 'production' ? '/ogclient/ogc' : undefined,
  assetPrefix: process.env.NODE_ENV === 'production' ? '/ogclient/ogc/' : undefined,
  images: { unoptimized: true },
};

export default nextConfig;
