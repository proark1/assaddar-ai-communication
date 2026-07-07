import { Buffer } from "node:buffer";
import net from "node:net";
import tls from "node:tls";
import type { FastifyRequest } from "fastify";
import { MetricsRegistry } from "./metrics";
import { captureException } from "./observability";
import type {
  BuildServerOptions,
  LeadNotificationEmail,
  LeadNotificationPayload,
} from "./server";
import { defaultAdminPublicUrl, findEmail, titleCase } from "./server";

// Lead / visitor notification + SMTP transport, extracted from server.ts to keep
// the route module focused. Only the four functions the routes call are exported;
// the email builders and SMTP client are internal to this module.

const BENIGN_NOTIFICATION_REASONS = new Set([
  "not_configured",
  "smtp_not_configured",
  "visitor_email_missing",
]);

/**
 * Surface the outcome of a best-effort lead/visitor notification. These sends
 * previously had their result discarded, so a downed webhook/SMTP silently
 * stopped owner lead alerts while the widget still returned success on the
 * revenue-critical capture path. A "not configured" outcome is expected and only
 * logged at debug; a genuine send failure is logged at error and funnelled
 * through captureException so operators get a signal (and a Sentry event).
 */
export function reportNotificationOutcome(
  log: FastifyRequest["log"],
  metrics: MetricsRegistry,
  kind: string,
  outcome: { sent: boolean; reason?: string; results?: unknown },
): void {
  if (outcome.sent) {
    return;
  }
  if (outcome.reason && BENIGN_NOTIFICATION_REASONS.has(outcome.reason)) {
    log.debug(
      { kind, reason: outcome.reason },
      "Lead notification skipped (channel not configured)",
    );
    return;
  }
  log.error(
    { kind, reason: outcome.reason, results: outcome.results },
    "Lead notification failed to send",
  );
  captureException(log, metrics, new Error(`${kind} notification failed`), {
    kind,
    reason: outcome.reason,
  });
}

export async function notifyLead(
  options: BuildServerOptions,
  payload: LeadNotificationPayload,
) {
  const results: Array<Record<string, unknown>> = [];
  const notificationPayload: LeadNotificationPayload = {
    ...payload,
    adminUrl: buildLeadAdminUrl(payload, options.adminPublicUrl),
  };

  if (!options.leadNotificationWebhookUrl && !options.leadNotificationEmailTo) {
    return { sent: false, reason: "not_configured" };
  }

  if (options.leadNotificationWebhookUrl) {
    try {
      const response = await fetch(options.leadNotificationWebhookUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          ...notificationPayload,
          notifyTo: options.leadNotificationEmailTo,
          sentAt: new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(8_000),
      });

      results.push({
        channel: "webhook",
        sent: response.ok,
        status: response.status,
      });
    } catch (error) {
      results.push({
        channel: "webhook",
        sent: false,
        reason: error instanceof Error ? error.message : "notification_failed",
      });
    }
  }

  if (options.leadNotificationEmailTo) {
    try {
      const from =
        options.leadNotificationSmtp?.from ??
        options.adminUser?.email ??
        "owner@assad-dar.de";
      const email = buildLeadNotificationEmail(
        notificationPayload,
        options.leadNotificationEmailTo,
        from,
      );

      if (options.leadNotificationEmailSender) {
        await options.leadNotificationEmailSender(email);
      } else if (options.leadNotificationSmtp) {
        await sendSmtpEmail(options.leadNotificationSmtp, email);
      } else {
        results.push({
          channel: "email",
          sent: false,
          reason: "smtp_not_configured",
        });
      }

      if (options.leadNotificationEmailSender || options.leadNotificationSmtp) {
        results.push({ channel: "email", sent: true });
      }
    } catch (error) {
      results.push({
        channel: "email",
        sent: false,
        reason: error instanceof Error ? error.message : "email_failed",
      });
    }
  }

  return {
    sent: results.some((result) => result.sent === true),
    results,
  };
}

export async function notifyVisitorConfirmation(
  options: BuildServerOptions,
  payload: {
    tenantName: string;
    type: "lead_capture" | "readiness_assessment";
    fields: Record<string, string>;
    pageUrl?: string;
    score?: number;
    bookingUrl?: string;
  },
) {
  const visitorEmail = findEmail(payload.fields);
  if (!visitorEmail) {
    return { sent: false, reason: "visitor_email_missing" };
  }

  const from =
    options.leadNotificationSmtp?.from ??
    options.adminUser?.email ??
    "owner@assad-dar.de";
  return sendNotificationEmail(
    options,
    buildVisitorConfirmationEmail(payload, visitorEmail, from),
  );
}

export async function sendNotificationEmail(
  options: BuildServerOptions,
  email: LeadNotificationEmail,
) {
  if (options.leadNotificationEmailSender) {
    await options.leadNotificationEmailSender(email);
    return { sent: true, channel: "email" };
  }

  if (options.leadNotificationSmtp) {
    await sendSmtpEmail(options.leadNotificationSmtp, email);
    return { sent: true, channel: "email" };
  }

  return { sent: false, reason: "smtp_not_configured" };
}

function buildLeadNotificationEmail(
  payload: LeadNotificationPayload,
  to: string,
  from: string,
): LeadNotificationEmail {
  const typeLabel =
    payload.type === "readiness_assessment"
      ? "AI readiness lead"
      : "Website lead";
  const subjectParts = [typeLabel, payload.tenantName];
  if (payload.score) {
    subjectParts.push(`${payload.score}/100`);
  }

  return {
    to,
    from,
    subject: subjectParts.join(" - "),
    text: [
      `${typeLabel} captured for ${payload.tenantName}`,
      "",
      `Conversation: ${payload.conversationId}`,
      payload.adminUrl ? `Open in admin: ${payload.adminUrl}` : "",
      payload.score ? `Readiness score: ${payload.score}/100` : "",
      payload.pageUrl ? `Page: ${payload.pageUrl}` : "",
      "",
      "Details:",
      ...Object.entries(payload.fields)
        .filter(([, value]) => value.trim())
        .map(([key, value]) => `${titleCase(key)}: ${value.trim()}`),
      "",
      "Raw message:",
      payload.message,
    ]
      .filter((line) => line !== "")
      .join("\n"),
  };
}

