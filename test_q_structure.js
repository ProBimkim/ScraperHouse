import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  
  page.on('response', async (res) => {
    if (res.url().includes('runtimeForms') && res.request().method() === 'GET') {
      try {
        const json = await res.json();
        const questions = json.questions || json.Questions || [];
        if (questions.length > 0) {
           console.log('Question 1 JSON:', JSON.stringify(questions[0], null, 2));
           process.exit(0);
        }
      } catch (e) {
      }
    }
  });

  await page.goto('https://forms.cloud.microsoft/r/JQF2zmfDWX', { waitUntil: 'networkidle2' });
  const buttons = await page.$$('button');
  for (const btn of buttons) {
    const text = await page.evaluate(el => el.innerText, btn);
    if (text && text.toLowerCase().includes('start')) {
      await btn.click();
      await new Promise(r => setTimeout(r, 5000));
      break;
    }
  }

  await browser.close();
})();
