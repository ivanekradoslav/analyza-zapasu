import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_VIDEO = path.resolve(__dirname, "fixtures/test-match.mp4");

test.beforeAll(() => {
  if (!fs.existsSync(TEST_VIDEO)) {
    throw new Error(
      `Chýba testovacie video ${TEST_VIDEO}. Spusti najprv "npm run gen:testvideo".`
    );
  }
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    indexedDB.deleteDatabase("analyza-zapasu");
  });
});

test("základný flow: projekt -> video -> tag -> klip -> playlist", async ({ page }) => {
  await page.goto("/");

  // 1. Vytvorenie projektu
  await page.getByRole("button", { name: "Nový projekt" }).click();
  await page.getByPlaceholder("FC Súper").fill("Testovací súper");
  await page.getByRole("button", { name: "Vytvoriť" }).click();

  await expect(page.getByText("Testovací súper", { exact: false })).toBeVisible();

  // 2. Otvorenie testovacieho videa
  await page.locator('input[type="file"][accept^="video"]').setInputFiles(TEST_VIDEO);

  const video = page.locator("video");
  await expect(video).toBeVisible();
  await page.waitForFunction(() => {
    const v = document.querySelector("video");
    return !!v && v.duration > 0 && !Number.isNaN(v.duration);
  });

  // 3. Pridanie tagu klávesovou skratkou (q = Útok)
  await page.locator("body").click();
  await page.keyboard.press("q");
  await expect(page.getByText("Útok", { exact: false }).first()).toBeVisible();

  // 4. Manuálny klip cez I/O body
  await page.getByText("Klipy a playlisty").click();
  const clipCard = page.locator(".card", { hasText: "Manuálny klip" });
  await clipCard.getByRole("button", { name: /^I:/ }).click();
  await page.evaluate(() => {
    const v = document.querySelector("video")!;
    v.currentTime = 3;
  });
  await page.waitForTimeout(200);
  await clipCard.getByRole("button", { name: /^O:/ }).click();
  await clipCard.getByRole("button", { name: "Vytvoriť", exact: true }).click();

  // 5. Playlist
  const playlistCard = page.locator(".card", { hasText: "Playlisty" });
  await playlistCard.getByPlaceholder("Nový playlist...").fill("Test playlist");
  await playlistCard.locator("button.btn-primary").click();
  await expect(playlistCard.getByText("Test playlist", { exact: false }).first()).toBeVisible();

  // 6. Štatistiky zobrazujú aspoň jeden záznam
  await page.getByText("Štatistiky", { exact: true }).click();
  await expect(page.getByText("Útok", { exact: false }).first()).toBeVisible();
});

test("build smoke: appka sa načíta bez JS chýb", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  await page.goto("/");
  await expect(page.getByText("Analýza zápasu")).toBeVisible();
  expect(errors).toEqual([]);
});
