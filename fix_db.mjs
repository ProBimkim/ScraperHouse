import mongoose from 'mongoose';

const ScrapeResultSchema = new mongoose.Schema({}, { strict: false });
const ScrapeResult = mongoose.models.ScrapeResult || mongoose.model('ScrapeResult', ScrapeResultSchema);

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const slug = 'scraper_mtl4rym5';
    const doc = await ScrapeResult.findOne({ slug });
    
    if (!doc) {
      console.log('Doc not found');
      return;
    }

    const questions = doc.get('questions');
    let updated = false;

    questions.forEach((q, qIdx) => {
      // The user uploaded them as q_0, q_1, etc. in the ROOT of Cloudinary!
      // So the URL should be https://res.cloudinary.com/tydxcq7z/image/upload/q_0.jpg
      if (q.imageUrl && q.imageUrl.includes('res.cloudinary.com')) {
        q.imageUrl = `https://res.cloudinary.com/tydxcq7z/image/upload/q_${qIdx}.jpg`;
        updated = true;
      }
      // I don't think there are choices with images based on the user's manual upload, but just in case
      if (q.choices) {
        q.choices.forEach((c, cIdx) => {
          if (typeof c === 'object' && c !== null && c.imageUrl && c.imageUrl.includes('res.cloudinary.com')) {
            c.imageUrl = `https://res.cloudinary.com/tydxcq7z/image/upload/q_${qIdx}_opt_${cIdx}.jpg`;
            updated = true;
          }
        });
      }
    });

    if (updated) {
      // mongoose mixed type needs markModified
      doc.markModified('questions');
      await doc.save();
      console.log('Successfully updated the database to point to the root Cloudinary URLs!');
    } else {
      console.log('No URLs needed updating');
    }

    mongoose.connection.close();
  } catch (e) {
    console.error('Error:', e);
    mongoose.connection.close();
  }
}
run();