function buildVisitorConfirmationEmail(
  payload: {
    tenantName: string;
    type: "lead_capture" | "readiness_assessment";
    fields: Record<string, string>;
    pageUrl?: string;
    score?: number;
    bookingUrl?: string;
  },
  to: string,
  from: string,
): LeadNotificationEmail {
  const typeLabel =
    payload.type === "readiness_assessment"
      ? "AI readiness check"
      : "AI consultation request";
  const firstName =
    payload.fields.name?.trim().split(/\s+/)[0] ||
    payload.fields.Name?.trim().split(/\s+/)[0] ||
    "there";

  return {
    to,
    from,
    subject: `${typeLabel} received - ${payload.tenantName}`,
    text: [
      `Hi ${firstName},`,
      "",
      `Thanks for contacting ${payload.tenantName}. Your request was received and the team can follow up with the context you shared.`,
      payload.score ? `AI readiness score: ${payload.score}/100` : "",
      payload.bookingUrl ? `Book a time directly: ${payload.bookingUrl}` : "",
      payload.pageUrl ? `Page: ${payload.pageUrl}` : "",
      "",
      "Shared details:",
      ...Object.entries(payload.fields)
        .filter(([, value]) => value.trim())
        .map(([key, value]) => `${titleCase(key)}: ${value.trim()}`),
      "",
      "Best regards",
      payload.tenantName,
    ]
      .filter((line) => line !== "")
      .join("\n"),
  };
}

function buildLeadAdminUrl(
  payload: LeadNotificationPayload,
  adminPublicUrl = defaultAdminPublicUrl,
) {
  const url = new URL(adminPublicUrl);
  url.searchParams.set("tenantId", payload.tenantId);
  url.searchParams.set("tab", "leads");
  if (payload.handoffId) {
    url.searchParams.set("handoffId", payload.handoffId);
  }
  if (payload.conversationId) {
    url.searchParams.set("conversationId", payload.conversationId);
  }
  return url.toString();
}

async function sendSmtpEmail(
  smtp: NonNullable<BuildServerOptions["leadNotificationSmtp"]>,
  email: LeadNotificationEmail,
) {
  const socket = smtp.secure
    ? tls.connect({
        host: smtp.host,
        port: smtp.port,
        servername: smtp.host,
      })
    : net.createConnection({
        host: smtp.host,
        port: smtp.port,
      });

  socket.setTimeout(12_000);

  let buffer = "";
  const waiters: Array<{
    resolve: (response: { code: number; text: string }) => void;
    reject: (error: Error) => void;
  }> = [];

  function takeResponse() {
    const lines = buffer.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (/^\d{3} /.test(line ?? "")) {
        const responseLines = lines.slice(0, index + 1);
        buffer = lines.slice(index + 1).join("\r\n");
        return {
          code: Number(line?.slice(0, 3)),
          text: responseLines.join("\n"),
        };
      }
    }
    return null;
  }

  function flushWaiters() {
    let response = takeResponse();
    while (response && waiters.length) {
      const waiter = waiters.shift();
      waiter?.resolve(response);
      response = takeResponse();
    }
  }

  socket.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    flushWaiters();
  });

  const socketReady = new Promise<void>((resolve, reject) => {
    socket.once(smtp.secure ? "secureConnect" : "connect", () => resolve());
    socket.once("error", reject);
    socket.once("timeout", () =>
      reject(new Error("SMTP connection timed out.")),
    );
  });

  function readResponse() {
    const response = takeResponse();
    if (response) {
      return Promise.resolve(response);
    }
    return new Promise<{ code: number; text: string }>((resolve, reject) => {
      waiters.push({ resolve, reject });
    });
  }

  async function command(line: string, expected: number[]) {
    socket.write(`${line}\r\n`);
    const response = await readResponse();
    if (!expected.includes(response.code)) {
      throw new Error(`SMTP ${response.code}: ${response.text}`);
    }
    return response;
  }

  await socketReady;
  const greeting = await readResponse();
  if (greeting.code !== 220) {
    throw new Error(`SMTP ${greeting.code}: ${greeting.text}`);
  }

  await command("EHLO assaddar-ai", [250]);
  if (smtp.username && smtp.password) {
    await command("AUTH LOGIN", [334]);
    await command(Buffer.from(smtp.username).toString("base64"), [334]);
    await command(Buffer.from(smtp.password).toString("base64"), [235]);
  }
  await command(`MAIL FROM:<${email.from}>`, [250]);
  await command(`RCPT TO:<${email.to}>`, [250, 251]);
  await command("DATA", [354]);
  socket.write(formatSmtpMessage(email));
  const accepted = await readResponse();
  if (accepted.code !== 250) {
    throw new Error(`SMTP ${accepted.code}: ${accepted.text}`);
  }
  await command("QUIT", [221]);
  socket.end();
}

function formatSmtpMessage(email: LeadNotificationEmail) {
  const body = email.text.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
  return [
    `From: ${email.from}`,
    `To: ${email.to}`,
    `Subject: ${escapeMailHeader(email.subject)}`,
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    body,
    ".",
    "",
  ].join("\r\n");
}

function escapeMailHeader(value: string) {
  return value.replace(/[\r\n]+/g, " ").slice(0, 160);
}
