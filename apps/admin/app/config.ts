/**
 * Central application configuration for the admin dashboard.
 *
 * Consolidates previously-hardcoded values (API base, widget URL, brand name,
 * default language, default site URL, sample questions, etc.) into a single
 * clearly-commented block.
 *
 * Deployment URLs resolve in three steps so one published image can serve any
 * host without a rebuild:
 *   1. RUNTIME-injected config — in the browser via
 *      `window.__ASSADDAR_RUNTIME_CONFIG__` (set by `/runtime-config.js`,
 *      served from the container env at request time); on the server by
 *      reading the same env vars at render time (bracket access, so the
 *      compiler cannot inline them at build time).
 *   2. The build-time baked `NEXT_PUBLIC_*` value (previous behaviour), so
 *      existing deployments keep working with zero env changes.
 *   3. The hardcoded production defaults.
 *
 * NOTE: keep defaults in sync with the values they replaced in page.tsx.
 */

// Production fallbacks (used only when the matching NEXT_PUBLIC_* var is unset).
const PRODUCTION_API_BASE = "https://assaddar-api-production.up.railway.app";
const PRODUCTION_WIDGET_URL =
  "https://assaddar-widget-production.up.railway.app/widget.js";
const DEFAULT_SITE_URL = "https://www.assad-dar.de/de";

/** Shape of the runtime-injected deployment config (all keys optional). */
export type RuntimeAppConfig = {
  apiBaseUrl?: string | undefined;
  widgetUrl?: string | undefined;
  siteUrl?: string | undefined;
};

declare global {
  interface Window {
    __ASSADDAR_RUNTIME_CONFIG__?: RuntimeAppConfig;
  }
}

function runtimeConfig(): RuntimeAppConfig {
  if (typeof window !== "undefined") {
    // Injected by /runtime-config.js, which loads (synchronously) before any
    // client bundle executes; missing keys fall through to the baked values.
    return window.__ASSADDAR_RUNTIME_CONFIG__ ?? {};
  }
  // Server render: read the env at request time. Bracket access keeps the
  // Next.js compiler from replacing these with build-time values.
  const env = process.env;
  return {
    apiBaseUrl: env["NEXT_PUBLIC_API_BASE_URL"],
    widgetUrl: env["NEXT_PUBLIC_WIDGET_URL"],
    siteUrl: env["NEXT_PUBLIC_SITE_URL"],
  };
}

export const APP_CONFIG = {
  /** Brand / product naming used across the shell and auth screens. */
  brand: {
    name: "Assaddar AI",
    company: "Assaddar AI Consultancy",
    consultantName: "Assaddar AI Consultant",
  },

  /** Default locale used for the tenant, widget, and templates. */
  defaultLanguage: "de",

  /** Backend + widget endpoints. Runtime config > baked env > default. */
  api: {
    /** REST API base (runtime-injected, NEXT_PUBLIC_API_BASE_URL fallback). */
    get base(): string {
      return (
        runtimeConfig().apiBaseUrl ??
        process.env.NEXT_PUBLIC_API_BASE_URL ??
        PRODUCTION_API_BASE
      );
    },
    /** Embeddable widget script URL. */
    get widgetUrl(): string {
      return (
        runtimeConfig().widgetUrl ??
        process.env.NEXT_PUBLIC_WIDGET_URL ??
        PRODUCTION_WIDGET_URL
      );
    },
  },

  /** Default public site used for CTA / booking links and install checks. */
  get siteUrl(): string {
    return (
      runtimeConfig().siteUrl ??
      process.env.NEXT_PUBLIC_SITE_URL ??
      DEFAULT_SITE_URL
    );
  },

  /** Sample questions surfaced in the assistant test studio. */
  sampleQuestions: [
    "Can you help us automate customer support?",
    "What kind of AI projects do you implement?",
    "Can we book a consultation?",
    "How do you handle data privacy?",
  ],
} as const;
