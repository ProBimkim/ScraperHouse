import { Groq } from 'groq-sdk';

export const PRIMARY_MODEL = 'minimax/minimax-m3.1-flash:free';
export const GROQ_FALLBACK_MODEL = 'openai/gpt-oss-120b';

/**
 * Solves quiz and test questions using OpenRouter (Minimax M3.1 Flash) as primary AI,
 * with automatic fallback to Groq if OpenRouter is unavailable or rate-limited.
 */
export async function getAIAnswers(questions) {
  if (!questions || questions.length === 0) return [];

  const formattedQuestions = questions.map((q) => {
    let qText = `ID: ${q.id}\nQuestion: ${q.title}\nType: ${q.type}\n`;
    if (q.imageOcrText) {
      qText += `[Image OCR Text]: ${q.imageOcrText}\n`;
    }
    qText += `Choices:\n`;
    if (q.choices && q.choices.length > 0) {
      q.choices.forEach((c, cIdx) => {
        const text = typeof c === 'object' ? c.text : c;
        const ocrText = typeof c === 'object' ? c.ocrText : null;
        let choiceLine = `  [${cIdx}] ${text || '[Image/No Text]'}`;
        if (ocrText) {
          choiceLine += ` | OCR: ${ocrText}`;
        }
        qText += choiceLine + '\n';
      });
    } else {
      qText += `  [Text Input / No choices provided]\n`;
    }
    return qText;
  }).join('\n\n');

  const systemPrompt = `You are an expert AI assistant that helps answer quiz and test questions accurately.
Read the following questions and provide your answers.

Output EXACTLY AND ONLY a valid JSON object containing an array of your answers under the key "results".
Do not wrap it in markdown blockquotes like \`\`\`json. Just output the raw JSON object.

Format:
{
  "results": [
    {
      "questionId": "The ID of the question",
      "thinking": "Brief step-by-step reasoning explaining why this is the correct answer",
      "answer": "The exact text of the correct choice, or your text answer if no choices exist",
      "answerIndex": 0 // The integer index of the correct choice, or null if no choices
    }
  ]
}`;

  // 1. PRIMARY AI ATTEMPT: OpenRouter (minimax/minimax-m3.1-flash:free)
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  if (openrouterKey) {
    try {
      console.log(`[AI Agent] Attempting Primary AI: OpenRouter (${PRIMARY_MODEL})...`);
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
            { role: 'user', content: formattedQuestions },
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
        console.warn(`[AI Agent] OpenRouter returned HTTP ${res.status}: ${errorText}`);
      }
    } catch (primaryErr) {
      console.warn(`[AI Agent] Primary AI (${PRIMARY_MODEL}) encounter: ${primaryErr.message}. Falling back to Groq...`);
    }
  }

  // 2. FALLBACK AI ATTEMPT: Groq (openai/gpt-oss-120b)
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    try {
      console.log(`[AI Agent] Engaging Groq Fallback AI (${GROQ_FALLBACK_MODEL})...`);
      const groq = new Groq({ apiKey: groqKey.trim() });
      const response = await groq.chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: formattedQuestions },
        ],
        model: GROQ_FALLBACK_MODEL,
        response_format: { type: 'json_object' },
        temperature: 0.1,
      });

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
