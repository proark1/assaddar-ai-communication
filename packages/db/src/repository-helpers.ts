/**
 * Pure helper functions used by TenantRepository: role/role-text normalisation,
 * contact-identifier merging, template parsing, public-id generation, and the
 * per-transaction tenant-scope setter. Kept separate from the data-access class
 * so the repository file holds query logic only.
 */
import { sql } from "drizzle-orm";
import type { Channel } from "@assaddar/core";
import type { DbExecutor } from "./client";
import type {
  ContactProfileInput,
  PaginationOptions,
  RoleName,
  TelephoneNumberInventoryInput,
} from "./repository";
import type { telephoneNumberInventory } from "./schema";
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

// --- Moved from repository.ts to keep the data-access class within its size
// budget: pagination clamps, knowledge-text normalisation, document-suggestion
// sectioning, secret-settings guards, telephone value mapping, and Stripe
// status mapping. Behaviour unchanged. ---

const DEFAULT_LIST_LIMIT = 100;
const MAX_LIST_LIMIT = 100;

/**
 * Clamp pagination options to safe bounds. `limit` is clamped to
 * [1, MAX_LIST_LIMIT] and defaults to DEFAULT_LIST_LIMIT; `offset` is clamped
 * to >= 0 and defaults to 0. This guards against negative/huge values from
 * untrusted query params while keeping the default page identical to before.
 */
export function resolvePagination(options?: PaginationOptions): {
  limit: number;
  offset: number;
} {
  const rawLimit = options?.limit;
  const limit =
    typeof rawLimit === "number" && Number.isFinite(rawLimit)
      ? Math.min(Math.max(Math.trunc(rawLimit), 1), MAX_LIST_LIMIT)
      : DEFAULT_LIST_LIMIT;
  const rawOffset = options?.offset;
  const offset =
    typeof rawOffset === "number" && Number.isFinite(rawOffset)
      ? Math.max(Math.trunc(rawOffset), 0)
      : 0;
  return { limit, offset };
}

export function readStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function readAttempts(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }
  return 0;
}

/**
 * Order the outbound delivery lifecycle so a provider status callback only ever
 * advances a delivery forwards. Pre-send states rank 0, then sent < delivered <
 * read. Terminal/other states (failed, skipped) rank -1 and are handled
 * explicitly by the caller.
 */
export function deliveryStatusRank(status: string): number {
  switch (status) {
    case "queued":
    case "pending":
      return 0;
    case "sent":
      return 1;
    case "delivered":
      return 2;
    case "read":
      return 3;
    default:
      return -1;
  }
}

/**
 * Coerce a timestamp returned by a raw `sql<...>` aggregate to a `Date`.
 *
 * Drizzle's postgres-js driver replaces postgres.js's timestamp parsers with
 * pass-through ones (OIDs 1114/1184/1082/1083 → return the raw text) and instead
 * converts each SELECTED COLUMN to a Date itself via that column's
 * `mapFromDriverValue`. A raw `sql`max(...)`` expression has no column to map,
 * so against real Postgres the driver hands back the timestamp text form
 * ("2026-07-10 16:27:40.767+00"), NOT a Date — even though the `sql<Date>`
 * annotation claims otherwise. Aggregates feeding a `Date | null` field must be
 * coerced here or the declared type lies and callers doing date math
 * (`.getTime()`, `.toISOString()`) throw or misbehave. Accepts a `Date` too, so
 * it stays correct under drivers/mocks that already return one.
 */
export function toAggregateDate(
  value: Date | string | null | undefined,
): Date | null {
  if (value == null) {
    return null;
  }
  return value instanceof Date ? value : new Date(value);
}

export function normalizeFullTextQuery(
  options?: PaginationOptions,
): string | undefined {
  const value = options?.q?.trim();
  return value ? value : undefined;
}

export function normalizeListStatus(
  options?: PaginationOptions,
): string | undefined {
  const value = options?.status?.trim();
  return value && value !== "all" ? value : undefined;
}

export function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

