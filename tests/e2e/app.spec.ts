import { test, expect } from "@playwright/test";

test.describe("Landing page", () => {
  test("shows PIN entry form", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("SAVINT")).toBeVisible();
    await expect(page.getByPlaceholder("PIN")).toBeVisible();
    await expect(page.getByPlaceholder(/nome/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /entra/i })).toBeVisible();
  });

  test("PIN input only accepts 6 digits", async ({ page }) => {
    await page.goto("/");
    const pinInput = page.getByPlaceholder("PIN");
    await pinInput.fill("abc123def");
    // Should only contain digits, max 6
    const value = await pinInput.inputValue();
    expect(value.length).toBeLessThanOrEqual(6);
    expect(/^\d*$/.test(value)).toBe(true);
  });

  test("Entra button disabled without valid PIN and name", async ({ page }) => {
    await page.goto("/");
    const enterButton = page.getByRole("button", { name: /entra/i });
    await expect(enterButton).toBeDisabled();
  });
});

test.describe("Login page", () => {
  test("shows Google login button", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("SAVINT")).toBeVisible();
    await expect(page.getByRole("button", { name: /google/i })).toBeVisible();
  });
});

test.describe("Dashboard redirect", () => {
  test("redirects to login when not authenticated", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForURL(/login/);
    expect(page.url()).toContain("login");
  });
});
