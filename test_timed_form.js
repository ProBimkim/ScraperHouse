import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  
  page.on('response', async (res) => {
    if (res.url().includes('runtimeForms') && res.request().method() === 'GET') {
      console.log('Intercepted:', res.url());
      try {
        const json = await res.json();
        console.log('Title:', json.title || json.Title);
        const questions = json.questions || json.Questions || [];
        console.log('Questions length:', questions.length);
      } catch (e) {
        console.error('Error parsing JSON:', e.message);
      }
    }
  });

  console.log('Navigating...');
  await page.goto('https://forms.cloud.microsoft/r/JQF2zmfDWX', { waitUntil: 'networkidle2' });
  
  console.log('Checking for start button...');
  // check if there's a button to click
  const buttons = await page.$$('button');
  for (const btn of buttons) {
    const text = await page.evaluate(el => el.innerText, btn);
    if (text && text.toLowerCase().includes('start')) {
      console.log('Found start button, clicking...');
      await btn.click();
      await new Promise(r => setTimeout(r, 5000));
      break;
    }
  }

  await browser.close();
})();
