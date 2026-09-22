import { createWorker } from 'tesseract.js';

const OCR_TIMEOUT_MS = 10000; // 10 seconds per image
const MAX_OCR_IMAGES = 15;    // Limit to prevent Vercel timeout

/**
 * Download an image from a URL and return it as a Buffer.
 */
async function downloadImageBuffer(imageUrl) {
  const response = await fetch(imageUrl, {
    headers: {
      'Referer': 'https://forms.cloud.microsoft/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to download image: HTTP ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Extract text from an image URL using Tesseract.js OCR.
 * @param {string} imageUrl - URL of the image to OCR
 * @param {import('tesseract.js').Worker} worker - Reusable Tesseract worker
 * @returns {Promise<string|null>} - Extracted text or null on failure
 */
async function ocrFromUrl(imageUrl, worker) {
  try {
    const buffer = await downloadImageBuffer(imageUrl);

    // Race between OCR and timeout
    const result = await Promise.race([
      worker.recognize(buffer),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('OCR timeout')), OCR_TIMEOUT_MS)
      ),
    ]);

    const text = result?.data?.text?.trim();
    return text || null;
  } catch (err) {
    console.warn(`OCR failed for ${imageUrl}: ${err.message}`);
    return null;
  }
}

/**
 * Run OCR on all questions and choices that have images.
 * Mutates the questions array in-place, adding imageOcrText / ocrText fields.
 * 
 * @param {Array} questions - Array of question objects from the scraper
 * @returns {Promise<{ processed: number, total: number }>} - OCR stats
 */
export async function runOcrOnQuestions(questions) {
  if (!questions || questions.length === 0) {
    return { processed: 0, total: 0 };
  }

  // Collect all image URLs that need OCR
  const tasks = [];
  for (const q of questions) {
    if (q.imageUrl) {
      tasks.push({ target: q, field: 'imageOcrText', url: q.imageUrl });
    }
    if (q.choices && q.choices.length > 0) {
      for (const c of q.choices) {
        if (typeof c === 'object' && c !== null && c.imageUrl) {
          tasks.push({ target: c, field: 'ocrText', url: c.imageUrl });
        }
      }
    }
  }

  const total = tasks.length;
  if (total === 0) {
    return { processed: 0, total: 0 };
  }

  // Limit to prevent timeout on Vercel
  const tasksToProcess = tasks.slice(0, MAX_OCR_IMAGES);

  let worker;
  let processed = 0;

  try {
    worker = await createWorker('ind+eng');

    // Process in parallel batches of 3 for speed
    const BATCH_SIZE = 3;
    for (let i = 0; i < tasksToProcess.length; i += BATCH_SIZE) {
      const batch = tasksToProcess.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (task) => {
          const text = await ocrFromUrl(task.url, worker);
          if (text) {
            task.target[task.field] = text;
            processed++;
          }
        })
      );
    }
  } catch (err) {
    console.error('OCR engine error:', err.message);
  } finally {
    if (worker) {
      try { await worker.terminate(); } catch {}
    }
  }

  return { processed, total };
}
