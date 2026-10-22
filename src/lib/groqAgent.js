import { Groq } from 'groq-sdk';
import connectToDatabase from '@/lib/mongodb';
import StoredImage from '@/models/StoredImage';

export const PRIMARY_MODEL = 'minimax/minimax-m3.1-flash:free';
export const GROQ_FALLBACK_MODEL = 'openai/gpt-oss-120b';

/**
 * Resolves an image URL into a format usable by OpenRouter/Groq vision API:
 * - Public HTTPS URLs (e.g. Cloudinary) are passed directly.
 * - Local /api/images/... URLs are loaded from MongoDB StoredImage and converted to base64 data URI.
 * - MS Forms URLs (which block bots) are fetched with referer headers and converted to base64 data URI.
 */
async function resolveImageForAI(imageUrl, originalImageUrl, slug) {
  const targetUrl = imageUrl || originalImageUrl;
  if (!targetUrl || typeof targetUrl !== 'string') return null;

  // 1. Already base64 data URI
  if (targetUrl.startsWith('data:')) {
    return targetUrl;
  }

  // 2. Relative local URL from MongoDB fallback (/api/images/[slug]/[imageKey])
  if (targetUrl.startsWith('/api/images/')) {
    try {
      const parts = targetUrl.split('/');
      const imgSlug = parts[3] || slug;
      const imgKey = parts[4];
      if (imgSlug && imgKey) {
        await connectToDatabase();
        const stored = await StoredImage.findOne({ slug: imgSlug, imageKey: imgKey });
        if (stored && stored.data) {
          const mime = stored.contentType || 'image/jpeg';
          return `data:${mime};base64,${stored.data.toString('base64')}`;
        }
      }
    } catch (e) {
      console.warn('[AI Agent] Gagal membaca gambar lokal dari MongoDB:', e.message);
    }
  }

  // 3. Microsoft Forms / Office URLs (need proper headers to avoid 403 Forbidden)
  const isMsForms = targetUrl.includes('forms.cloud.microsoft') ||
                    targetUrl.includes('forms.office.com') ||
                    targetUrl.includes('sharepoint.com');
  if (isMsForms) {
    try {
      const res = await fetch(targetUrl, {
        headers: {
          'Referer': 'https://forms.cloud.microsoft/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        },
      });
      if (res.ok) {
        const buffer = Buffer.from(await res.arrayBuffer());
        const mime = res.headers.get('content-type') || 'image/jpeg';
        return `data:${mime};base64,${buffer.toString('base64')}`;
      }
    } catch (e) {
      console.warn('[AI Agent] Gagal mengunduh gambar MS Forms untuk AI:', e.message);
    }
  }

  // 4. Public HTTPS URL (Cloudinary, CDN, dll)
  if (targetUrl.startsWith('http://') || targetUrl.startsWith('https://')) {
    return targetUrl;
  }

  return null;
}

/**
 * Solves quiz and test questions using OpenRouter (Minimax M3.1 Flash) as primary AI,
 * with automatic fallback to Groq if OpenRouter is unavailable or rate-limited.
 * If questions or choices have images, the actual images are sent to the multimodal AI.
 */
export async function getAIAnswers(questions, options = {}) {
  if (!questions || questions.length === 0) return [];

  const slug = options?.slug || null;

  // Build multimodal content parts and text-only fallback
  const contentParts = [
    {
      type: 'text',
      text: 'Silakan amati dan jawab seluruh soal ujian berikut dengan teliti dan presisi tinggi. Bila ada gambar pada soal atau pilihan, cermati diagram, dimensi, rumus, dan tulisan di dalamnya.\n',
    },
  ];

  let formattedTextOnly = '';
  let hasAnyImage = false;

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const qNum = i + 1;

    let qText = `--- SOAL ${qNum} (ID: ${q.id}) ---\nTipe: ${q.type}\n`;
    if (q.title && q.title.trim()) {
      qText += `Pertanyaan: ${q.title.trim()}\n`;
    } else {
      qText += `Pertanyaan: (Pertanyaan dan informasi lengkap tertera pada gambar di bawah)\n`;
    }

    if (q.imageOcrText && q.imageOcrText.trim()) {
      qText += `[Hasil OCR Gambar]: ${q.imageOcrText.trim()}\n`;
    }

    qText += `Pilihan Jawaban:\n`;
    if (q.choices && q.choices.length > 0) {
      q.choices.forEach((c, cIdx) => {
        const text = typeof c === 'object' ? c.text : c;
        const ocrText = typeof c === 'object' ? c.ocrText : null;
        let choiceLine = `  [${cIdx}] ${text || '[Pilihan Berupa Gambar / Label]'}`;
        if (ocrText) {
          choiceLine += ` | OCR: ${ocrText}`;
        }
        qText += choiceLine + '\n';
      });
    } else {
      qText += `  [Isian / Essay - Tidak ada pilihan ganda]\n`;
    }

    formattedTextOnly += qText + '\n';

    contentParts.push({
      type: 'text',
      text: qText,
    });

    // Check if question has an image
    if (q.imageUrl || q.originalImageUrl) {
      const resolvedImg = await resolveImageForAI(q.imageUrl, q.originalImageUrl, slug);
      if (resolvedImg) {
        hasAnyImage = true;
        contentParts.push({
          type: 'text',
          text: `[GAMBAR UNTUK SOAL ${qNum} (ID: ${q.id})]:`,
        });
        contentParts.push({
          type: 'image_url',
          image_url: {
            url: resolvedImg,
          },
        });
      }
    }

    // Check if choices have images
    if (q.choices && q.choices.length > 0) {
      for (let cIdx = 0; cIdx < q.choices.length; cIdx++) {
        const c = q.choices[cIdx];
        if (typeof c === 'object' && c !== null && (c.imageUrl || c.originalImageUrl)) {
          const resolvedChoiceImg = await resolveImageForAI(c.imageUrl, c.originalImageUrl, slug);
          if (resolvedChoiceImg) {
            hasAnyImage = true;
            contentParts.push({
              type: 'text',
              text: `[GAMBAR PILIHAN [${cIdx}] UNTUK SOAL ${qNum} (ID: ${q.id})]:`,
            });
            contentParts.push({
              type: 'image_url',
              image_url: {
                url: resolvedChoiceImg,
              },
            });
          }
        }
      }
    }
  }

  const systemPrompt = `You are an expert AI tutor and exam solver that solves quiz, test, and exam questions with extreme precision and deep step-by-step reasoning.
The questions may include plain text, formulas, geometric diagrams (e.g. 3D geometry / dimensi tiga, cubes, pyramids, triangles), charts, or images containing the question itself.

CRITICAL INSTRUCTIONS:
1. When an image is provided for a question or choice, examine every detail of the image carefully:
   - Read the question text, labels, notations, and numbers displayed in the image.
   - For geometry / math diagrams, carefully observe points, planes, lines, right angles, coordinates, and lengths.
   - For choices displayed as images or labeled choices (e.g. Pernyataan 1, Pernyataan 2, A, B, C, D, E), determine which statement/choice is mathematically or factually correct.
2. In "thinking", explain your step-by-step mathematical derivation and logical reasoning clearly in Indonesian (or the language of the question).
3. In "answer", provide the exact text or statement of the correct choice.
4. In "answerIndex", provide the 0-based integer index of the correct choice from the provided choices list (0 for first choice, 1 for second, etc.), or null if there are no choices.

Output EXACTLY AND ONLY a valid JSON object:
{
  "results": [
    {
      "questionId": "The ID of the question",
      "thinking": "Langkah pengerjaan dan analisis logis step-by-step yang jelas",
      "answer": "Teks pilihan yang benar",
      "answerIndex": 0
    }
  ]
}
Do not wrap it in markdown blockquotes like \`\`\`json. Just output the raw JSON object.`;

  const primaryUserContent = hasAnyImage ? contentParts : formattedTextOnly;

  // 1. PRIMARY AI ATTEMPT: OpenRouter (minimax/minimax-m3.1-flash:free) with Vision & High Reasoning
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  if (openrouterKey) {
    try {
      console.log(`[AI Agent] Attempting Primary AI: OpenRouter (${PRIMARY_MODEL}) with ${hasAnyImage ? 'Vision Multimodal (Images included)' : 'Text mode'}...`);
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openrouterKey.trim()}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/ProBimkim/ScraperHouse',
          'X-Title': 'ScraperHouse Quiz Solver',
        },
        body: JSON.stringify({
          model: PRIMARY_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: primaryUserContent },
          ],
          reasoning: { effort: 'high' },
          response_format: { type: 'json_object' },
          temperature: 0.1,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) {
          const parsed = JSON.parse(content);
          if (parsed && Array.isArray(parsed.results) && parsed.results.length > 0) {
            console.log(`[AI Agent] Successfully resolved ${parsed.results.length} answers using Primary AI (${PRIMARY_MODEL}) with high reasoning!`);
            return parsed.results;
          }
        } else {
          console.warn(`[AI Agent] Primary AI (${PRIMARY_MODEL}) returned empty content (finish_reason: ${data.choices?.[0]?.finish_reason}). Engaging Groq fallback...`);
        }
      } else {
        const errorText = await res.text();
        console.warn(`[AI Agent] OpenRouter returned HTTP ${res.status}: ${errorText}. Engaging Groq fallback...`);
      }
    } catch (primaryErr) {
      console.warn(`[AI Agent] Primary AI (${PRIMARY_MODEL}) error: ${primaryErr.message}. Falling back to Groq...`);
    }
  }

  // 2. FALLBACK AI ATTEMPT: Groq (openai/gpt-oss-120b)
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    try {
      console.log(`[AI Agent] Engaging Groq Fallback AI (${GROQ_FALLBACK_MODEL})...`);
      const groq = new Groq({ apiKey: groqKey.trim() });

      let response;
      try {
        // First try with primary user content (multimodal if images exist)
        response = await groq.chat.completions.create({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: primaryUserContent },
          ],
          model: GROQ_FALLBACK_MODEL,
          response_format: { type: 'json_object' },
          temperature: 0.1,
        });
      } catch (groqMultimodalErr) {
        if (hasAnyImage) {
          console.warn(`[AI Agent] Groq fallback failed with multimodal payload (${groqMultimodalErr.message}). Retrying Groq with text & OCR payload...`);
          response = await groq.chat.completions.create({
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: formattedTextOnly },
            ],
            model: GROQ_FALLBACK_MODEL,
            response_format: { type: 'json_object' },
            temperature: 0.1,
          });
        } else {
          throw groqMultimodalErr;
        }
      }

      const content = response.choices?.[0]?.message?.content;
      if (content) {
        const parsed = JSON.parse(content);
        if (parsed && Array.isArray(parsed.results)) {
          console.log(`[AI Agent] Successfully resolved ${parsed.results.length} answers using Groq Fallback!`);
          return parsed.results;
        }
      }
    } catch (groqErr) {
      console.error('[AI Agent] Groq Fallback AI failed:', groqErr.message);
    }
  } else {
    console.warn('[AI Agent] GROQ_API_KEY is not configured for fallback.');
  }

  return [];
}

