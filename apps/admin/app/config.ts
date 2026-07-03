/**
 * Central application configuration for the admin dashboard.
 *
 * Consolidates previously-hardcoded values (API base, widget URL, brand name,
 * default language, default site URL, sample questions, etc.) into a single
 * clearly-commented block. Public, build-time values prefer
 * `process.env.NEXT_PUBLIC_*` so deployments can override them without code
 * changes; the fallbacks below keep the current production defaults identical
 * so behaviour does not change when no env var is set.
 *
 * NOTE: keep defaults in sync with the values they replaced in page.tsx.
 */

// Production fallbacks (used only when the matching NEXT_PUBLIC_* var is unset).
const PRODUCTION_API_BASE = "https://assaddar-api-production.up.railway.app";
const PRODUCTION_WIDGET_URL =
  "https://assaddar-widget-production.up.railway.app/widget.js";
const DEFAULT_SITE_URL = "https://www.assad-dar.de/de";
const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const APP_CONFIG = {
  /** Brand / product naming used across the shell and auth screens. */
  brand: {
    name: "Assaddar AI",
    company: "Assaddar AI Consultancy",
    consultantName: "Assaddar AI Consultant",
  },

  /** Default locale used for the tenant, widget, and templates. */
  defaultLanguage: "de",

  /** Backend + widget endpoints. Prefer public env vars where provided. */
  api: {
    /** REST API base (already supported via NEXT_PUBLIC_API_BASE_URL). */
    base: process.env.NEXT_PUBLIC_API_BASE_URL ?? PRODUCTION_API_BASE,
    /** Embeddable widget script URL. */
    widgetUrl: process.env.NEXT_PUBLIC_WIDGET_URL ?? PRODUCTION_WIDGET_URL,
  },

  supabase: {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: SUPABASE_PUBLISHABLE_KEY,
  },

  /** Default public site used for CTA / booking links and install checks. */
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? DEFAULT_SITE_URL,

  /** Sample questions surfaced in the assistant test studio. */
  sampleQuestions: [
    "Can you help us automate customer support?",
    "What kind of AI projects do you implement?",
    "Can we book a consultation?",
    "How do you handle data privacy?",
  ],
} as const;
