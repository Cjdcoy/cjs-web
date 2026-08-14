import { expect, test as base, type Page } from "@playwright/test";

const browserErrors = new WeakMap<Page, string[]>();
const allowedBrowserErrors = new WeakMap<Page, RegExp[]>();

export const test = base;

test.beforeEach(({ page }) => {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  allowedBrowserErrors.set(page, []);
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console.error: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
});

test.afterEach(({ page }) => {
  const allowed = allowedBrowserErrors.get(page) ?? [];
  const unexpected = (browserErrors.get(page) ?? []).filter(
    (error) => !allowed.some((pattern) => pattern.test(error)),
  );
  expect(unexpected, "unexpected browser console/page errors").toEqual([]);
});

export function allowBrowserError(page: Page, pattern: RegExp) {
  allowedBrowserErrors.get(page)?.push(pattern);
}

export { expect };
