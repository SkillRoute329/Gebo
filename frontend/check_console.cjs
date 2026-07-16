const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));

  try {
    await page.goto('http://localhost:5174/chofer', { waitUntil: 'networkidle0', timeout: 10000 });
  } catch (e) {
    console.log("Navigation error", e.message);
  }
  
  await browser.close();
})();
