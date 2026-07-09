#!/usr/bin/env node
'use strict';

// Renders tools/og-image/template.html to a real PNG via a headless
// browser (Playwright's own chromium — already a project dependency for
// the E2E suite, so this needs nothing extra installed) rather than
// fabricating an image by other means. Standard approach for OG/social
// card images: real CSS/fonts/gradients rendered exactly as a browser
// would show them, at the 1200×630 size platforms expect.
//
// Usage: node tools/og-image/generate.js
// Re-run this any time public/css/public.css's brand tokens change —
// template.html's :root block is a deliberate copy of them (see its
// header comment), not a shared import, so keep the two in sync by hand.

const path = require('node:path');
const { chromium } = require('@playwright/test');

const TEMPLATE = path.join(__dirname, 'template.html');
const OUTPUT = path.join(__dirname, '..', '..', 'public', 'images', 'og-image.png');
const WIDTH = 1200;
const HEIGHT = 630;

async function main() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: WIDTH, height: HEIGHT },
      deviceScaleFactor: 2, // render crisp, then downscale — sharper gradient/text edges than a 1x capture
    });
    await page.goto(`file://${TEMPLATE}`);
    await page.evaluate(() => document.fonts.ready); // wait for Outfit/Inter to actually be painted, not fall back to a system font
    await page.screenshot({ path: OUTPUT, clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
    console.log(`Wrote ${path.relative(process.cwd(), OUTPUT)}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
