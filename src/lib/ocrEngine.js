import { createWorker } from 'tesseract.js';

const OCR_TIMEOUT_MS = 10000; // 10 seconds per image
const MAX_OCR_IMAGES = 150;   // Allow full quizzes (up to 150 images)

let cachedWorker = null;

/**
 * Dapatkan atau buat worker Tesseract (singleton untuk efisiensi RAM & CPU).
 * Menggunakan bahasa 'ind' (Latin script) yang 2x lebih cepat dibanding multi-lang 'ind+eng'.
 */
async function getWorker() {
  if (!cachedWorker) {
    cachedWorker = await createWorker('ind');
  }
  return cachedWorker;
}

/**
 * Optimasi URL gambar: jika dari Cloudinary, tambahkan scaling w_900
 * agar proses pemrosesan pixel Tesseract 30-40% lebih cepat tanpa mengurangi akurasi huruf/rumus.
 */
function getOcrOptimizedUrl(url) {
  if (!url || typeof url !== 'string') return url;
  if (url.includes('res.cloudinary.com') && url.includes('/upload/')) {
    if (!url.includes('/w_')) {
      return url.replace('/upload/', '/upload/w_900,c_scale/');
    }
  }
  return url;
}

/**
 * Jalankan OCR pada soal dan pilihan yang bergambar.
 * Mendukung limit batch per request agar proses cepat dan tidak timeout.
 * 
 * @param {Array} questions - Array question objects
 * @param {Function} onProgress - Optional callback(processed, total)
 * @param {boolean} force - Jika true, proses ulang meski sudah ada teks OCR
 * @param {number} limit - Jumlah maksimal gambar yang diproses pada batch ini (default 150)
 * @returns {Promise<{ processed: number, total: number, remaining: number }>}
 */
export async function runOcrOnQuestions(questions, onProgress, force = false, limit = 150) {
  if (!questions || questions.length === 0) {
    return { processed: 0, total: 0, remaining: 0 };
  }

  // Kumpulkan task yang belum memiliki OCR (atau semua jika force = true)
  const tasks = [];
  for (const q of questions) {
    if (q.imageUrl && (force || !q.imageOcrText)) {
      tasks.push({ target: q, field: 'imageOcrText', url: q.imageUrl });
    }
    if (q.choices && q.choices.length > 0) {
      for (const c of q.choices) {
        if (typeof c === 'object' && c !== null && c.imageUrl && (force || !c.ocrText)) {
          tasks.push({ target: c, field: 'ocrText', url: c.imageUrl });
        }
      }
    }
  }

  const total = tasks.length;
  if (total === 0) {
    return { processed: 0, total: 0, remaining: 0 };
  }

  // Batasi sesuai batch limit
  const tasksToProcess = tasks.slice(0, Math.min(limit, MAX_OCR_IMAGES));
  let processed = 0;

  try {
    const worker = await getWorker();

    for (const task of tasksToProcess) {
      try {
        const optimizedUrl = getOcrOptimizedUrl(task.url);
        const ret = await worker.recognize(optimizedUrl);
        const text = ret?.data?.text?.trim();
        if (text) {
          task.target[task.field] = text;
          processed++;
          if (onProgress) onProgress(processed, tasksToProcess.length);
        }
      } catch (err) {
        console.warn(`OCR error for ${task.url}:`, err.message);
      }
    }
  } catch (err) {
    console.error('OCR engine error:', err.message);
    if (cachedWorker) {
      try { await cachedWorker.terminate(); } catch {}
      cachedWorker = null;
    }
  }

  return { processed, total, remaining: total - processed };
}
