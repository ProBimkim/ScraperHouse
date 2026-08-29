import connectToDatabase from './mongodb';
import QuizizzResult from '../models/QuizizzResult';
import GlobalErrorLog from '../models/GlobalErrorLog';
import chromium from '@sparticuz/chromium-min';
import puppeteerCore from 'puppeteer-core';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
};

// Extracts and normalizes questions from Quizizz API JSON
function extractQuizizzQuestions(quizData) {
  const questions = quizData.info?.questions || quizData.questions || [];
  const normalized = [];

  for (const q of questions) {
    const type = q.type || 'unknown';
    
    // Teks pertanyaan
    let title = '';
    if (q.structure?.query?.text) {
      title = q.structure.query.text.replace(/<[^>]*>?/gm, ''); // hapus HTML tags
    }

    // Gambar pertanyaan
    let imageUrl = null;
    if (q.structure?.query?.media?.length > 0) {
      const media = q.structure.query.media.find(m => m.type === 'image');
      if (media && media.url) imageUrl = media.url;
    }

    const choices = [];
    let correctAnswerText = null;

    // Untuk MCQ (Multiple Choice) atau MSQ (Multiple Select)
    if (type === 'MCQ' || type === 'MSQ') {
      const options = q.structure?.options || [];
      const answerInfo = q.structure?.answer; // biasanya index atau array of index

      let correctIndexes = [];
      if (answerInfo !== undefined) {
        if (Array.isArray(answerInfo)) {
          correctIndexes = answerInfo; // MSQ
        } else if (typeof answerInfo === 'number') {
          correctIndexes = [answerInfo]; // MCQ
        }
      }

      options.forEach((opt, idx) => {
        let text = opt.text ? opt.text.replace(/<[^>]*>?/gm, '') : '';
        let hasImage = false;
        let optImageUrl = null;
        
        if (opt.media?.length > 0) {
          const m = opt.media.find(x => x.type === 'image');
          if (m && m.url) {
            hasImage = true;
            optImageUrl = m.url;
          }
        }
        
        const isCorrect = correctIndexes.includes(idx) || correctIndexes.includes(idx.toString());
        choices.push({ text, isCorrect, hasImage, imageUrl: optImageUrl });
      });
    } 
    // Untuk Fill in the Blank
    else if (type === 'BLANK' || type === 'FIB') {
      if (Array.isArray(q.structure?.options)) {
        correctAnswerText = q.structure.options.map(o => o.text).join(' / ');
      }
    }

    let explanation = '';
    if (q.structure?.explain?.text) {
      explanation = q.structure.explain.text.replace(/<[^>]*>?/gm, '');
    }

    normalized.push({
      id: q._id || q.id,
      title,
      type,
      imageUrl,
      choices,
      correctAnswer: correctAnswerText,
      explanation,
    });
  }

  return normalized;
}

async function scrapeQuizByUrl(url) {
  const steps = [];
  let browser;

  try {
    steps.push({ step: 'launch_browser', status: 'starting' });

    const isProd = process.env.NODE_ENV === 'production';
    if (isProd) {
      const executablePath = await chromium.executablePath(
        'https://github.com/Sparticuz/chromium/releases/download/v121.0.0/chromium-v121.0.0-pack.tar'
      );
      browser = await puppeteerCore.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath,
        headless: chromium.headless,
      });
    } else {
      const puppeteer = (await import('puppeteer')).default;
      browser = await puppeteer.launch({ headless: 'new' });
    }
    steps.push({ step: 'launch_browser', status: 'ok' });

    const page = await browser.newPage();
    await page.setUserAgent(HEADERS['User-Agent']);

    let foundApiData = null;
    let foundApiUrl = null;

    // Listen to network responses to catch quiz data
    page.on('response', async (response) => {
      try {
        if (response.headers()['content-type']?.includes('application/json')) {
          const json = await response.json();
          if (json.data?.quiz?.info?.questions) { foundApiData = json.data.quiz; foundApiUrl = response.url(); }
          else if (json.data?.quiz?.questions) { foundApiData = json.data.quiz; foundApiUrl = response.url(); }
          else if (json.info?.questions) { foundApiData = json; foundApiUrl = response.url(); }
          else if (json.questions) { foundApiData = json; foundApiUrl = response.url(); }
          else if (json.room?.questions) { foundApiData = json.room; foundApiUrl = response.url(); }
        }
      } catch (e) {
        // ignore non-json
      }
    });

    steps.push({ step: 'navigate_url', status: 'starting', url });
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
    steps.push({ step: 'navigate_url', status: 'ok' });

    // Wait if data hasn't been intercepted
    if (!foundApiData) {
      steps.push({ step: 'wait_for_api', status: 'waiting' });
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 500));
        if (foundApiData) break;
      }
    }

    // Try fallback to search in __NUXT__ or window objects if api intercept failed
    if (!foundApiData) {
      steps.push({ step: 'fallback_dom_extract', status: 'starting' });
      const windowData = await page.evaluate(() => {
        if (window.__NUXT__?.state?.quiz) return window.__NUXT__.state.quiz;
        if (window.quizData) return window.quizData;
        return null;
      });
      if (windowData) {
        foundApiData = windowData;
        steps.push({ step: 'fallback_dom_extract', status: 'ok' });
      } else {
        steps.push({ step: 'fallback_dom_extract', status: 'failed' });
      }
    }

    await browser.close();
    browser = null;

    if (!foundApiData) {
      return { success: false, steps, error: 'Could not intercept or extract quiz data from the page.' };
    }

    const title = foundApiData.info?.name || foundApiData.name || 'Unknown Quizizz';
    const description = foundApiData.info?.description || foundApiData.description || '';
    const subject = foundApiData.info?.subjects?.join(', ') || foundApiData.subjects?.join(', ') || '';
    const questions = extractQuizizzQuestions(foundApiData);

    return {
      success: true,
      steps,
      apiUrl: foundApiUrl,
      title,
      description,
      subject,
      questions,
      rawApiResponse: foundApiData,
    };
  } catch (err) {
    steps.push({ step: 'error', message: err.message, stack: err.stack });
    return { success: false, steps, error: err.message, stack: err.stack };
  } finally {
    if (browser) await browser.close();
  }
}