export function normalizeKnowledgeText(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function isMeaningfulQuestion(value: string): boolean {
  const normalized = normalizeKnowledgeText(value);
  if (normalized.length < 12 || normalized.length > 500) {
    return false;
  }
  const words = normalized.split(/\s+/).filter(Boolean);
  return words.length >= 3;
}

export function buildDocumentSuggestionSections(
  text: string,
  fileName: string,
  maxSuggestions = 8,
): Array<{ title: string; content: string; sectionIndex: number }> {
  const normalized = normalizeKnowledgeText(text);
  if (!normalized) {
    return [];
  }
  const requested = Math.min(Math.max(Math.trunc(maxSuggestions), 1), 20);
  const paragraphs = normalized
    .split(/\n\s*\n/g)
    .map((paragraph) => normalizeKnowledgeText(paragraph))
    .filter((paragraph) => paragraph.length >= 60);

  const sections: Array<{
    title: string;
    content: string;
    sectionIndex: number;
  }> = [];
  let buffer: string[] = [];
  let sectionIndex = 1;
  const flush = () => {
    const content = normalizeKnowledgeText(buffer.join("\n\n"));
    buffer = [];
    if (!content || content.length < 80) {
      return;
    }
    sections.push({
      title: buildDocumentSectionTitle(content, fileName, sectionIndex),
      content: content.slice(0, 4000),
      sectionIndex,
    });
    sectionIndex += 1;
  };

  for (const paragraph of paragraphs.length ? paragraphs : [normalized]) {
    const currentLength = buffer.join("\n\n").length;
    if (currentLength > 0 && currentLength + paragraph.length > 1800) {
      flush();
    }
    buffer.push(paragraph);
    if (sections.length >= requested) {
      break;
    }
  }
  if (sections.length < requested) {
    flush();
  }
  return sections.slice(0, requested);
}

function buildDocumentSectionTitle(
  content: string,
  fileName: string,
  sectionIndex: number,
): string {
  const firstLine =
    content
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length >= 8 && line.length <= 120) ??
    `${fileName} section ${sectionIndex}`;
  return firstLine.replace(/[:.;,\s]+$/g, "").slice(0, 160);
}

export function isLearningHandoffReason(reason: string): boolean {
  return !new Set([
    "lead_capture",
    "readiness_assessment",
    "contact_request",
  ]).has(reason);
}

const secretLikeSettingsKeyPattern =
  /token|secret|password|api[_-]?key|apikey|authorization|credential|private[_-]?key/i;

export function rejectSecretSettings<T extends Record<string, unknown>>(
  settings: T,
): T {
  assertNoSecretSettings(settings);
  return settings;
}

function assertNoSecretSettings(value: unknown, path: string[] = []) {
  if (!value || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertNoSecretSettings(item, [...path, String(index)]),
    );
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (secretLikeSettingsKeyPattern.test(key)) {
      throw new Error(
        `Channel connection settings must not contain secret-like key "${[
          ...path,
          key,
        ].join(".")}". Store provider credentials in a secret manager.`,
      );
    }
    assertNoSecretSettings(entry, [...path, key]);
  }
}

export function telephoneNumberValues(
  input: Partial<TelephoneNumberInventoryInput>,
) {
  return {
    ...(input.provider ? { provider: input.provider } : {}),
    ...(input.phoneNumber ? { phoneNumber: input.phoneNumber.trim() } : {}),
    ...(input.country ? { country: input.country.trim().toUpperCase() } : {}),
    ...(input.locality !== undefined
      ? { locality: input.locality?.trim() || null }
      : {}),
    ...(input.numberType ? { numberType: input.numberType } : {}),
    ...(input.sipTarget !== undefined
      ? { sipTarget: input.sipTarget?.trim() || null }
      : {}),
    ...(input.assistantId !== undefined
      ? { assistantId: input.assistantId?.trim() || null }
      : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.assignedTenantId !== undefined
      ? { assignedTenantId: input.assignedTenantId ?? null }
      : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  } satisfies Partial<typeof telephoneNumberInventory.$inferInsert>;
}

export function billingStatusFromStripe(status: string) {
  if (status === "active" || status === "trialing") {
    return "active";
  }
  if (status === "past_due" || status === "unpaid" || status === "incomplete") {
    return "past_due";
  }
  if (status === "canceled" || status === "incomplete_expired") {
    return "canceled";
  }
  return "incomplete";
}
