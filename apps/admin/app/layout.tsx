import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Assaddar AI Communication",
  description: "Tenant operations dashboard",
};

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
