/**
 * Pure helper functions used by TenantRepository: role/role-text normalisation,
 * contact-identifier merging, template parsing, public-id generation, and the
 * per-transaction tenant-scope setter. Kept separate from the data-access class
 * so the repository file holds query logic only.
 */
import { sql } from "drizzle-orm";
import type { Channel } from "@assaddar/core";
import type { DbExecutor } from "./client";
import type { ContactProfileInput, RoleName } from "./repository";
import { assertTenantId } from "./tenant-scope";

export function normalizeRoleName(value: string): RoleName {
  if (
    value === "platform_owner" ||
    value === "tenant_owner" ||
    value === "tenant_admin" ||
    value === "operator" ||
    value === "viewer"
  ) {
    return value;
  }
  return "viewer";
}

export function roleDescription(name: RoleName) {
  const descriptions: Record<RoleName, string> = {
    platform_owner: "Can manage all tenants and platform settings.",
    tenant_owner:
      "Can manage the tenant, users, channels, knowledge, and leads.",
    tenant_admin:
      "Can configure tenant settings, channels, knowledge, and leads.",
    operator: "Can manage leads, conversations, and handoffs.",
    viewer: "Can view tenant data without changing settings.",
  };
  return descriptions[name];
}

export function normalizeContactInput(input?: ContactProfileInput) {
  const email = normalizeEmail(input?.email);
  const phone = normalizePhone(input?.phone);
  const displayName = normalizeOptionalText(input?.displayName);
  const company = normalizeOptionalText(input?.company);
  const metadata = input?.metadata ?? {};
  const identifiers = normalizeIdentifierInput(input?.identifiers);
  const confidence =
    (email ? 20 : 0) +
    (phone ? 20 : 0) +
    (displayName ? 10 : 0) +
    (company ? 10 : 0) +
    (Object.keys(identifiers).length ? 20 : 0) +
    40;

  return {
    displayName,
    email,
    phone,
    company,
    identifiers,
    metadata,
    confidence: Math.min(100, confidence),
  };
}

export function normalizeOptionalText(value?: string | null) {
  const normalized = value?.trim();
  return normalized || undefined;
}

export function normalizeEmail(value?: string | null) {
  const normalized = value?.trim().toLowerCase();
  return normalized && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
    ? normalized
    : undefined;
}

export function normalizePhone(value?: string | null) {
  const normalized = value?.replace(/[^\d+]/g, "").trim();
  return normalized && normalized.length >= 6 ? normalized : undefined;
}

export function normalizeIdentifierInput(
  value?: Record<string, string[] | string | null | undefined>,
) {
  const identifiers: Record<string, string[]> = {};
  for (const [key, raw] of Object.entries(value ?? {})) {
    const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const normalizedValues = values.map((item) => item.trim()).filter(Boolean);
    if (normalizedValues.length) {
      identifiers[key] = Array.from(new Set(normalizedValues));
    }
  }
  return identifiers;
}

export function mergeIdentifierValues(
  identifiers: Record<string, string[]>,
  key: string,
  value?: string,
) {
  if (!value?.trim()) {
    return identifiers;
  }
  return mergeIdentifierMaps(identifiers, { [key]: [value.trim()] });
}

export function mergeIdentifierMaps(
  left: Record<string, string[]> | null | undefined,
  right: Record<string, string[]> | null | undefined,
) {
  const merged: Record<string, string[]> = {};
  for (const source of [left ?? {}, right ?? {}]) {
    for (const [key, values] of Object.entries(source)) {
      merged[key] = Array.from(
        new Set([...(merged[key] ?? []), ...values.filter(Boolean)]),
      );
    }
  }
  return merged;
}

export function hasSharedIdentifier(
  left: Record<string, string[]> | null | undefined,
  right: Record<string, string[]>,
) {
  for (const [key, values] of Object.entries(right)) {
    const candidateValues = new Set(left?.[key] ?? []);
    if (values.some((value) => candidateValues.has(value))) {
      return true;
    }
  }
  return false;
}

