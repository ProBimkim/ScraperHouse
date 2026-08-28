import puppeteer from 'puppeteer';
import connectToDatabase from './mongodb';
import ScrapeResult from '../models/ScrapeResult';
import GlobalErrorLog from '../models/GlobalErrorLog';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
};

const PREFETCH_URL_PATTERN = /"prefetchFormUrl"\s*:\s*"([^"]+)"/;

/**
 * Unescape a URL that was JSON-escaped inside HTML (e.g. \u0027 for single quote).
 */
function unescapeUrl(raw) {
  return JSON.parse(`"${raw}"`);
}

function extractQuestions(formJson) {
  const questions = formJson.questions || formJson.Questions || [];
  const normalized = [];

  for (const q of questions) {
    let title = q.titleFormat || q.title || q.Title || '';
    if (typeof title === 'object' && title !== null) {
      title = title.content || '';
    }

    const qtype = q.questionType || q.QuestionType || q.type || 'unknown';
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
      choices,
    });
  }
  return normalized;
}

/**
 * Strategy 1: Use Puppeteer to open the form page and intercept the API response.
 * This is the most reliable approach because the real browser handles all
 * anti-forgery tokens, cookies, and headers automatically.
 */
async function scrapeWithPuppeteer(url) {
  const steps = [];
  let browser;

  try {
    steps.push({ step: 'launch_browser', status: 'starting' });
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });
    steps.push({ step: 'launch_browser', status: 'ok' });

    const page = await browser.newPage();
    await page.setUserAgent(HEADERS['User-Agent']);

    let foundApiData = null;
    let foundApiUrl = null;

    // Intercept network responses to catch the form API call
    page.on('response', async (response) => {
      const respUrl = response.url();
      if (
        respUrl.includes('formapi/api') &&
        respUrl.includes('runtimeForms') &&
        response.request().method() === 'GET'
      ) {
        try {
          const json = await response.json();
          foundApiData = json;
          foundApiUrl = respUrl;
        } catch {
          // non-JSON response, ignore
        }
      }
    });

    steps.push({ step: 'navigate', status: 'starting', url });
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
    steps.push({ step: 'navigate', status: 'ok' });

    // If not intercepted yet, wait up to 10s more
    if (!foundApiData) {
      steps.push({ step: 'wait_for_api', status: 'waiting' });
      for (let i = 0; i < 20 && !foundApiData; i++) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    // Fallback: extract prefetchFormUrl from HTML and fetch manually
    if (!foundApiData) {
      steps.push({ step: 'fallback_html_extract', status: 'starting' });
      const html = await page.content();
      const match = PREFETCH_URL_PATTERN.exec(html);
      if (match) {
        const apiUrl = unescapeUrl(match[1]);
        steps.push({ step: 'fallback_fetch_api', status: 'starting', apiUrl });

        // Fetch with cookies from browser session
        const cookies = await page.cookies();
        const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');

        const resp = await fetch(apiUrl, {
          headers: {
            ...HEADERS,
            Referer: url,
            Cookie: cookieHeader,
          },
        });

        if (resp.ok) {
          foundApiData = await resp.json();
          foundApiUrl = apiUrl;
          steps.push({ step: 'fallback_fetch_api', status: 'ok' });
        } else {
          steps.push({
            step: 'fallback_fetch_api',
            status: 'failed',
            httpStatus: resp.status,
          });
        }
      } else {
        steps.push({ step: 'fallback_html_extract', status: 'no_prefetchFormUrl_found' });
      }
    }

    await browser.close();
    browser = null;

    if (!foundApiData) {
      return {
        success: false,
        steps,
        error: 'Could not retrieve form data via browser intercept or HTML fallback.',
      };
    }

    const title = foundApiData.title || foundApiData.Title;
    const description = foundApiData.description || foundApiData.Description;
    const questions = extractQuestions(foundApiData);

    return {
      success: true,
      steps,
      apiUrl: foundApiUrl,
      title,
      description,
      questions,
      rawKeys: Object.keys(foundApiData),
    };
  } catch (err) {
    steps.push({ step: 'error', message: err.message, stack: err.stack });
    return { success: false, steps, error: err.message, stack: err.stack };
  } finally {
    if (browser) await browser.close();
  }
}

