const fs = require('fs');
let code = fs.readFileSync('tests/e2e/fixtures.js', 'utf8');
code = code.replace(/const dismiss = page\.locator\('#onboarding-dismiss'\);\n\s*if \(await dismiss\.isVisible\(\)\) \{\n\s*await dismiss\.click\(\);\n\s*await page\.waitForTimeout\(300\);\n\s*\}/, `await page.evaluate(() => {
    const el = document.getElementById('onboarding-overlay');
    if (el) el.remove();
  });`);
fs.writeFileSync('tests/e2e/fixtures.js', code);
