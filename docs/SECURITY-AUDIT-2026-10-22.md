# Audit Keamanan ScraperHouse — 22 Oktober 2026

Audit ini reviewing laporan hasil **Strix AI Security Engine** (scanner bawaan repo ini)
terhadap target `https://scraperhouse.vercel.app/`, lalu memverifikasi setiap klaim
melawan **ground truth** (server produksi + source code) sebelum mempercayainya.

**Hasil utama:** laporan itu ~90% false positive — bukan karena targetnya lemah,
melainkan karena scanner-nya menguji endpoint yang salah dan salah membaca error
klien sebagai kegagalan server. Di saat yang sama, ada **satu kelemahan kritis
yang benar-benar ada tapi justru terlewat** dari laporan.

---

## 1. Metodologi verifikasi

Tidak ada klaim yang dipercaya begitu saja. Setiap temuan diuji ulang dengan:

1. **Request langsung ke produksi** (curl) — bukan lewat log scanner.
2. **Baca source code** — `D:/scraper house/src/`.
3. **Uji ulang scanner** — jalankan `fuzzLoginSecurity()` terhadap path yang sama
   dan bandingkan outputnya.
4. **Uji penetrasi nyata** — forged cookie, bypass ekstensi path, CSRF
   cross-origin, kebocoran password via query string.

| Artefak | Peran |
|---|---|
| `src/lib/strixEngine.js` | mesin scan utama (recon, fuzzing auth, IP exposure) |
| `src/lib/accountTakeoverAssessment.js` | audit ketahanan ATO + brute-force langsung |
| `src/lib/stressEngine.js` | stress test & analisis dampak DoS |
| `src/app/api/auth/login/route.js` | handler login (rate limit, CSRF, cookie) |
| `src/middleware.js` | gerbang autentikasi seluruh aplikasi |

---

## 2. Klaim laporan vs bukti

### 2.1 Klaim yang SALAH (false positive)

| ID | Klaim laporan | Bukti ground truth | Kenapa salah |
|---|---|---|---|
| STRIX-2026-001 | `POST /login` tidak punya rate limiting | `POST /login` → **405** (halaman GET-only). Endpoint asli `/api/auth/login` → **429** setelah 5 percobaan | Scanner menguji halaman, bukan handler kredensial |
| STRIX-2026-002 | Login tanpa proteksi CSRF | `/api/auth/login` cross-origin (`Origin` + `Sec-Fetch-Site`) → **403** | Proteksi CSRF sudah ada, tidak diuji |
| STRIX-RATELIMIT-6634 | `/admin/login` tanpa rate limit | `/admin/login` → **307** ke `/login`. Tabel brute-force di laporan sendiri mencatat **semua 7 percobaan = HTTP 307** (redirect!) | Kredensial **tidak pernah benar-benar diuji**, tapi ditulis "REJECTED_UNAUTHORIZED" |
| ATO-KQZU | 7 endpoint API auth tak terlindungi | Semua path itu **tidak ada**; middleware catch-all balas 401. Hanya `/api/auth/login` yang nyata (OPTIONS → **204** `Allow: OPTIONS, POST`; path acak → 401) | Keberadaan endpoint ≠ kerentanan |
| ATO-2AOF | Distributed rate limit evasion | Spoofing `X-Forwarded-For` **tidak** melewati limiter (tetap 429) — Vercel menimpa header itu | Dihitung sebagai "vulnerable" padahal header diabaikan platform |
| ATO-2ND4 | Tidak ada CAPTCHA (severity tinggi) | CAPTCHA memang tidak ada, tapi tidak relevan bila rate limit aktif | Severity tidak proporsional |
| ATO-GSAM | Dictionary brute-force susceptible | 307, bukan respons autentikasi | Diassessment pada endpoint salah |
| STRIX-IP-LEAK-6634 | Origin IP bocor → vektor bypass WAF | `216.198.79.131` itu **literal DNS A record Vercel** (publik). "Computer IP 100.31.37.232" = **IP mesin scanner itu sendiri** (IP mesin uji = `182.253.131.55`) | Bukan kebocoran origin sama sekali |
| Bagian DoS | "Asymmetric DoS CRITICAL", 0.44x latensi | 0.44x = **lebih cepat** (44ms vs baseline 202ms). "100% error rate" = 405/401 yang dihitung sebagai crash server | 4xx ≠ kegagalan server |

Teks laporan juga kontradiktif sendiri: bagian header menulis **"CRITICAL (90/100)"** tapi
Executive Summary menulis **"Overall risk is MEDIUM"**.

### 2.2 Temuan yang BENAR tapi terlewat di laporan

**🔴 CRITICAL — cookie sesi bisa dipalsukan.**
`auth_token` bernilai string literal `'true'`. Terbukti di produksi:

