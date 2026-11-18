// After a deploy: the site answers, and runs the version just deployed.
const origin = process.env.SITE_ORIGIN;
for (let i = 0; i < 18; i++) {
  try {
    const res = await fetch(`${origin}/api/health`);
    const page = await fetch(`${origin}/`);
    if (res.ok && page.ok && (await page.text()).includes('id="app"')) {
      console.log(await res.text());
      process.exit(0);
    }
  } catch {
    // a new domain's certificate takes a while
  }
  await new Promise((r) => setTimeout(r, 10_000));
}
console.error(`${origin} did not come up`);
process.exit(1);
