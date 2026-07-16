const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.on('response', response => {
    if (response.status() >= 400) {
      console.log('HTTP Error:', response.status(), response.url());
    }
  });
  await page.goto('http://localhost:5174/login');
  await page.waitForSelector('input[type="email"]');
  await page.type('input[type="email"]', 'cliente1@gebo.com');
  await page.type('input[type="password"]', 'gebo123');
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Entrar'));
    btn.click();
  });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: 'frontend/test_login.png' });
  await browser.close();
})();
