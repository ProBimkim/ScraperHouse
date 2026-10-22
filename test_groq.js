// Test script for dual AI provider: OpenRouter (Primary) and Groq (Fallback)
const { Groq } = require('groq-sdk');

const PRIMARY_MODEL = 'minimax/minimax-m3.1-flash:free';
const GROQ_FALLBACK_MODEL = 'openai/gpt-oss-120b';

const sys = `You are an AI assistant. Answer the following quiz questions.

Output ONLY a JSON object containing an array of your answers under the key "results".
Example:
{
  "results": [
    {
      "questionId": "The ID of the question",
      "thinking": "Your step-by-step reasoning",
      "answer": "The text of the correct choice",
      "answerIndex": 1
    }
  ]
}`;

const q = `ID: q1
Question: Sebuah kelompok yang terdiri dari 5 pria dan 4 wanita akan duduk berjajar dalam satu baris. Jika disyaratkan bahwa pria duduk di kedua ujung barisan dan tidak boleh ada dua wanita yang duduk berdampingan, maka banyak susunan duduk berbeda yang dapat dibentuk adalah ...
Type: Choice
Choices:
  [0] 14.400
  [1] 28.800
  [2] 43.200
  [3] 57.600
  [4] 86.400`;

async function testDualAI() {
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  if (openrouterKey) {
    try {
      console.log(`[Test] Querying Primary AI: OpenRouter (${PRIMARY_MODEL})...`);
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openrouterKey.trim()}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/ProBimkim/ScraperHouse',
          'X-Title': 'ScraperHouse Test',
        },
        body: JSON.stringify({
          model: PRIMARY_MODEL,
          messages: [{ role: 'system', content: sys }, { role: 'user', content: q }],
          reasoning: { effort: 'high' },
          response_format: { type: 'json_object' },
          max_tokens: 8192,
          temperature: 0.1,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) {
          console.log('[Test] Primary AI Success:\n', content);
          return;
        }
        console.warn(`[Test] Primary AI exhausted token limit during high reasoning (finish_reason: ${data.choices?.[0]?.finish_reason}). Engaging Groq fallback...`);
      } else {
        console.warn(`[Test] OpenRouter HTTP error: ${res.status}`);
      }
    } catch (e) {
      console.warn(`[Test] Primary AI failed: ${e.message}`);
    }
  }

  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    try {
      console.log(`[Test] Querying Fallback AI: Groq (${GROQ_FALLBACK_MODEL})...`);
      const groq = new Groq({ apiKey: groqKey.trim() });
      const res = await groq.chat.completions.create({
        messages: [{ role: 'system', content: sys }, { role: 'user', content: q }],
        model: GROQ_FALLBACK_MODEL,
        response_format: { type: 'json_object' },
        max_tokens: 1000,
      });
      console.log('[Test] Groq Fallback Success:\n', res.choices[0].message.content);
      return;
    } catch (err) {
      console.error('[Test] Groq Fallback failed:', err.message);
    }
  }

  console.error('[Test] No AI provider available. Check your environment keys.');
}

testDualAI();
