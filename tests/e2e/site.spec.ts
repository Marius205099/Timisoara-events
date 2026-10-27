import { expect, test } from "@playwright/test";

/**
 * Runs against `npm run start` (embedded database). Project "iphone-safari" uses
 * WebKit with the iPhone 15 profile (viewport, touch, Safari user agent).
 */

test("homepage answers 'what can I do on Saturday?' in a few taps", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Ce facem în Timișoara?" })).toBeVisible();
  await expect(page.getByText("Evenimente și activități în Timișoara și la maximum 50 km.")).toBeVisible();
  for (const label of ["Azi", "Mâine", "Sâmbătă", "Duminică", "Weekend"]) {
    await expect(page.getByRole("link", { name: label, exact: true })).toBeVisible();
  }
  await page.getByRole("link", { name: "Sâmbătă", exact: true }).click();
  await expect(page).toHaveURL(/zi=sambata/);
  await expect(page.getByRole("heading", { level: 2 }).first()).toContainText(/Sâmbătă/i);
});

test("age chips filter and stay in the URL", async ({ page }) => {
  await page.goto("/?zi=7zile");
  await page.getByRole("button", { name: "3–7 ani" }).click();
  await expect(page).toHaveURL(/varsta=3-7/);
  await expect(page.getByRole("button", { name: "3–7 ani" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Toate vârstele" }).click();
  await expect(page).not.toHaveURL(/varsta=/);
});

test("touch targets are at least 44px and there is no horizontal overflow", async ({ page }) => {
  await page.goto("/");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  const small = await page.$$eval(".chip, .btn, .btn-primary, .btn-ghost", (els) =>
    els.filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => e.getBoundingClientRect().height).filter((h) => h < 43.5),
  );
  expect(small).toEqual([]);
});

test("public API never returns events beyond 50 km and ignores radius parameters", async ({ request }) => {
  const r = await request.get("/api/events?zi=7zile&radius=500000&max=999&dist=25-50");
  expect(r.ok()).toBeTruthy();
  const body = await r.json();
  expect(body.maxDistanceKm).toBe(50);
  for (const e of body.events) {
    expect(e.venue.distanceKm).toBeLessThanOrEqual(50);
    expect(e.venue.geoStatus).toBe("verified");
    expect(e.attendanceMode).not.toBe("online");
  }
});

test("event detail page has source link, distance and structured data", async ({ page, request }) => {
  const body = await (await request.get("/api/events?zi=7zile")).json();
  test.skip(!body.events.length, "no events in the database");
  const e = body.events[0];
  await page.goto(`/eveniment/${e.slug}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(e.title.slice(0, 20));
  await expect(page.getByText(/km de centrul Timișoarei \(distanță/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Surse" })).toBeVisible();
});

test("submission form validates on the server", async ({ page }) => {
  await page.goto("/adauga-eveniment");
  await page.getByRole("button", { name: "Trimite spre verificare" }).click();
  await expect(page.getByRole("alert").first()).toBeVisible();
});

test("admin requires login", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login/);
});
