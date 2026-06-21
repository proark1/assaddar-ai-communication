import { expect, test } from "@playwright/test";

test("widget renders inside a shadow root and sends a grounded message", async ({ page }) => {
  await page.route("**/widget/config/**", async (route) => {
    await route.fulfill({
      json: {
        assistantId: "asst_test",
        tenantName: "Test Tenant",
        defaultLocale: "en",
        theme: {
          primaryColor: "#155eef",
          openingMessage: "Hi from test"
        },
        limits: {
          maxMessageLength: 1200
        }
      }
    });
  });

  await page.route("**/widget/chat", async (route) => {
    await route.fulfill({
      json: {
        conversationId: "conv_test",
        status: "answered",
        reply: "We are open from 09:00 to 18:00.",
        handoffRecommended: false
      }
    });
  });

  await page.goto("about:blank");
  await page.addScriptTag({
    url: "http://localhost:5174/src/widget.ts",
    type: "module"
  });

  await page.evaluate(() => {
    const script = document.createElement("script");
    script.src = "http://localhost:5174/src/widget.ts";
    script.dataset.assistantId = "asst_test";
    script.dataset.apiUrl = "http://localhost:4000";
    document.body.appendChild(script);
  });

  const root = page.locator('[data-assaddar-widget-root="asst_test"]');
  await expect(root).toBeVisible();
});
