const mongoose = require('mongoose');
const { createWorker, createScheduler } = require('tesseract.js');

const uri = 'mongodb+srv://bimkiminfor_db_user:gQg4yefWGAPiyetx@cluster0.8fealwi.mongodb.net/scraper_db?appName=Cluster0';

async function main() {
  const targetSlug = process.argv[2] || 'scraper_muc3928l';
  console.log(`Connecting to MongoDB for slug: ${targetSlug}...`);
  await mongoose.connect(uri);
  const coll = mongoose.connection.collection('scraperesults');

  const doc = await coll.findOne({ slug: targetSlug });
  if (!doc) {
    console.error(`Document with slug ${targetSlug} not found!`);
    process.exit(1);
  }

  console.log(`Found "${doc.title}" with ${doc.questions?.length || 0} questions.`);

  const tasks = [];
  doc.questions.forEach((q, qIdx) => {
    if (q.imageUrl && !q.imageOcrText) {
      tasks.push({ qIdx, type: 'question', url: q.imageUrl });
    }
    if (q.choices) {
      q.choices.forEach((c, cIdx) => {
        if (typeof c === 'object' && c && c.imageUrl && !c.ocrText) {
          tasks.push({ qIdx, cIdx, type: 'choice', url: c.imageUrl });
        }
      });
    }
  });

  console.log(`Total images needing OCR: ${tasks.length}`);
  if (tasks.length === 0) {
    console.log('No images need OCR. Everything is already up to date!');
    process.exit(0);
  }

  // Create scheduler with 3 workers
  console.log('Initializing Tesseract scheduler with 3 workers...');
  const scheduler = createScheduler();
  const w1 = await createWorker('ind+eng');
  const w2 = await createWorker('ind+eng');
  const w3 = await createWorker('ind+eng');
  scheduler.addWorker(w1);
  scheduler.addWorker(w2);
  scheduler.addWorker(w3);
  console.log('Workers ready! Processing images...');

  let completed = 0;
  const t0 = Date.now();

  await Promise.all(
    tasks.map(async (task) => {
      try {
        const ret = await scheduler.addJob('recognize', task.url);
        const text = ret?.data?.text?.trim() || '';
        if (task.type === 'question') {
          doc.questions[task.qIdx].imageOcrText = text;
        } else if (task.type === 'choice') {
          doc.questions[task.qIdx].choices[task.cIdx].ocrText = text;
        }
        completed++;
        if (completed % 5 === 0 || completed === tasks.length) {
          const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
          console.log(`Progress: ${completed}/${tasks.length} images processed (${elapsed}s)`);
        }
      } catch (err) {
        console.warn(`Failed OCR for task at qIdx ${task.qIdx}:`, err.message);
      }
    })
  );

  console.log('All OCR tasks finished. Terminating workers...');
  await scheduler.terminate();

  console.log('Saving updated questions to MongoDB...');
  await coll.updateOne(
    { _id: doc._id },
    { $set: { questions: doc.questions } }
  );

  console.log(`Successfully updated ${targetSlug} in MongoDB! Done in ${((Date.now() - t0) / 1000).toFixed(1)}s.`);
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
