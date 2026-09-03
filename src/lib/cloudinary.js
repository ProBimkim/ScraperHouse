import { v2 as cloudinary } from 'cloudinary';
import connectToDatabase from '@/lib/mongodb';
import StoredImage from '@/models/StoredImage';

// Konfigurasi Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

/**
 * Mendownload gambar dari URL dan mengunggahnya ke Cloudinary menggunakan stream.
 * @param {string} imageUrl - URL asli gambar (misal dari MS Forms)
 * @param {string} folder - Folder tujuan di Cloudinary
 * @param {string} publicId - ID/Nama file di Cloudinary (tanpa ekstensi)
 * @param {string} slug - Slug scraper result untuk relasi fallback MongoDB
 * @returns {Promise<string>} - Mengembalikan URL Cloudinary permanen (HTTPS) atau URL lokal (/api/images/...)
 */
export async function uploadImageToCloudinary(imageUrl, folder, publicId, slug) {
  if (!imageUrl) return null;

  let buffer = null;
  try {
    // Gunakan fetch untuk mendownload stream gambar dari sumber aslinya
    const response = await fetch(imageUrl, {
      headers: {
        'Referer': 'https://forms.cloud.microsoft/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      }
    });
    if (!response.ok) {
      throw new Error(`Gagal mengunduh gambar dari URL asal. HTTP Status: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    buffer = Buffer.from(arrayBuffer);

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: folder,
          public_id: publicId,
          overwrite: true,
          resource_type: 'image',
        },
        (error, result) => {
          if (error) {
            console.error('Cloudinary upload error:', error);
            return reject(error);
          }
          if (result && result.secure_url) {
            resolve(result.secure_url);
          } else {
            reject(new Error('Unknown upload result from Cloudinary'));
          }
        }
      );

      // Tulis buffer ke stream upload Cloudinary
      uploadStream.end(buffer);
    });
  } catch (error) {
    console.warn(`Gagal mengupload gambar ${publicId} ke Cloudinary: ${error.message}. Coba fallback ke MongoDB...`);
    
    if (slug) {
      try {
        await connectToDatabase();
        const contentType = imageUrl.includes('.png') ? 'image/png' : 'image/jpeg';
        
        // Upsert ke MongoDB
        await StoredImage.findOneAndUpdate(
          { slug, imageKey: publicId },
          { 
            slug, 
            imageKey: publicId, 
            contentType,
            data: buffer,
            size: buffer ? buffer.length : 0
          },
          { upsert: true, new: true }
        );
        
        console.log(`Berhasil menyimpan gambar ${publicId} ke MongoDB sebagai fallback.`);
        // Mengembalikan URL lokal untuk diload dari MongoDB
        return `/api/images/${slug}/${publicId}`;
      } catch (mongoError) {
        console.error(`Gagal fallback menyimpan ke MongoDB untuk ${publicId}:`, mongoError.message);
      }
    }
    
    // Jika semua gagal, lemparkan error agar proses selanjutnya tahu
    throw error;
  }
}