```bash
curl -H "Cookie: auth_token=true" https://scraperhouse.vercel.app/api/history
# → HTTP 200 + dump data MongoDB asli
```

Akses penuh ke seluruh API tanpa password. Laporan justru menulis
*"No authentication bypass identified"* — kebalikan dari kenyataan.

**🟠 HIGH — bypass autentikasi lewat ekstensi gambar.**
Matcher middleware mengecualikan path yang berakhir `.png/.jpg/.jpeg/.gif/.webp`,
sehingga `/api/scraper/x.png` **melewati cek auth dan handler tetap dieksekusi**
(respons 404 dari DB, bukan 401 dari middleware).

**🟡 MEDIUM — kebocoran password master lewat query string.**
`DELETE /api/errors?password=…` → password masuk access log server, history
browser, dan header `Referer`.

**🟡 MEDIUM — fallback password hardcoded.**
`process.env.APP_PASSWORD || 'DEV_BIMKIM'` — kalau env var kosong di produksi,
password aplikasi menjadi string yang publik diketahui.

**🟡 LOW — tidak ada logout / invalidasi sesi.**
Cookie 7 hari, tidak bisa dicabut.

---

## 3. Perbaikan yang diterapkan

### 3.1 Keamanan aplikasi — commit `4f21746`

| Berkas | Perubahan |
|---|---|
| `src/lib/session.js` *(baru)* | Token sesi HMAC-SHA256 (`expiry.nonce.signature`) via WebCrypto, `verifySession()`, `safeEqual()` constant-time. Nonce acak per token supaya tidak bisa diprediksi/di-replay. |
| `src/middleware.js` | Verifikasi token bertanda tangan (bukan `=== 'true'`); izinkan `/api/auth/logout`; matcher tambah `/api/:path*`. |
| `src/app/api/auth/login/route.js` | Terbitkan token bertanda tangan; **fail-closed** (500) bila `APP_PASSWORD` kosong — fallback `DEV_BIMKIM` dihapus. |
| `src/app/api/auth/logout/route.js` *(baru)* | Menghapus cookie sesi. |
| `src/lib/appAuth.js` *(baru)* | Ambil password master dari header `x-app-password` atau body JSON — **tidak pernah** dari query string. |
| 3 route DELETE + 3 halaman klien | Migrasi password ke header. |
| `src/components/Navbar.js` | Tombol "Keluar". |
| `scripts/test_session.mjs` *(baru)* | Self-check jalur sesi: token forged / tampered / expired / malformed semuanya ditolak. |

### 3.2 Akurasi scanner — commit `5153f95`

| Area | Perubahan |
|---|---|
| Klasifikasi endpoint | 405 / 404 / redirect / HTML ⇒ **bukan** handler kredensial ⇒ tidak boleh dilaporkan rate-limit/CSRF. Probe baseline yang gagal ⇒ status *unknown*, bukan default 401. |
| CSRF | Diverifikasi nyata: kirim POST cross-origin (`Origin` + `Sec-Fetch-Site`); 403/401 = proteksi aktif. Token yang tidak ada saja tidak lagi jadi temuan. |
| Rate limit | Hanya **429** = throttle (403 = blokir WAF/CSRF, kontrol berbeda). Burst 8 request supaya limiter 5-per-window benar-benar terpicu. |
| Discovery endpoint | Handler auth API ada di **JS bundle**, bukan HTML ⇒ probe kandidat umum + **differential probing** vs path acak (path yang responsnya sama dengan path acak = tidak ada). |
| ATO assessment | Validasi kandidat endpoint sebelum diaudit; hanya vektor terverifikasi yang dilaporkan; **CRITICAL** hanya dengan kompromi terverifikasi. |
| Stress engine | Pisahkan 4xx (rejection) dari 5xx/timeout (kegagalan server). Hilang "100% error rate" & "latensi 0.44x lebih lambat" (padahal lebih cepat). |
| IP exposure | `x-forwarded-for`/`x-real-ip` = IP **klien**; kandidat WebRTC STUN = IP **browser**, bukan origin. Keduanya bukan kebocoran origin ⇒ temuan "WAF bypass" palsu hilang. |
| Proxy | Nilai `.env` sering diapit tanda kutip ⇒ URL proxy invalid. Strip kutip, `timeoutMs` pakai AbortController sungguhan, fallback ke koneksi langsung dengan **signal baru** (fallback lama memakai signal caller yang sudah ter-abort lalu ikut gagal), redaksi kredensial di log, dan **circuit breaker** agar proxy mati dilewati (bukan timeout di tiap request). |

---

## 4. Verifikasi

Semua dijalankan di repo ini, bukan asumsi.

**Build & mutu**
```
next build           → Compiled successfully
eslint src/          → 21 problems, IDENTIK dengan commit asal (nol error baru)
node scripts/test_session.mjs → SEMUA LOLOS (9 assertion)
```

