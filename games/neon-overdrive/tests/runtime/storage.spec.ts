import { expect, test } from "@playwright/test";

import { LEGACY_KEY, PROFILE_KEY } from "./runtime-driver";

const legacyValue = JSON.stringify({ best: 9_999_999, unlockedEndless: true });
const invalidProfiles = [
  { label: "invalid JSON", value: "{" },
  { label: "wrong version", value: JSON.stringify({ schemaVersion: 999 }) },
  {
    label: "extra field",
    value: JSON.stringify({
      schemaVersion: 1,
      best: { story: 0, rush: 0, endless: 0 },
      unlockedEndless: false,
      extra: true,
    }),
  },
];

for (const invalid of invalidProfiles) {
  test(`fails fast for ${invalid.label} and leaves legacy storage untouched`, async ({ page }) => {
    await page.addInitScript(
      ({ profileKey, profileValue, legacyKey, legacy }) => {
        localStorage.setItem(profileKey, profileValue);
        localStorage.setItem(legacyKey, legacy);
      },
      {
        profileKey: PROFILE_KEY,
        profileValue: invalid.value,
        legacyKey: LEGACY_KEY,
        legacy: legacyValue,
      },
    );
    await page.goto("/", { waitUntil: "load" });
    const failure = page.locator("[data-neon-boot-error]");
    await expect(failure).toBeVisible();
    await expect(failure).toHaveAttribute(
      "data-neon-boot-error",
      invalid.label === "invalid JSON" ? "profile.json" : "profile.schema",
    );
    expect(await page.evaluate((key) => localStorage.getItem(key), PROFILE_KEY)).toBe(
      invalid.value,
    );
    expect(await page.evaluate((key) => localStorage.getItem(key), LEGACY_KEY)).toBe(legacyValue);
    expect(await page.evaluate(() => "__NEON_DEBUG__" in window)).toBe(false);
  });
}
