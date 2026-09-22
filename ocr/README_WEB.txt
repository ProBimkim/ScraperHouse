OCR Soal Gambar - Versi Web
===========================

Cara menjalankan lokal:

1. Pastikan Python 3 tersedia.
2. Jalankan `run_web.py`.
3. Browser akan membuka aplikasi OCR secara otomatis.
4. Pilih gambar atau folder gambar.

Shortcut:

- Windows: jalankan `run_web.bat`
- macOS/Linux: jalankan `run_web.command` atau `python3 run_web.py`

Fitur:

- OCR bahasa Indonesia + Inggris.
- Pencarian teks hasil OCR.
- Download hasil ke TXT.
- Cetak atau simpan ke PDF dengan gambar soal asli.

Catatan:

- Tesseract.js dan model bahasa diunduh dari CDN saat pertama kali digunakan.
- Untuk hosting online, upload `web_ocr.html` ke static hosting seperti GitHub Pages.
- Tidak perlu install Tesseract.
