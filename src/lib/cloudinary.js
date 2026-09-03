import { v2 as cloudinary } from 'cloudinary';

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
 * @returns {Promise<string>} - Mengembalikan URL Cloudinary permanen (HTTPS)
 */
export async function uploadImageToCloudinary(imageUrl, folder, publicId) {
  if (!imageUrl) return null;

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
    const buffer = Buffer.from(arrayBuffer);

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
    console.error('Gagal mengupload gambar ke Cloudinary:', error.message);
    throw error; // Let the caller handle it and maybe fallback
  }
}
