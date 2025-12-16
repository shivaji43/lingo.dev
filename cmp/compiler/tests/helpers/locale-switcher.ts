import { Page } from "@playwright/test";

/**
 * Framework-agnostic locale switching utility
 * Uses the LocaleSwitcher component (select element) to change locales
 */
export async function switchLocale(
  page: Page,
  targetLocale: string,
): Promise<void> {
  // Find the locale switcher select element
  const select = page
    .locator(
      'select.lingo-locale-switcher, select.locale-switcher, select[aria-label="Select language"]',
    )
    .first();

  // Select the target locale
  await select.selectOption(targetLocale);

  // Wait for the locale change to complete
  // This waits for any network requests to finish (e.g., translation file loading)
  await page.waitForLoadState("networkidle", { timeout: 10000 });
}

/**
 * Get the current locale from the page
 */
export async function getCurrentLocale(page: Page): Promise<string> {
  // Get the value from the select element
  const select = page
    .locator(
      'select.lingo-locale-switcher, select.locale-switcher, select[aria-label="Select language"]',
    )
    .first();
  const locale = await select.inputValue();
  return locale || "en";
}

/**
 * Wait for a specific text to appear on the page
 * Useful for verifying translations have loaded
 */
export async function waitForText(
  page: Page,
  selector: string,
  text: string,
  timeout = 5000,
): Promise<void> {
  await page.waitForFunction(
    ({ selector, text }) => {
      const element = document.querySelector(selector);
      return element?.textContent?.includes(text);
    },
    { selector, text },
    { timeout },
  );
}

/**
 * Wait for text content to change from its initial value
 * Useful when switching locales
 */
export async function waitForTextChange(
  page: Page,
  selector: string,
  initialText: string,
  timeout = 5000,
): Promise<void> {
  await page.waitForFunction(
    ({ selector, initialText }) => {
      const element = document.querySelector(selector);
      const currentText = element?.textContent || "";
      return currentText !== initialText && currentText.length > 0;
    },
    { selector, initialText },
    { timeout },
  );
}
