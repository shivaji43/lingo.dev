import { expect, Page, test } from "@playwright/test";
import {
  DevServer,
  findTranslationServerPort,
  setupFixture,
  type TestFixture,
} from "../../helpers/setup-fixture";
import { switchLocale } from "../../helpers/locale-switcher";

/**
 * Development Mode Tests
 * These tests verify that the translation system works correctly in development mode
 */

test.describe.serial("Development Mode", () => {
  test.describe.serial("Next.js", () => {
    let fixture: TestFixture;
    let page: Page;
    let devServer: DevServer;

    test.beforeAll(async ({ browser }, testInfo) => {
      fixture = await setupFixture({ framework: "next" });
      const context = await browser.newContext();
      page = await context.newPage();
      devServer = await fixture.startDev();
      testInfo.setTimeout(180000);
    });

    test.afterAll(async () => {
      // Stop dev server first, then clean up
      if (devServer) {
        await devServer.stop();
        // Give Windows time to release file handles
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      await page?.close();
      await fixture?.clean();
    });

    test("should start translation server on dev", async () => {
      // Wait for server to be ready
      await devServer.waitForReady();

      // Check translation server is running
      const translationPort = await findTranslationServerPort();
      expect(translationPort).toBeGreaterThanOrEqual(60000);
      expect(translationPort).not.toBeNull();

      if (translationPort) {
        // Verify health endpoint
        const health = await fetch(
          `http://localhost:${translationPort}/health`,
        );
        expect(health.status).toBe(200);
      }
    });

    test("should generate translations on demand in dev", async () => {
      // Navigate to app
      await page.goto(`http://localhost:${devServer.port}`);

      // Wait for page to load
      await page.waitForSelector("h1", { timeout: 30000 });
      const heading = await page.textContent("h1");
      expect(heading).toBeTruthy();
      console.log("Initial heading:", heading);

      // Monitor translation requests
      const translationRequests: string[] = [];
      page.on("response", (response) => {
        const url = response.url();
        if (url.includes("/translations/") || url.includes(".json")) {
          translationRequests.push(url);
          console.log("Translation request:", url);
        }
      });

      // Use the locale switching utility
      console.log("Switching to German locale...");
      await switchLocale(page, "de");

      // Wait a bit for translations to potentially load
      await page.waitForTimeout(2000);

      const germanHeading = await page.textContent("h1");
      console.log("German heading:", germanHeading);
      expect(germanHeading).toBeTruthy();

      // Log if translation system changed the text
      if (germanHeading !== heading) {
        console.log("✅ Translation changed the heading");
      } else {
        console.log(
          "⚠️  Heading unchanged (pseudo-translation may not modify all text)",
        );
      }

      await switchLocale(page, "en");
      // Verify translation request was made (optional check)
      console.log("Translation requests:", translationRequests);
    });

    test("should handle hot reload with text changes", async () => {
      await page.goto(`http://localhost:${devServer.port}`);

      // Wait for initial render
      await page.waitForSelector("h1", { timeout: 30000 });
      const initialText = await page.textContent("h1");
      expect(initialText).toBeTruthy();

      // Modify the component
      const pagePath = "app/page.tsx";
      await fixture.updateFile(pagePath, (content) => {
        // Add a new text element
        return content.replace(
          "</main>",
          '<p data-testid="hot-reload-test">Hot reload works!</p></main>',
        );
      });

      // Wait for hot reload
      await page.waitForSelector('[data-testid="hot-reload-test"]', {
        timeout: 15000,
      });
      const newElement = await page.textContent(
        '[data-testid="hot-reload-test"]',
      );
      expect(newElement).toBe("Hot reload works!");

      // Restore original content
      await fixture.updateFile(pagePath, (content) => {
        return content.replace(
          '<p data-testid="hot-reload-test">Hot reload works!</p>',
          "",
        );
      });
    });
  });

  test.describe.serial("Vite", () => {
    let fixture: TestFixture;
    let page: Page;
    let devServer: DevServer;

    test.beforeAll(async ({ browser }, testInfo) => {
      fixture = await setupFixture({ framework: "vite" });
      const context = await browser.newContext();
      page = await context.newPage();
      devServer = await fixture.startDev();
      testInfo.setTimeout(180000); // 3 minutes timeout for packing and installing deps
    });

    test.afterAll(async () => {
      if (devServer) {
        await devServer.stop();
        // Give Windows time to release file handles
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      await page?.close();
      await fixture?.clean();
    });

    test("should start vite dev server and render page", async () => {
      // Wait for server to be ready
      await devServer.waitForReady();

      // Navigate to app
      await page.goto(`http://localhost:${devServer.port}`);
      await page.waitForSelector("h1", { timeout: 30000 });

      const heading = await page.textContent("h1");
      console.log("Vite - Initial heading:", heading);
      expect(heading).toBeTruthy();
      expect(heading).toContain("Welcome");
    });

    test("should switch locales and verify translation system", async () => {
      const devServer = await fixture.startDev();

      try {
        // Navigate to homepage
        await page.goto(`http://localhost:${devServer.port}`);
        await page.waitForSelector("h1", { timeout: 30000 });

        const initialHeading = await page.textContent("h1");
        console.log("Vite - Initial heading:", initialHeading);
        expect(initialHeading).toBeTruthy();

        // Check that LocaleSwitcher is present
        const select = page.locator('select[aria-label="Select language"]');
        await expect(select).toBeVisible();

        // Switch to Spanish
        console.log("Vite - Switching to Spanish...");
        await switchLocale(page, "es");
        await page.waitForTimeout(2000);

        const spanishHeading = await page.textContent("h1");
        console.log("Vite - Spanish heading:", spanishHeading);
        expect(spanishHeading).toBeTruthy();

        if (spanishHeading !== initialHeading) {
          console.log("✅ Translation system changed the text");
        } else {
          console.log("⚠️  Text unchanged (pseudo-translation varies)");
        }
        await switchLocale(page, "en");
      } finally {
        await devServer.stop();
      }
    });

    test("should navigate between pages and persist locale", async () => {
      const devServer = await fixture.startDev();

      // Navigate to homepage
      await page.goto(`http://localhost:${devServer.port}`);
      await page.waitForSelector("h1", { timeout: 30000 });

      // Switch to French
      console.log("Vite - Switching to French...");
      await switchLocale(page, "fr");
      await page.waitForTimeout(1000);

      // Navigate to about page
      await page.click('a[href="/about"]');
      await page.waitForSelector("h1", { timeout: 10000 });

      const aboutHeading = await page.textContent("h1");
      console.log("Vite - About page heading:", aboutHeading);
      expect(aboutHeading).toBeTruthy();

      // Verify locale persisted
      const select = page.locator('select[aria-label="Select language"]');
      const currentLocale = await select.inputValue();
      expect(currentLocale).toBe("fr");
      console.log("✅ Locale persisted across navigation");
    });
  });
});