/**
 * Strategy 2: Pure fetch fallback (no Puppeteer).
 * Fetch the HTML page, regex-extract prefetchFormUrl, then call it directly.
 */
async function scrapeWithFetch(url) {
  const steps = [];

  try {
    steps.push({ step: 'fetch_html', status: 'starting' });
    const htmlResp = await fetch(url, {
      headers: HEADERS,
      redirect: 'follow',
    });
    if (!htmlResp.ok) {
      steps.push({ step: 'fetch_html', status: 'failed', httpStatus: htmlResp.status });
      return { success: false, steps, error: `Failed to fetch HTML: ${htmlResp.status}` };
    }
    const html = await htmlResp.text();
    steps.push({ step: 'fetch_html', status: 'ok', length: html.length });

    const match = PREFETCH_URL_PATTERN.exec(html);
    if (!match) {
      steps.push({ step: 'extract_api_url', status: 'not_found' });
      return {
        success: false,
        steps,
        error: 'prefetchFormUrl not found in HTML. Form may require login.',
      };
    }

    const apiUrl = unescapeUrl(match[1]);
    steps.push({ step: 'extract_api_url', status: 'ok', apiUrl });

    steps.push({ step: 'fetch_api', status: 'starting' });
    const apiResp = await fetch(apiUrl, {
      headers: {
        ...HEADERS,
        Referer: url,
        Accept: 'application/json',
      },
    });

    if (!apiResp.ok) {
      steps.push({ step: 'fetch_api', status: 'failed', httpStatus: apiResp.status });
      return { success: false, steps, error: `API returned status ${apiResp.status}` };
    }

    const formJson = await apiResp.json();
    steps.push({ step: 'fetch_api', status: 'ok' });

    const title = formJson.title || formJson.Title;
    const description = formJson.description || formJson.Description;
    const questions = extractQuestions(formJson);

    return {
      success: true,
      steps,
      apiUrl,
      title,
      description,
      questions,
      rawKeys: Object.keys(formJson),
    };
  } catch (err) {
    steps.push({ step: 'error', message: err.message, stack: err.stack });
    return { success: false, steps, error: err.message, stack: err.stack };
  }
}

/**
 * Main entry point: tries Puppeteer first, then falls back to pure fetch.
 */
export async function runScraper(url, slug) {
  await connectToDatabase();

  const resultDoc = await ScrapeResult.create({
    slug,
    url,
    status: 'processing',
  });

  // Try Puppeteer first
  let result = await scrapeWithPuppeteer(url);

  // If Puppeteer failed (e.g. Chromium not available), try pure fetch
  if (!result.success) {
    const puppeteerErrors = result.steps || [];
    const fetchResult = await scrapeWithFetch(url);

    if (fetchResult.success) {
      result = fetchResult;
      result.steps = [...puppeteerErrors, { step: 'fallback_to_fetch', status: 'ok' }, ...fetchResult.steps];
    } else {
      // Both failed — log all errors
      result.steps = [...puppeteerErrors, { step: 'fallback_to_fetch', status: 'failed' }, ...fetchResult.steps];
    }
  }

  if (result.success) {
    resultDoc.apiUrl = result.apiUrl;
    resultDoc.title = result.title;
    resultDoc.description = result.description;
    resultDoc.jumlah_pertanyaan = result.questions.length;
    resultDoc.questions = result.questions;
    resultDoc.status = result.questions.length > 0 ? 'success' : 'partial';
    resultDoc.scrapeSteps = result.steps;
  } else {
    resultDoc.status = 'failed';
    resultDoc.scrapeSteps = result.steps;
    resultDoc.errors.push({
      message: result.error || 'Unknown scraping error',
      stack: result.stack || '',
    });

    // Also create a GlobalErrorLog entry
    await GlobalErrorLog.create({
      scrapeResultId: resultDoc._id,
      url,
      slug,
      errors: result.steps
        .filter((s) => s.status === 'failed' || s.step === 'error')
        .map((s) => ({
          type: 'ScrapingError',
          message: s.message || s.error || `Step "${s.step}" failed (HTTP ${s.httpStatus || '?'})`,
          stack: s.stack || '',
          step: s.step,
        })),
    });
  }

  await resultDoc.save();
  return resultDoc;
}
