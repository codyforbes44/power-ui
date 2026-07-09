'use strict';

// Regression guard for the public-site meta pass: every marketing page must
// have a favicon and an og:image that actually resolves to a real image,
// not just a meta tag that looks right in the source. Before this pass, no
// public page had a favicon at all, and only the homepage had og:title —
// this would have caught both gaps immediately.

const { test, expect } = require('./fixtures');

const PAGES = ['index.html', 'pricing.html', 'features.html', 'getting-started.html', 'about.html', 'privacy.html', 'terms.html', '404.html'];

for (const p of PAGES) {
  test(`${p}: favicon + og:image resolve to a real 200 image`, async ({ page }) => {
    const consoleErrors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

    await page.goto(`/public/${p}`);
    const ogImage = await page.locator('meta[property="og:image"]').getAttribute('content');
    const resolved = new URL(ogImage, page.url()).href;
    const res = await page.request.get(resolved);
    expect(res.status(), `${p} og:image at ${resolved}`).toBe(200);
    expect(res.headers()['content-type']).toContain('image/png');

    const faviconHref = await page.locator('link[rel="icon"]').getAttribute('href');
    expect(faviconHref).toContain('data:image/svg+xml');

    expect(consoleErrors, `console errors on ${p}`).toEqual([]);
  });
}
