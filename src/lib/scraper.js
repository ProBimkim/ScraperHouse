import connectToDatabase from './mongodb';
import ScrapeResult from '../models/ScrapeResult';
import GlobalErrorLog from '../models/GlobalErrorLog';
import chromium from '@sparticuz/chromium-min';
import puppeteerCore from 'puppeteer-core';
import { HttpsProxyAgent } from 'https-proxy-agent';

// --- Proxy Configuration ---
// Set PROXY_LIST di Vercel env vars, pisahkan dengan koma (,)
// Contoh: http://user:pass@ip1:port,http://user:pass@ip2:port
const PROXY_LIST_ENV = process.env.PROXY_LIST || process.env.PROXY_URL || '';
const PROXIES = PROXY_LIST_ENV.split(',').map(p => p.trim()).filter(p => p.length > 0);

function getRandomProxy() {
  if (PROXIES.length === 0) return null;
  return PROXIES[Math.floor(Math.random() * PROXIES.length)];
}

// --- User-Agent Rotation ---
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
];

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function getHeaders() {
  return {
    'User-Agent': getRandomUserAgent(),
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
  };
}

/**
 * Returns fetch options with proxy agent if a proxy is available.
 */
function getProxyFetchOptions(activeProxy) {
  if (!activeProxy) return {};
  return { agent: new HttpsProxyAgent(activeProxy) };
}

