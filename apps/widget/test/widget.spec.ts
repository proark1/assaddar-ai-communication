import { expect, test } from "@playwright/test";

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

  await page.goto("http://127.0.0.1:5174/__widget-test__");
  await page.setContent("<!doctype html><html><body></body></html>");

  const scriptLoaded = await page.evaluate(() => {
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
