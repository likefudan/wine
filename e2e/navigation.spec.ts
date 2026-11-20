import { expect, test } from "@playwright/test";

test("a new page opens at its top; an empty note is not ticked; 推荐 sits under 品鉴", async ({ page }) => {
  await page.goto("/");
  await page.fill('input[type="email"]', `nav${Date.now()}@example.com`);
  await page.click("text=Dev login");
  await page.click("text=刚开始认真喝，想学怎么品");
  await page.click("text=新建品鉴");
  await page.fill('.sheet input[placeholder^="例如"]', "Scroll day");
  await page.click("text=建好了");
  await page.click("text=加下一款酒");
  await page.fill("input.search", "Scroll Winery");
  await page.click("text=新酒：Scroll Winery");
  await page.fill('input[placeholder="2019"]', "2020");
  await page.click(".choice >> text=红");
  await page.click("text=开始品鉴");
  await expect(page).toHaveURL(/\/taste\//);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => scrollY)).toBe(0);

  // Nothing written yet: the wine in the list is not ticked off.
  await page.click("header >> text=完成");
  await expect(page.locator(".rows.numbered .row .row-score")).toHaveText("记");

  // 为你推荐 belongs under 品鉴 in the tab bar.
  await page.goto("/recs");
  await expect(page.locator(".tabbar a.on")).toContainText("品鉴");
});

test("pages glide in: forward from the right, back from the left, tabs fade", async ({ page }) => {
  // What the page's arrival looks like right after a navigation: the first keyframe of <main>'s animation.
  const arrival = () =>
    page.evaluate(() => {
      const a = document.querySelector("main")?.getAnimations()[0];
      const k = (a?.effect as KeyframeEffect | undefined)?.getKeyframes()[0];
      return k ? String(k.transform ?? "fade") : "none";
    });
  await page.goto("/");
  await page.fill('input[type="email"]', `motion${Date.now()}@example.com`);
  await page.click("text=Dev login");
  await page.click("text=刚开始认真喝，想学怎么品");
  await expect(page.locator(".tabbar")).toBeVisible();
  await page.waitForTimeout(400);
  expect(await arrival()).toBe("none");

  await page.click(".tabbar >> text=酒册");
  await expect(page).toHaveURL(/\/library/);
  expect(await arrival()).toBe("fade");

  await page.click(".dock-add");
  await expect(page).toHaveURL(/\/add/);
  expect(await arrival()).toBe("translateX(22px)");
  await page.waitForTimeout(400);
  expect(await arrival()).toBe("none");

  await page.click('button[aria-label="返回"]');
  await expect(page).toHaveURL(/\/library/);
  expect(await arrival()).toBe("translateX(-22px)");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  // The browser's own back (or a swipe from the edge, which the phone animates itself): no second glide.
  await page.click(".dock-add");
  await page.waitForTimeout(800);
  await page.goBack();
  await expect(page).toHaveURL(/\/library/);
  expect(await arrival()).toBe("none");
});

test("less motion asked for: a short fade only", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.fill('input[type="email"]', `calm${Date.now()}@example.com`);
  await page.click("text=Dev login");
  await page.click("text=刚开始认真喝，想学怎么品");
  await page.click(".dock-add");
  await expect(page).toHaveURL(/\/add/);
  const first = await page.evaluate(() => {
    const a = document.querySelector("main")?.getAnimations()[0];
    return (a?.effect as KeyframeEffect | undefined)?.getKeyframes()[0]?.transform ?? "fade";
  });
  expect(first).toBe("fade");
});
