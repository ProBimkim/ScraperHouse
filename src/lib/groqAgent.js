import { Groq } from 'groq-sdk';

// Initialize Groq client
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// The model to use. openai/gpt-oss-120b is active and powerful on Groq in 2026.
const MODEL = 'openai/gpt-oss-120b';

export async function getAIAnswers(questions) {
  if (!questions || questions.length === 0) return [];
  
  try {
    const formattedQuestions = questions.map((q, idx) => {
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

    const response = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: formattedQuestions }
      ],
      model: MODEL,
      response_format: { type: 'json_object' },
      temperature: 0.1,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return [];

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.error('Failed to parse JSON from Groq:', content);
      return [];
    }

    return parsed.results || [];
  } catch (error) {
    console.error('Error getting AI answers from Groq:', error);
    return [];
  }
}
