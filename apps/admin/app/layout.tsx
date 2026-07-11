import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Assaddar AI Communication",
  description: "Tenant operations dashboard",
};

// One published image must serve any host, so pages that consume APP_CONFIG
// URLs must render at REQUEST time. Without this, `next build` statically
// prerenders them with the build environment's config (in the GHCR image:
// the hardcoded production defaults), and on a host whose runtime env differs
// the server HTML disagrees with the runtime-injected client values —
// a React hydration mismatch plus a visible flash of the wrong URLs.
export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {/* Runtime deployment config (API/widget/site URLs) injected from the
            container env at request time so one image can serve any host.
            Deliberately synchronous: Next.js client bundles are deferred, so
            this classic script is guaranteed to run first, before any module
            reads window.__ASSADDAR_RUNTIME_CONFIG__. It is a tiny same-origin
            one-liner, so the parse stall is negligible. */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="/runtime-config.js" />
        {children}
      </body>
    </html>
  );
}
