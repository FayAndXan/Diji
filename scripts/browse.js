// Simple Playwright browser scraper for Bryan
// Usage: NODE_PATH=/usr/lib/node_modules node browse.js --url "https://example.com"
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const urlIdx = args.indexOf('--url');
const url = urlIdx !== -1 ? args[urlIdx + 1] : null;

if (!url) {
  console.error('Usage: node browse.js --url "https://example.com"');
  process.exit(1);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2000);
    const text = await page.evaluate(() => document.body.innerText);
    // Limit output to 10000 chars
    console.log(JSON.stringify({ url, content: text.substring(0, 10000) }));
  } catch (e) {
    console.error(JSON.stringify({ url, error: e.message }));
  } finally {
    await browser.close();
  }
})();
