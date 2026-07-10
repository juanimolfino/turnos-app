import type { NextConfig } from "next";

// Headers de seguridad aplicados a toda respuesta. Se evita una CSP completa de
// script-src/style-src porque la app usa estilos inline y el bootstrap inline de
// Next (App Router) — una CSP estricta requeriría nonces vía middleware. Se aplica
// lo de alto valor y bajo riesgo: anti-clickjacking (frame-ancestors + X-Frame-
// Options), nosniff, HSTS, Referrer-Policy y Permissions-Policy.
const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "**.fal.media" }
    ]
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
