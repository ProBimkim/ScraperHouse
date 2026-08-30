const { Groq } = require('groq-sdk');
const groq = new Groq({ apiKey: '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' });

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

async function test() {
  try {
    const res = await groq.chat.completions.create({
      messages: [{ role: 'user', content: sys + '\n\n' + q }],
      model: 'openai/gpt-oss-120b',
      max_tokens: 1000
    });
    console.log('OUT:', res.choices[0].message.content);
  } catch (err) {
    console.error('ERR:', err);
  }
}
test();
