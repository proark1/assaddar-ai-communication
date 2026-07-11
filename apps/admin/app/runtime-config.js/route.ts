/**
 * Serves `/runtime-config.js`, a tiny classic script that injects
 * `window.__ASSADDAR_RUNTIME_CONFIG__` with the deployment's public URLs.
 *
 * The values are read from the container's environment AT REQUEST TIME (not
 * baked into the bundle at `next build`), so one published image can serve
 * any host. The env var names are intentionally the same `NEXT_PUBLIC_*`
 * names existing deployments already set — Railway keeps working with zero
 * env changes — but they are read via bracket access, which the Next.js
 * compiler does not inline at build time.
 *
 * Missing vars are omitted; app/config.ts then falls back to the build-time
 * baked `NEXT_PUBLIC_*` value (if any) and finally the production defaults.
 */
import type { RuntimeAppConfig } from "../config";

// Never prerender: the whole point is reading env at request time.
export const dynamic = "force-dynamic";

export function GET() {
  const env = process.env;
  const config: RuntimeAppConfig = {
    apiBaseUrl: env["NEXT_PUBLIC_API_BASE_URL"],
    widgetUrl: env["NEXT_PUBLIC_WIDGET_URL"],
    siteUrl: env["NEXT_PUBLIC_SITE_URL"],
  };

  // JSON.stringify drops undefined-valued keys, so unset vars simply fall
  // through to the client-side fallbacks.
  const body = `window.__ASSADDAR_RUNTIME_CONFIG__ = ${JSON.stringify(config)};`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