**Smoke test end-to-end** (server lokal, build final)

| Uji | Hasil |
|---|---|
| `Cookie: auth_token=true` → `/api/history` | **401** (sebelumnya 200 + data) |
| `Cookie: auth_token=true` → `/` | **307** |
| `/api/scraper/x.png`, `/api/sherlock/x.jpg` (tanpa auth) | **401** |
| Login dengan password benar | **200**, cookie `auth_token=1793256395905.<nonce>.<sig>` |
| Akses dengan token valid | **200** |
| `POST` cross-origin (`Origin: https://attacker.example`) | **403** |
| `DELETE` dengan `x-app-password` header | **200** |
| `DELETE` dengan `?password=` (cara lama) | **401** (sudah tidak diterima) |
| `POST /api/auth/logout` | **200** |

**Unit test scanner** terhadap produksi

| Path | Handler kredensial? | CSRF | Rate limit |
|---|---|---|---|
| `/login` | ❌ HTTP 405 | — | — |
| `/admin/login` | ❌ HTTP 307 | — | — |
| `/api/auth/login` | ✅ handler asli | ✅ Origin enforced | ✅ 429 terdeteksi |

Semua temuan false-positive di laporan lama hilang.

---

## 5. Temuan operasional

**Pool proxy Webshare mati.** Diverifikasi independen:

```
proxy#1 (p.webshare.io:6361) → 000  11.1s
proxy#2 (p.webshare.io:6014) → 000   3.9s
proxy#3 (p.webshare.io:5611) → 000   6.7s
proxy#4 (p.webshare.io:6185) → 000   3.9s
```

DNS proxy resolve normal (`89.187.161.115`), koneksi ke target netral
(`api.ipify.org`, `example.com`) juga `000` ⇒ **proxy-nya mati**, bukan target
yang memblokir. Akibatnya scanner **tidak pernah benar-benar rotasi IP** — semua
scan dari satu IP egress — dan tiap request membuang 4–11 detik.

Circuit breaker sudah ditambahkan, jadi proxy mati otomatis dilewati. Tapi
`PROXY_LIST` di environment produksi juga perlu dikosongkan atau diperbarui.

**Bug yang ditemukan di log lama:** `PROXY_LIST` di `.env.local` **dibapit tanda
kutip** (`"http://…"`), membuat seluruh URL proxy invalid. Diperbaiki di kedua
modul.

---

## 6. Residual risk & langkah lanjut

| # | Aksi | Status | Catatan |
|---|---|---|---|
| 1 | Rotasi `APP_PASSWORD` di Vercel + `.env.local` | **Belum** | Nilai produksi tidak bisa dibaca dari repo. Produksi masih memakai password lama. |
| 2 | `git push` (2 commit) | **Belum** | `main` = `ahead 2`. Push memicu auto-deploy Vercel. |
| 3 | Kosongkan/perbarui `PROXY_LIST` di Vercel env | **Belum** | `PROXY_LIST` lokal sudah dinonaktifkan (backup `.env.local.bak`). |
| 4 | Scan ulang ke produksi | **Belum** | Untuk membuktikan laporan lama tertutup. |
| 5 | Bersihkan `DEV_BIMKIM` dari riwayat git | **Belum** | Commit `7b003e8`. Perlu `git filter-repo` bila repo pernah publik. |
| 6 | `.env.example` tidak ter-track | **Belum** | `.gitignore:34` (`.env*`) menutupinya → tambah `!/.env.example`. |

**Catatan tambahan**: `SESSION_SECRET` opsional — bila tidak di-set, `APP_PASSWORD`
yang dipakai (rotasi password = logout semua sesi).

---

## 7. Pelajaran yang bisa dipakai ulang

Dokumentasi ini juga disimpan sebagai skill `pentest-report-triage` di Hermes,
karena pola-pola di atas berlaku umum untuk setiap scanner otomatis:

1. **Klasifikasi endpoint sebelum melapor.** 405/404/redirect/HTML bukan handler.
2. **Differential probing** untuk discovery — bandingkan dengan path acak.
3. **Hanya 429 = rate limit.** 403 itu WAF/CSRF, kontrol berbeda.
4. **4xx ≠ crash server.** Pisahkan rejection klien dari 5xx/timeout.
5. **Multiplier < 1 berarti lebih cepat**, bukan "lebih lambat".
6. **`X-Forwarded-For` = IP klien.** Kandidat WebRTC STUN = IP browser.
7. **CRITICAL butuh kompromi terverifikasi**, bukan heuristik (mis. CAPTCHA absen).
8. **Session token harus bertanda tangan** (HMAC + expiry + nonce), bukan literal.
9. **Password lewat header**, bukan query string.
10. **Pengecualian berbasis ekstensi di matcher auth = bypass.**
11. **Cek konsistensi internal laporan**: rating di header vs executive summary.