export function contactIdentifierContainmentValues(
  identifiers: Record<string, string[]>,
) {
  return Object.entries(identifiers).flatMap(([key, values]) =>
    values.filter(Boolean).map((value) => JSON.stringify({ [key]: [value] })),
  );
}

export function channelIdentifierKey(channel: Channel) {
  const keys: Record<string, string> = {
    website: "websiteVisitorIds",
    whatsapp: "whatsappUserIds",
    messenger: "messengerUserIds",
    instagram: "instagramUserIds",
    telephone: "telephoneNumbers",
    tiktok: "tiktokUserIds",
    admin_test: "adminTestIds",
  };
  return keys[channel] ?? `${channel}Ids`;
}

export function isPhoneIdentityChannel(channel: Channel) {
  return channel === "whatsapp" || channel === "telephone";
}

export function deriveConversationNextAction(
  channel: string,
  handoffs: unknown[],
) {
  if (handoffs.length) {
    return "Human follow-up";
  }
  if (["whatsapp", "messenger", "instagram"].includes(channel)) {
    return "Check response window";
  }
  if (channel === "telephone") {
    return "Review call transcript";
  }
  return "Monitor";
}

export function normalizeTemplateName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

export function extractTemplateVariables(body: string) {
  return Array.from(body.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g))
    .map((match) => match[1] ?? "")
    .filter(Boolean);
}

export function titleCase(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function createPublicAssistantId() {
  return `asst_${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`;
}

export function createPublicConversationId() {
  return `conv_${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`;
}

/**
 * Compute the retention cutoff: tenant-owned data created strictly before this
 * instant is eligible for deletion. Pure and side-effect free so the eligibility
 * arithmetic can be unit-tested without a live database.
 *
 * Conservative by design:
 *  - `retentionDays` must be a finite integer >= 1; anything else (0, negative,
 *    NaN, undefined) returns `null`, meaning "retention disabled — delete
 *    nothing". This prevents a misconfigured `retention_days` from wiping data.
 */
export function retentionCutoff(
  retentionDays: number | null | undefined,
  now: Date = new Date(),
): Date | null {
  if (
    typeof retentionDays !== "number" ||
    !Number.isFinite(retentionDays) ||
    !Number.isInteger(retentionDays) ||
    retentionDays < 1
  ) {
    return null;
  }
  const millisPerDay = 24 * 60 * 60 * 1000;
  return new Date(now.getTime() - retentionDays * millisPerDay);
}

export type QualityMetrics = {
  answered: number;
  refused: number;
  handoff: number;
  total: number;
  /** Share of answer attempts the assistant resolved itself (answered / total). */
  containmentRate: number;
  refusalRate: number;
  handoffRate: number;
};

/**
 * Derive answer-quality rates from usage events grouped by answer status.
 * The answer engine emits one usage event per reply with eventType set to the
 * AnswerStatus ("answered" | "refused" | "handoff"); other event types are
 * ignored here. Pure so the rate arithmetic is unit-tested without a database.
 * Rates are rounded to 3 decimals and are 0 when there were no answer events.
 */
export function deriveQualityMetrics(
  usageByStatus: Array<{ eventType: string; total: number }>,
): QualityMetrics {
  let answered = 0;
  let refused = 0;
  let handoff = 0;
  for (const row of usageByStatus) {
    if (row.eventType === "answered") {
      answered += row.total;
    } else if (row.eventType === "refused") {
      refused += row.total;
    } else if (row.eventType === "handoff") {
      handoff += row.total;
    }
  }
  const total = answered + refused + handoff;
  const rate = (value: number) =>
    total === 0 ? 0 : Math.round((value / total) * 1000) / 1000;
  return {
    answered,
    refused,
    handoff,
    total,
    containmentRate: rate(answered),
    refusalRate: rate(refused),
    handoffRate: rate(handoff),
  };
}

export async function setTenantSession(db: DbExecutor, tenantId: string) {
  assertTenantId(tenantId);
  await db.execute(
    sql`select set_config('app.current_tenant_id', ${tenantId}, true)`,
  );
}
