import { expect, test } from "@playwright/test";

const NEAR = {
  address: "7900 St Helena Hwy, Oakville, CA 94562, USA",
  places: [
    {
      id: "ChIJopusOneWinery000",
      name: "Opus One Winery",
      address: "7900 St Helena Hwy, Oakville, CA 94562, USA",
      country: "United States",
      area: "California",
      lat: 38.4417,
      lng: -122.3986,
      distance: 40,
    },
  ],
};

test.use({ geolocation: { latitude: 38.4416, longitude: -122.3985 }, permissions: ["geolocation"] });

test("品一款 notes where I am, and 新建品鉴 finds the place around me", async ({ page }) => {
  // Google is not reachable from the test server: answer the nearby lookup here.
  await page.route("**/api/places/near?**", (r) => r.fulfill({ json: NEAR }));
  await page.goto("/");
  await page.fill('input[type="email"]', "owner@example.com");
  await page.click("text=Dev login");
  await page.click("text=刚开始认真喝，想学怎么品");

  await page.click("text=新建品鉴");
  await page.click(".sheet >> text=用当前位置");
  await page.click(".nearby-list >> text=Opus One Winery");
  await expect(page.locator('.sheet input[placeholder="Opus One"]')).toHaveValue("Opus One Winery");
  await expect(page.locator(".sheet input[maxlength='200']")).toHaveValue(NEAR.address);
  await expect(page.locator('.sheet input[placeholder^="例如：Napa"]')).toHaveValue("Opus One Winery");
  await page.click("text=建好了");

  await page.click("text=加下一款酒");
  await page.fill("input.search", "Overture");
  await page.click("text=新酒：Overture");
  await page.fill('input[placeholder="2019"]', "2020");
  await page.click(".choice >> text=红");
  await page.click("text=开始品鉴");

  // The first time it asks; then the place shows on the note.
  await page.click(".row-notice >> text=好");
  await expect(page.locator(".tasting-place")).toContainText("Opus One Winery");
  await expect(page.locator(".tasting-place")).toContainText("7900 St Helena Hwy");

  // Edit it by hand, then remove it.
  await page.click(".tasting-place >> text=修改");
  await page.fill('.sheet input[placeholder="例如：Opus One、我家"]', "Tasting room");
  await page.click(".sheet >> text=保存");
  await expect(page.locator(".tasting-place")).toContainText("Tasting room");
  await page.click('.tasting-place [aria-label="去掉地点"]');
  await expect(page.locator(".tasting-place")).toContainText("记下品酒地点");

  // 我 → 设置 turns it off.
  await page.click("text=完成");
  await page.click('nav >> text="我"');
  await page.click(".me-links >> text=设置");
  await expect(page.locator('[aria-label="记下品酒地点"] .on')).toHaveText("开");
  await page.click('[aria-label="记下品酒地点"] >> text=关');
  await expect(page.locator('[aria-label="记下品酒地点"] .on')).toHaveText("关");
});

test("with no signal the position is kept, and the address follows once online", async ({ page, context }) => {
  await page.route("**/api/places/near?**", (r) => r.fulfill({ json: NEAR }));
  await page.goto("/");
  await page.fill('input[type="email"]', "owner@example.com");
  await page.click("text=Dev login");
  // The first test turned it off at the end.
  await page.click('nav >> text="我"');
  await page.click(".me-links >> text=设置");
  await page.click('[aria-label="记下品酒地点"] >> text=开');
  await page.click(".dock-add");
  await context.setOffline(true);
  await page.fill("input.search", "Dominus");
  await page.click("text=新酒：Dominus");
  await page.fill('input[placeholder="2019"]', "2019");
  await page.click(".choice >> text=红");
  await page.click("text=开始品鉴");
  await expect(page.locator(".tasting-place")).toContainText("已记下位置，联网后补上地址");
  await context.setOffline(false);
  await expect(page.locator(".tasting-place")).toContainText("Opus One Winery");
});
