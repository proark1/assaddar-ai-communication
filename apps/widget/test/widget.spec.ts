import { expect, test, type Page } from "@playwright/test";

async function loadWidget(page: Page) {
  await page.goto("http://127.0.0.1:5174/__widget-test__");
  await page.setContent("<!doctype html><html><body></body></html>");

  return page.evaluate(() => {
    return new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = "http://127.0.0.1:5174/src/widget.ts";
      script.dataset.assistantId = "asst_test";
      script.dataset.apiUrl = "http://127.0.0.1:5174";
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  });
}

test("widget renders inside a shadow root and sends a grounded message", async ({
  page,
}) => {
  const browserMessages: string[] = [];
  page.on("console", (message) => {
    browserMessages.push(`${message.type()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => {
    browserMessages.push(`pageerror: ${error.message}`);
  });

  await page.route("**/widget/config/**", async (route) => {
    await route.fulfill({
      json: {
        assistantId: "asst_test",
        tenantName: "Test Tenant",
        defaultLocale: "en",
        theme: {
          primaryColor: "#155eef",
          openingMessage: "Hi from test",
        },
        limits: {
          maxMessageLength: 1200,
        },
      },
    });
  });

  await page.route("**/widget/chat", async (route) => {
    await route.fulfill({
      json: {
        conversationId: "conv_test",
        status: "answered",
        reply: "We are open from 09:00 to 18:00.",
        handoffRecommended: false,
      },
    });
  });

  const scriptLoaded = await loadWidget(page);
  expect(scriptLoaded, browserMessages.join("\n")).toBe(true);

  const root = page.locator('[data-assaddar-widget-root="asst_test"]');
  await expect(root, browserMessages.join("\n")).toBeAttached();

  await page.getByRole("button", { name: "Chat" }).click();
  await expect(page.locator(".bubble.assistant").first()).toContainText(
    "Hi from test",
  );

  await page.locator(".composer input").fill("When are you open?");
  await page.getByRole("button", { name: "Send message" }).click();

  await expect(page.locator(".bubble.user")).toContainText(
    "When are you open?",
  );
  await expect(page.locator(".bubble.assistant").last()).toContainText(
    "09:00 to 18:00",
  );

  const storedState = await page.evaluate(() => {
    const raw = window.localStorage.getItem("assaddar_widget_asst_test");
    return raw ? JSON.parse(raw) : null;
  });
  expect(storedState).toMatchObject({
    conversationId: "conv_test",
    messages: expect.arrayContaining([
      expect.objectContaining({ role: "user", text: "When are you open?" }),
    ]),
  });
  expect(storedState.messages.length).toBeLessThanOrEqual(50);

  await page.getByRole("button", { name: "Clear conversation" }).click();
  await expect(page.locator(".bubble")).toHaveCount(1);
  await expect(page.locator(".bubble.assistant").first()).toContainText(
    "Hi from test",
  );
  const resetState = await page.evaluate(() => {
    const raw = window.localStorage.getItem("assaddar_widget_asst_test");
    return raw ? JSON.parse(raw) : null;
  });
  expect(resetState.conversationId).toBeUndefined();
  expect(resetState.messages).toHaveLength(1);
});

test("widget tracks non-critical events with sendBeacon when available", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "sendBeacon", {
      configurable: true,
      value: (url: string, data: BodyInit | null) => {
        (
          window as unknown as {
            __assaddarBeacon?: { url: string; type: string };
          }
        ).__assaddarBeacon = {
          url,
          type: data instanceof Blob ? data.type : typeof data,
        };
        return true;
      },
    });
  });

  await page.route("**/widget/config/**", async (route) => {
    await route.fulfill({
      json: {
        assistantId: "asst_test",
        tenantName: "Test Tenant",
        defaultLocale: "en",
        theme: {
          openingMessage: "Hi from test",
        },
        limits: {
          maxMessageLength: 1200,
        },
      },
    });
  });

  await expect(await loadWidget(page)).toBe(true);
  await page.getByRole("button", { name: "Chat" }).click();

  const beacon = await page.evaluate(
    () =>
      (
        window as unknown as {
          __assaddarBeacon?: { url: string; type: string };
        }
      ).__assaddarBeacon,
  );
  expect(beacon).toMatchObject({
    url: "http://127.0.0.1:5174/widget/events",
    type: "application/json",
  });
});

test("widget shows pending and rate-limit feedback", async ({ page }) => {
  await page.route("**/widget/config/**", async (route) => {
    await route.fulfill({
      json: {
        assistantId: "asst_test",
        tenantName: "Test Tenant",
        defaultLocale: "en",
        theme: {
          primaryColor: "#2f6f73",
          openingMessage: "Hi from test",
        },
        limits: {
          maxMessageLength: 1200,
        },
      },
    });
  });

  let requestCount = 0;
  await page.route("**/widget/chat", async (route) => {
    requestCount += 1;
    if (requestCount === 1) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    await route.fulfill({
      json: {
        conversationId: "conv_test",
        status: "answered",
        reply: `Answer ${requestCount}`,
        handoffRecommended: false,
      },
    });
  });

  await expect(await loadWidget(page)).toBe(true);
  await page.getByRole("button", { name: "Chat" }).click();

  await page.locator(".composer input").fill("First question");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator(".bubble.typing")).toContainText("Typing");
  await expect(page.locator(".bubble.assistant").last()).toContainText(
    "Answer 1",
  );

  for (let index = 0; index < 9; index += 1) {
    await page.locator(".composer input").fill(`Question ${index}`);
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.locator(".bubble.assistant").last()).toContainText(
      `Answer ${index + 2}`,
    );
  }

  await page.locator(".composer input").fill("One too many");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator(".bubble.assistant").last()).toContainText(
    "Please wait a moment",
  );
});

test("widget captures a consented lead", async ({ page }) => {
  await page.route("**/widget/config/**", async (route) => {
    await route.fulfill({
      json: {
        assistantId: "asst_test",
        tenantName: "Test Tenant",
        defaultLocale: "en",
        theme: {
          consentEnabled: true,
          leadCaptureEnabled: true,
          readinessEnabled: false,
          quickReplies: [],
          openingMessage: "Hi from test",
          leadCaptureFields: ["name", "email", "company", "message"],
        },
        limits: {
          maxMessageLength: 1200,
        },
      },
    });
  });

  let leadPayload: unknown;
  await page.route("**/widget/leads", async (route) => {
    leadPayload = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      json: {
        conversationId: "conv_lead",
        status: "captured",
      },
    });
  });

  await expect(await loadWidget(page)).toBe(true);
  await page.getByRole("button", { name: "Chat" }).click();
  await page.getByRole("button", { name: "Accept" }).click();
  await page.getByRole("button", { name: "Request a consultation" }).click();

  const leadForm = page.locator(".lead-form");
  await leadForm.getByPlaceholder("Name").fill("Ada Lovelace");
  await leadForm.getByPlaceholder("Email").fill("ada@example.com");
  await leadForm.getByPlaceholder("Company").fill("Analytical Engines");
  await leadForm.getByPlaceholder("Message").fill("We need automation help.");
  await page.getByRole("button", { name: "Send details" }).click();

  await expect(page.locator(".bubble.assistant").last()).toContainText(
    "Thanks",
  );
  expect(leadPayload).toMatchObject({
    assistantId: "asst_test",
    fields: {
      name: "Ada Lovelace",
      email: "ada@example.com",
      company: "Analytical Engines",
      message: "We need automation help.",
    },
  });
});

test("widget submits readiness assessments", async ({ page }) => {
  await page.route("**/widget/config/**", async (route) => {
    await route.fulfill({
      json: {
        assistantId: "asst_test",
        tenantName: "Test Tenant",
        defaultLocale: "en",
        theme: {
          leadCaptureEnabled: false,
          readinessEnabled: true,
          quickReplies: [],
          openingMessage: "Hi from test",
        },
        limits: {
          maxMessageLength: 1200,
        },
      },
    });
  });

  await page.route("**/widget/readiness", async (route) => {
    await route.fulfill({
      status: 201,
      json: {
        conversationId: "conv_ready",
        status: "captured",
        score: 82,
        recommendation: "Start with one support workflow.",
        qualified: true,
        bookingUrl: "https://example.com/book",
      },
    });
  });

  await expect(await loadWidget(page)).toBe(true);
  await page.getByRole("button", { name: "Chat" }).click();
  await page.getByRole("button", { name: "Check AI readiness" }).click();
  const readinessForm = page.locator(".readiness-form");
  await readinessForm
    .getByPlaceholder("Main AI goal")
    .fill("Reduce support load");
  await readinessForm
    .getByPlaceholder("Most painful manual process")
    .fill("Routing email requests");
  await readinessForm.getByPlaceholder("Timeline").fill("This quarter");
  await page.getByRole("button", { name: "Check readiness" }).click();

  await expect(page.locator(".bubble.assistant").last()).toContainText(
    "82/100",
  );
  await expect(page.locator(".bubble.assistant").last()).toContainText(
    "https://example.com/book",
  );
});

test("widget handles chat errors and mobile layout", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await page.route("**/widget/config/**", async (route) => {
    await route.fulfill({
      json: {
        assistantId: "asst_test",
        tenantName: "Test Tenant",
        defaultLocale: "en",
        theme: {
          openingMessage: "Hi from test",
        },
        limits: {
          maxMessageLength: 1200,
        },
      },
    });
  });
  await page.route("**/widget/chat", async (route) => {
    await route.fulfill({ status: 500, body: "nope" });
  });

  await expect(await loadWidget(page)).toBe(true);
  await page.getByRole("button", { name: "Chat" }).click();
  const box = await page.locator(".panel.open").boundingBox();
  expect(box?.width).toBeLessThanOrEqual(390);
  expect(box?.height).toBeLessThanOrEqual(676);

  await page.locator(".composer input").fill("Will this fail?");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator(".bubble.assistant").last()).toContainText(
    "try again later",
  );
});
