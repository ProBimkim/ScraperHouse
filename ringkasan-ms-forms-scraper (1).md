# Ringkasan Proyek: Scraper Microsoft Forms (Python)

## Tujuan
Membuat scraper Python yang menerima **link Microsoft Forms** dari user, lalu mengambil **struktur form** (judul, deskripsi, daftar pertanyaan, tipe field, wajib/tidak, pilihan jawaban).

**Batasan yang disepakati di awal:**
- Yang diambil = struktur form (pertanyaan & pilihan), BUKAN respons/jawaban orang lain.
- Data respons tidak bisa diambil dari link publik — itu hanya bisa diakses pemilik form yang login di forms.office.com (via ekspor Excel).

## Link form contoh yang dipakai untuk uji coba
```
https://forms.cloud.microsoft/r/JQF2zmfDWX
```
Judul form ini: **"KUIS 1 KAIDAH PENCACAHAN (2)"**

## Perjalanan teknis (apa yang sudah dicoba)

### Percobaan 1 — Parsing HTML langsung (GAGAL)
Pendekatan awal: cari blob JSON yang di-embed langsung di HTML (`var FormsData = {...}` atau `window.__INITIAL_STATE__`). Ternyata Microsoft Forms versi terbaru **tidak** menaruh data pertanyaan dengan cara ini. Hasil: `[gagal] Tidak menemukan blob JSON struktur form di HTML.`

### Percobaan 2 — Ditemukan endpoint API resmi (BERHASIL sebagian)
Dari inspeksi HTML mentah (`debug.html` yang diupload user), ditemukan bahwa halaman form menyimpan variabel `window.OfficeFormServerInfo` yang berisi field **`prefetchFormUrl`** — URL API internal yang dipakai halaman itu sendiri untuk fetch data form:

```
https://forms.cloud.microsoft/formapi/api/{tenantId}/users/{userId}/light/runtimeForms('{formId}')?$expand=questions($expand=choices)
```

Untuk form contoh di atas, URL API-nya adalah:
```
https://forms.cloud.microsoft/formapi/api/9188040d-6c67-4c5b-b112-36a304b66dad/users/00000000-0000-0000-0003-40028fa00940/light/runtimeForms('DQSIkWdsW0yxEjajBLZtrQAAAAAAAAAAAANAAo-gCUBUNzNPNVdGVzdIME4xRFFaRDNXWUJSVUs5WC4u')?$expand=questions($expand=choices)
```

Script diupdate untuk:
1. GET halaman form biasa.
2. Regex ekstrak `"prefetchFormUrl":"..."` dari HTML, unescape (karena di-escape gaya JSON, mis. `\u0027` untuk kutip satu).
3. GET langsung ke URL API tersebut → seharusnya dapat JSON pertanyaan+pilihan.

### Percobaan 3 — Masalah saat ini (BELUM SELESAI)
Ekstraksi `prefetchFormUrl` **berhasil** (dikonfirmasi lewat script Python: URL API berhasil ditemukan dari HTML).

Tapi ketika API tersebut dipanggil, hasil JSON yang didapat:
```json
{
  "title": "KUIS 1 KAIDAH PENCACAHAN (2)",
  "description": null,
  "jumlah_pertanyaan": 0,
  "pertanyaan": []
}
```
→ **Judul form berhasil didapat, tapi daftar pertanyaan kosong.** Kemungkinan penyebab (belum dikonfirmasi):
- Nama field JSON di respons API berbeda dari yang ditebak (`questions`/`Questions`).
- API butuh header tambahan (mis. terkait `antiForgeryToken`, `X-CorrelationId`, `X-UserSessionId` yang terlihat disebut di HTML tapi belum jelas cara pakainya).
- API butuh cookie session dari request pertama (sudah pakai `requests.Session()` sehingga cookie seharusnya terbawa, tapi belum terverifikasi).
- Server membatasi akses anonim/non-browser (server-side anti-scraping check terhadap Referer/Origin/User-Agent, dll).

**Langkah debug yang sudah disiapkan tapi belum dieksekusi user:**
Script versi terakhir sudah ditambah agar SELALU menyimpan respons mentah API ke file `api_raw_response.json` (apapun isinya), supaya struktur JSON asli bisa diperiksa langsung — bukan hasil parsing yang sudah difilter script. User belum sempat menjalankan ulang & mengirim file ini.

## Status file
Script terakhir (paling update) ada di:
```
/mnt/user-data/outputs/ms_forms_scraper.py
```
Fungsi-fungsi kunci di dalamnya:
- `fetch_html(session, url)` — ambil HTML halaman form
- `find_prefetch_api_url(html)` — regex ekstrak & unescape `prefetchFormUrl`
- `extract_questions(form_json)` — normalisasi daftar pertanyaan dari JSON API (tempat kemungkinan perlu diperbaiki nama field)
- `scrape(url, save_html_path)` — orkestrasi utama, sekarang juga menyimpan `api_raw_response.json`

Cara pakai:
```bash
pip install requests --break-system-packages
python3 ms_forms_scraper.py "https://forms.cloud.microsoft/r/JQF2zmfDWX"
# opsional simpan HTML mentah untuk debug:
python3 ms_forms_scraper.py "URL" --save-html debug.html
```

## Next steps (yang perlu dilanjutkan)
1. **Jalankan ulang script versi terbaru**, lalu buka `api_raw_response.json` yang dihasilkan — lihat struktur JSON asli dari API (field pertanyaan namanya apa, ada di level mana, dll).
2. Sesuaikan `extract_questions()` di script supaya cocok dengan struktur JSON yang sebenarnya.
3. Kalau ternyata API menolak akses anonim / butuh header khusus, coba tambahkan header seperti:
   - `Referer`: URL halaman form asli
   - Header terkait token yang ditemukan di HTML (`antiForgeryToken`, dll) — perlu cek lagi bagaimana browser sungguhan mengirim token ini (mungkin lewat cookie, bukan header).
4. Setelah dapat daftar pertanyaan & pilihan dengan benar, bisa lanjut ke fitur ekspor (CSV/Excel) atau UI kalau dibutuhkan.

## File referensi yang sempat diupload user (untuk konteks debugging)
- `debug.html` — HTML mentah halaman form (dipakai untuk menemukan `prefetchFormUrl`)
- `debug-1.html` — HTML mentah kedua (isinya identik/sangat mirip dengan `debug.html`, hanya beda session id/nonce)
- `hasil_form.json` — hasil output script yang menunjukkan `pertanyaan: []` (masalah yang belum terpecahkan)

## Catatan penting untuk kelanjutan di tool lain
- Environment kerja waktu itu: **macOS, Python 3 di virtualenv (`venv`), zsh**, project folder bernama `ms-form`.
- Belum ada percobaan menambahkan header/cookie tambahan ke request API — ini kemungkinan besar akar masalahnya.
- Belum dicoba membuka DevTools browser sungguhan untuk membandingkan header request asli vs yang dikirim `requests` di Python — ini bisa jadi cara tercepat untuk tahu apa yang kurang.
