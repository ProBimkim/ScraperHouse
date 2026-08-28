import puppeteer from 'puppeteer';
import connectToDatabase from './mongodb';
import ScrapeResult from '../models/ScrapeResult';
import GlobalErrorLog from '../models/GlobalErrorLog';

function extractQuestions(formJson) {
  const questions = formJson.questions || formJson.Questions || [];
  const normalized = [];
  
  for (const q of questions) {
    let title = q.titleFormat || q.title || q.Title || "";
    if (typeof title === 'object' && title !== null) {
      title = title.content || "";
    }

    const qtype = q.questionType || q.QuestionType || q.type || "unknown";
    const required = Boolean(q.required || q.Required || q.isRequired);

    const choices = [];
    const rawChoices = q.choices || q.Choices || [];
    for (const c of rawChoices) {
      if (typeof c === 'object' && c !== null) {
        const text = c.displayText || c.description || c.Description || c.value;
        if (text) choices.push(text);
      } else {
        choices.push(String(c));
      }
    }

    normalized.push({
      id: q.id || q.Id,
      title,
      type: qtype,
      required,
      choices
    });
  }
  return normalized;
}

export async function runScraper(url, slug) {
  await connectToDatabase();
  
  const resultDoc = await ScrapeResult.create({
    slug,
    url,
    status: 'processing'
  });

  const errors = [];
  const logError = async (type, message, stack, step) => {
    errors.push({ type, message, stack, step });
    await GlobalErrorLog.create({
      scrapeResultId: resultDoc._id,
      url,
      errors: [{ type, message, stack, step }]
    });
  };

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    let foundApiData = null;
    let foundApiUrl = null;

    // Listen to network responses
    page.on('response', async (response) => {
      const respUrl = response.url();
      if (respUrl.includes('formapi/api') && respUrl.includes('runtimeForms') && response.request().method() === 'GET') {
        try {
          const json = await response.json();
          foundApiData = json;
          foundApiUrl = respUrl;
        } catch (err) {
          // Ignore non-json responses or aborted responses
        }
      }
    });

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Wait a bit more to ensure API calls are finished if not caught yet
    if (!foundApiData) {
      await new Promise(r => setTimeout(r, 5000));
    }

    if (!foundApiData) {
      throw new Error("Could not intercept the form API response (prefetchFormUrl) after waiting.");
    }

    const title = foundApiData.title || foundApiData.Title;
    const description = foundApiData.description || foundApiData.Description;
    const questions = extractQuestions(foundApiData);

    resultDoc.apiUrl = foundApiUrl;
    resultDoc.title = title;
    resultDoc.description = description;
    resultDoc.jumlah_pertanyaan = questions.length;
    resultDoc.questions = questions;
    resultDoc.status = 'success';

  } catch (err) {
    await logError('ScrapingError', err.message, err.stack, 'running_puppeteer');
    resultDoc.status = 'failed';
    resultDoc.errors.push({ message: err.message, stack: err.stack });
  } finally {
    if (browser) await browser.close();
    await resultDoc.save();
  }

  return resultDoc;
}