const PREFETCH_URL_PATTERN = /"prefetchFormUrl"\s*:\s*"([^"]+)"/;
const TOKEN_PATTERN = /name="__RequestVerificationToken"[^>]*value="([^"]+)"/;
const CORRELATION_ID_PATTERN = /"correlationId"\s*:\s*"([^"]+)"/i;
const SESSION_ID_PATTERN = /"sessionId"\s*:\s*"([^"]+)"/i;

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
    let rawChoices = q.choices || q.Choices || [];
    
    // Sometimes choices are in a stringified questionInfo JSON
    if (rawChoices.length === 0 && q.questionInfo) {
      try {
        const parsedInfo = JSON.parse(q.questionInfo);
        rawChoices = parsedInfo.Choices || parsedInfo.choices || [];
      } catch (e) {
        // ignore JSON parse error
      }
    }

    for (const c of rawChoices) {
      if (typeof c === 'object' && c !== null) {
        const text = c.displayText || c.description || c.Description || c.value || '';
        
        // Find image if present
        let optImageUrl = null;
        if (c.image && c.image.resourceUrl) {
          optImageUrl = c.image.resourceUrl;
        } else if (c.imageInfo && c.imageInfo.resourceUrl) {
          optImageUrl = c.imageInfo.resourceUrl;
        } else if (c.ChoiceImage && c.ChoiceImage.resourceUrl) {
          optImageUrl = c.ChoiceImage.resourceUrl;
        }
        
        if (text || optImageUrl) {
          choices.push({ text: String(text), imageUrl: optImageUrl });
        }
      } else {
        choices.push({ text: String(c), imageUrl: null });
      }
    }

    // Extract image if present
    let imageUrl = null;
    if (q.image && q.image.resourceUrl) {
      imageUrl = q.image.resourceUrl;
    } else if (q.QuestionImage && q.QuestionImage.resourceUrl) {
      imageUrl = q.QuestionImage.resourceUrl;
    }

    normalized.push({
      id: q.id || q.Id,
      title,
      type: qtype,
      required,
      choices,
      imageUrl,
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
  const headers = getHeaders();

  try {
    const activeProxy = getRandomProxy();
    steps.push({ step: 'launch_browser', status: 'starting', proxy: !!activeProxy });

    const isProd = process.env.NODE_ENV === 'production';

    // Build proxy args for Puppeteer
    const proxyArgs = [];
    let proxyAuth = null;
    if (activeProxy) {
      try {
        const proxyUrl = new URL(activeProxy);
        const proxyServer = `${proxyUrl.hostname}:${proxyUrl.port}`;
        proxyArgs.push(`--proxy-server=${proxyServer}`);
        if (proxyUrl.username) {
          proxyAuth = {
            username: decodeURIComponent(proxyUrl.username),
            password: decodeURIComponent(proxyUrl.password || ''),
          };
        }
      } catch (e) {
        steps.push({ step: 'proxy_parse', status: 'failed', message: e.message });
      }
    }

    if (isProd) {
      const executablePath = await chromium.executablePath(
        'https://github.com/Sparticuz/chromium/releases/download/v121.0.0/chromium-v121.0.0-pack.tar'
      );
      browser = await puppeteerCore.launch({
        args: [...chromium.args, ...proxyArgs],
        defaultViewport: chromium.defaultViewport,
        executablePath,
        headless: chromium.headless,
      });
    } else {
      const puppeteer = (await import('puppeteer')).default;
      browser = await puppeteer.launch({
        headless: 'new',
        args: proxyArgs,
      });
    }

    steps.push({ step: 'launch_browser', status: 'ok' });

    const page = await browser.newPage();

    // Authenticate proxy if credentials exist
    if (proxyAuth) {
      await page.authenticate(proxyAuth);
      steps.push({ step: 'proxy_auth', status: 'ok' });
    }

    await page.setUserAgent(headers['User-Agent']);

    let foundApiData = null;
    let foundApiUrl = null;

    // Intercept network responses to catch the form API call
    page.on('response', async (response) => {
      const respUrl = response.url();
      if (
        respUrl.includes('formapi/api') &&
        (respUrl.includes('runtimeForms') || respUrl.includes('runtimeFormsWithResponses')) &&
        response.request().method() === 'GET'
      ) {
        try {
          const json = await response.json();
          // We only want the response that actually contains the questions, 
          // or if we haven't found any yet. Timed forms might return an empty one first.
          const qList = json.questions || json.Questions || [];
          if (!foundApiData || qList.length > 0) {
            foundApiData = json;
            foundApiUrl = respUrl;
          }
        } catch {
          // non-JSON response, ignore
        }
      }
    });

    steps.push({ step: 'navigate', status: 'starting', url });
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
    steps.push({ step: 'navigate', status: 'ok' });

    // Handle timed forms: click "Start" if present and questions are empty
    const currentQList = foundApiData ? (foundApiData.questions || foundApiData.Questions || []) : [];
    let hasQuestions = currentQList.length > 0;
    
    if (!hasQuestions) {
      steps.push({ step: 'check_timed_form', status: 'starting' });
      const buttons = await page.$$('button, [role="button"]');
      let clickedStart = false;
      for (const btn of buttons) {
        const text = await page.evaluate((el) => el.innerText || el.textContent, btn);
        if (text && text.toLowerCase().includes('start')) {
          steps.push({ step: 'check_timed_form', status: 'found_start_button', text });
          await btn.click();
          clickedStart = true;
          // Wait for the next API call which will contain the questions
          await new Promise((r) => setTimeout(r, 4000));
          break;
        }
      }
      if (!clickedStart) {
        steps.push({ step: 'check_timed_form', status: 'no_start_button' });
      }
    }

    // If not intercepted yet, wait up to 10s more
    let finalQList = foundApiData ? (foundApiData.questions || foundApiData.Questions || []) : [];
    if (!foundApiData || (!hasQuestions && finalQList.length === 0)) {
      steps.push({ step: 'wait_for_api', status: 'waiting' });
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 500));
        finalQList = foundApiData ? (foundApiData.questions || foundApiData.Questions || []) : [];
        if (finalQList.length > 0) break;
      }
    }

    // Fallback: extract prefetchFormUrl from HTML and fetch manually
    if (!foundApiData || finalQList.length === 0) {
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
          ...getProxyFetchOptions(activeProxy),
          headers: {
            ...headers,
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
      rawApiResponse: foundApiData,
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
  const headers = getHeaders();
  const activeProxy = getRandomProxy();

  try {
    steps.push({ step: 'fetch_html', status: 'starting', proxy: !!activeProxy });
    const htmlResp = await fetch(url, {
      ...getProxyFetchOptions(activeProxy),
      headers,
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

    // Extract tokens
    const tokenMatch = TOKEN_PATTERN.exec(html);
    const correlationMatch = CORRELATION_ID_PATTERN.exec(html);
    const sessionMatch = SESSION_ID_PATTERN.exec(html);

    const token = tokenMatch ? tokenMatch[1] : '';
    const correlationId = correlationMatch ? correlationMatch[1] : '';
    const sessionId = sessionMatch ? sessionMatch[1] : '';

    steps.push({ 
      step: 'extract_tokens', 
      status: 'ok', 
      foundToken: !!token, 
      foundCorrelation: !!correlationId, 
      foundSession: !!sessionId 
    });

    steps.push({ step: 'fetch_api', status: 'starting' });
    const apiHeaders = {
      ...headers,
      Referer: url,
      Accept: 'application/json',
      Origin: 'https://forms.cloud.microsoft'
    };

    if (token) apiHeaders['__RequestVerificationToken'] = token;
    if (correlationId) apiHeaders['X-CorrelationId'] = correlationId;
    if (sessionId) apiHeaders['X-UserSessionId'] = sessionId;

    const apiResp = await fetch(apiUrl, {
      ...getProxyFetchOptions(activeProxy),
      headers: apiHeaders,
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
      rawApiResponse: formJson,
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

  // Try pure fetch first (fastest)
  let result = await scrapeWithFetch(url);

  // If pure fetch failed or returned 0 questions (e.g. timed form), fallback to Puppeteer
  if (!result.success || !result.questions || result.questions.length === 0) {
    const fetchErrors = result.steps || [];
    const puppeteerResult = await scrapeWithPuppeteer(url);

    if (puppeteerResult.success && puppeteerResult.questions && puppeteerResult.questions.length > 0) {
      result = puppeteerResult;
      result.steps = [...fetchErrors, { step: 'fallback_to_puppeteer', status: 'ok' }, ...puppeteerResult.steps];
    } else {
      // Both failed — log all errors
      result.steps = [...fetchErrors, { step: 'fallback_to_puppeteer', status: 'failed' }, ...(puppeteerResult.steps || [])];
    }
  }

  if (result.success && result.questions && result.questions.length > 0) {
    resultDoc.apiUrl = result.apiUrl;
    resultDoc.title = result.title;
    resultDoc.description = result.description;
    resultDoc.jumlah_pertanyaan = result.questions.length;
    resultDoc.questions = result.questions;
    resultDoc.rawApiResponse = result.rawApiResponse;
    resultDoc.status = 'success';
    resultDoc.scrapeSteps = result.steps;
  } else {
    resultDoc.status = 'failed';
    resultDoc.scrapeSteps = result.steps;
    resultDoc.errors.push({
      message: result.error || 'Unknown scraping error',
      stack: result.stack || '',
    });

    // Save to global error log for monitoring
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