async function scrapeQuizByJoinCode(joinCode) {
  const steps = [];
  let browser;

  try {
    steps.push({ step: 'launch_browser', status: 'starting' });

    const isProd = process.env.NODE_ENV === 'production';
    if (isProd) {
      const executablePath = await chromium.executablePath(
        'https://github.com/Sparticuz/chromium/releases/download/v121.0.0/chromium-v121.0.0-pack.tar'
      );
      browser = await puppeteerCore.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath,
        headless: chromium.headless,
      });
    } else {
      const puppeteer = (await import('puppeteer')).default;
      browser = await puppeteer.launch({ headless: 'new' });
    }
    steps.push({ step: 'launch_browser', status: 'ok' });

    const page = await browser.newPage();
    await page.setUserAgent(HEADERS['User-Agent']);

    let foundApiData = null;
    let foundApiUrl = null;

    page.on('response', async (response) => {
      try {
        if (response.headers()['content-type']?.includes('application/json')) {
          const json = await response.json();
          if (json.room?.questions) { foundApiData = json.room; foundApiUrl = response.url(); }
          else if (json.game?.questions) { foundApiData = json.game; foundApiUrl = response.url(); }
          else if (json.data?.room?.questions) { foundApiData = json.data.room; foundApiUrl = response.url(); }
          else if (json.data?.quiz?.info?.questions) { foundApiData = json.data.quiz; foundApiUrl = response.url(); }
          else if (json.info?.questions) { foundApiData = json; foundApiUrl = response.url(); }
          else if (json.questions) { foundApiData = json; foundApiUrl = response.url(); }
        }
      } catch (e) {}
    });

    const url = `https://quizizz.com/join?gc=${joinCode}`;
    steps.push({ step: 'navigate_joincode', status: 'starting', url });
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
    steps.push({ step: 'navigate_joincode', status: 'ok' });

    // In some cases we might need to click "Join" or wait for a specific socket
    // We'll wait up to 10s for API data
    if (!foundApiData) {
      steps.push({ step: 'wait_for_api', status: 'waiting' });
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 500));
        if (foundApiData) break;
      }
    }
    
    // For join codes, if no intercept, it might require user interaction (enter name)
    // We try to fill in a random name and join if asked
    if (!foundApiData) {
      steps.push({ step: 'attempt_join', status: 'starting' });
      const nameInput = await page.$('input[placeholder*="name"], input[name="username"]');
      if (nameInput) {
        await nameInput.type(`Student${Math.floor(Math.random() * 1000)}`);
        await page.keyboard.press('Enter');
        steps.push({ step: 'attempt_join', status: 'submitted_name' });
        
        for (let i = 0; i < 10; i++) {
          await new Promise((r) => setTimeout(r, 500));
          if (foundApiData) break;
        }
      }
    }

    await browser.close();
    browser = null;

    if (!foundApiData) {
      return { success: false, steps, error: 'Could not intercept game data for join code. The game might not exist, might not be active, or requires authentication.' };
    }

    const title = foundApiData.info?.name || foundApiData.name || 'Unknown Quizizz Game';
    const description = foundApiData.info?.description || foundApiData.description || '';
    const subject = foundApiData.info?.subjects?.join(', ') || foundApiData.subjects?.join(', ') || '';
    const questions = extractQuizizzQuestions(foundApiData);

    return {
      success: true,
      steps,
      apiUrl: foundApiUrl,
      title,
      description,
      subject,
      questions,
      rawApiResponse: foundApiData,
    };
  } catch (err) {
    steps.push({ step: 'error', message: err.message, stack: err.stack });
    return { success: false, steps, error: err.message, stack: err.stack };
  } finally {
    if (browser) await browser.close();
  }
}

export async function runQuizizzScraper(input, inputType, slug) {
  await connectToDatabase();

  const resultDoc = await QuizizzResult.create({
    slug,
    inputType,
    inputValue: input,
    status: 'processing',
  });

  let result;
  if (inputType === 'url') {
    result = await scrapeQuizByUrl(input);
  } else if (inputType === 'joinCode') {
    result = await scrapeQuizByJoinCode(input);
  } else {
    result = { success: false, steps: [], error: 'Invalid inputType' };
  }

  if (result.success && result.questions && result.questions.length > 0) {
    resultDoc.quizId = result.rawApiResponse?.info?._id || result.rawApiResponse?._id;
    resultDoc.title = result.title;
    resultDoc.description = result.description;
    resultDoc.subject = result.subject;
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

    await GlobalErrorLog.create({
      scrapeResultId: resultDoc._id,
      url: input,
      slug,
      source: 'quizizz',
      errors: result.steps
        .filter((s) => s.status === 'failed' || s.step === 'error')
        .map((s) => ({
          type: 'QuizizzScrapingError',
          message: s.message || s.error || `Step "${s.step}" failed (HTTP ${s.httpStatus || '?'})`,
          stack: s.stack || '',
          step: s.step,
        })),
      debugContext: {
        steps: result.steps
      }
    });
  }

  await resultDoc.save();
  return resultDoc;
}
