import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function run() {
  try {
    const result = await cloudinary.search
      .expression('folder:scraper/*')
      .max_results(100)
      .execute();
    
    console.log(`Found ${result.resources.length} images in Cloudinary`);
    result.resources.forEach(r => console.log(r.public_id, r.secure_url));
  } catch (e) {
    console.error('Error:', e);
  }
}
run();
