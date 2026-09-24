import { createWorker, createScheduler } from 'tesseract.js';

const OCR_TIMEOUT_MS = 10000; // 10 seconds per image
const MAX_OCR_IMAGES = 150;   // Allow full quizzes (up to 150 images)

/**
 * Run OCR on all questions and choices that have images.
 * Mutates the questions array in-place, adding imageOcrText / ocrText fields.
 * Skips images that already have OCR text.
 * 
 * @param {Array} questions - Array of question objects from the scraper
 * @param {Function} onProgress - Optional callback(processed, total)
 * @returns {Promise<{ processed: number, total: number }>} - OCR stats
 */
export async function runOcrOnQuestions(questions, onProgress) {
  if (!questions || questions.length === 0) {
    return { processed: 0, total: 0 };
  }

  // Collect all image URLs that need OCR (only those missing OCR)
  const tasks = [];
  for (const q of questions) {
    if (q.imageUrl && !q.imageOcrText) {
      tasks.push({ target: q, field: 'imageOcrText', url: q.imageUrl });
    }
    if (q.choices && q.choices.length > 0) {
      for (const c of q.choices) {
        if (typeof c === 'object' && c !== null && c.imageUrl && !c.ocrText) {
          tasks.push({ target: c, field: 'ocrText', url: c.imageUrl });
        }
      }
    }
  }

  const total = tasks.length;
  if (total === 0) {
    return { processed: 0, total: 0 };
  }

  const tasksToProcess = tasks.slice(0, MAX_OCR_IMAGES);
  let processed = 0;

  try {
    if (tasksToProcess.length > 3) {
      // Use scheduler with 3 workers for high throughput
      const scheduler = createScheduler();
      const numWorkers = Math.min(3, tasksToProcess.length);
      const workers = await Promise.all(
        Array.from({ length: numWorkers }, () => createWorker('ind+eng'))
      );
      workers.forEach(w => scheduler.addWorker(w));

      await Promise.all(
        tasksToProcess.map(async (task) => {
          try {
            const ret = await scheduler.addJob('recognize', task.url);
            const text = ret?.data?.text?.trim();
            if (text) {
              task.target[task.field] = text;
              processed++;
              if (onProgress) onProgress(processed, total);
            }
          } catch (e) {
            console.warn(`OCR error for ${task.url}:`, e.message);
          }
        })
      );

      await scheduler.terminate();
    } else {
      // Single worker for 1-3 images
      const worker = await createWorker('ind+eng');
      for (const task of tasksToProcess) {
        try {
          const ret = await worker.recognize(task.url);
          const text = ret?.data?.text?.trim();
          if (text) {
            task.target[task.field] = text;
            processed++;
            if (onProgress) onProgress(processed, total);
          }
        } catch (e) {
          console.warn(`OCR error for ${task.url}:`, e.message);
        }
      }
      await worker.terminate();
    }
  } catch (err) {
    console.error('OCR engine error:', err.message);
  }

  return { processed, total };
}
