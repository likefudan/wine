import { expect, test } from "@playwright/test";

// 和上一款比: from the second wine in a tasting, 入门's scale questions can be answered against the last one.
test("a beginner compares the second wine with the first", async ({ page }) => {
  await page.goto("/");
  await page.fill('input[type="email"]', `compare${Date.now()}@example.com`);
  await page.click("text=Dev login");
  await page.click("text=刚开始认真喝，想学怎么品");
  await page.click("text=新建品鉴");
  await page.fill('.sheet input[placeholder="Opus One"]', "Compare Winery");
  await page.fill('.sheet input[placeholder^="例如"]', "Compare day");
  await page.click("text=建好了");

  const addRed = async (name: string) => {
    await page.click("text=加下一款酒");
    await page.fill("input.search", name);
    await page.click(`text=新酒：${name}`);
    await page.fill('input[placeholder="2019"]', "2020");
    await page.click(".choice >> text=红");
    await page.click("text=开始品鉴");
    await expect(page.locator(".q-ask")).toHaveText("杯里的酒最像哪个颜色？");
    await page.click("text=下一题");
    await page.click(".answer >> text=清澈");
    await page.click("text=干净，没有怪味");
    await page.click("text=正常，一闻就有");
    await page.click("text=下一题");
  };

  // The first wine: no comparison to offer.
  await addRed("First Compare Red");
  await expect(page.locator(".compare-prev")).toHaveCount(0);
  await page.click("text=完全不甜，像无糖茶");
  await page.click("text=流一点");
  await page.click("text=很干，像咬了一口没熟的柿子");
  await page.click("text=有一点暖");
  await page.click(".answer >> text=全脂奶");
  await page.click(".answer >> text=适中");
  await page.click("text=下一题");
  await page.click("text=很久，十几秒以上");
  await page.click("text=说不上来"); // quality
  await page.click("header >> text=完成");

  // The second: “less drying than the last one” is one step below its tannin.
  await addRed("Second Compare Red");
  await expect(page.locator(".compare-prev")).toContainText("First Compare Red");
  await page.click(".compare-prev >> text=差不多"); // sweetness
  await page.click(".compare-prev >> text=更酸"); // acidity
  await page.click(".compare-prev >> text=没那么涩"); // tannin
  await page.click(".compare-prev >> text=差不多"); // alcohol
  await page.click(".compare-prev >> text=差不多"); // body
  await page.click("text=说不上来"); // flavour intensity
  await page.click("text=下一题"); // flavours
  await page.click(".compare-prev >> text=更短"); // finish
  await page.click("text=说不上来"); // quality
  await expect(page.locator(".tasting-note .compare-line")).toHaveText(
    "和上一款比：香气差不多，甜度差不多，酸度更高，单宁更低，酒体差不多，酒精差不多，余味更短",
  );
  await page.click(".depth-tabs >> text=进阶");
  await expect(page.locator('.choice[aria-label="单宁"] button.on')).toHaveText("中高");
});
