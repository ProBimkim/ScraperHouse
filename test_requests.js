import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  
  page.on('request', req => {
    if (req.url().includes('formapi/api')) {
      console.log('->', req.method(), req.url());
    }
  });

  await page.goto('https://forms.cloud.microsoft/r/JQF2zmfDWX', { waitUntil: 'networkidle2' });
  const buttons = await page.$$('button');
  for (const btn of buttons) {
    const text = await page.evaluate(el => el.innerText, btn);
    if (text && text.toLowerCase().includes('start')) {
      console.log('Clicking start...');
      await btn.click();
      await new Promise(r => setTimeout(r, 5000));
      break;
    }
  }

  await browser.close();
})();
