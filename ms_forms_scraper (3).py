"""
MS Forms Scraper (v2 - via prefetchFormUrl API)
================================================
Mengambil struktur (judul, deskripsi, daftar pertanyaan, tipe field, pilihan jawaban)
dari sebuah Microsoft Forms publik, berdasarkan link yang diberikan user.

Cara kerja (ditemukan dari inspeksi langsung HTML halaman forms.cloud.microsoft):
1. Buka halaman form (GET biasa, tanpa login).
2. Di dalam HTML ada objek `window.OfficeFormServerInfo` yang berisi field
   "prefetchFormUrl" — ini adalah URL API internal yang dipakai halaman itu
   sendiri untuk mengambil data form, contoh:

   https://forms.cloud.microsoft/formapi/api/{tenantId}/users/{userId}/light/
   runtimeForms('{formId}')?$expand=questions($expand=choices)

3. Script ini mengekstrak URL tersebut dari HTML lalu memanggilnya langsung.
   Responnya adalah JSON asli berisi semua pertanyaan & pilihan jawaban, tanpa
   perlu parsing HTML/JS yang rapuh.

CATATAN PENTING:
- Hanya bekerja untuk form yang bisa diakses publik tanpa login (link "share").
- TIDAK bisa mengambil data RESPONS/jawaban orang lain — itu hanya tersedia
  untuk pemilik form yang login di forms.office.com.
- Kalau Microsoft mengubah nama field/struktur lagi di masa depan, jalankan
  ulang dengan --save-html untuk inspeksi manual.

Instalasi dependency:
    pip install requests --break-system-packages

Pemakaian:
    python ms_forms_scraper.py "https://forms.cloud.microsoft/r/xxxxxxxxxx"
    python ms_forms_scraper.py "https://forms.office.com/r/xxxxxxxxxx" -o hasil.json
"""

import argparse
import json
import re
import sys
from pathlib import Path

import requests

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
}

PREFETCH_URL_PATTERN = re.compile(r'"prefetchFormUrl"\s*:\s*"([^"]+)"')


def fetch_html(session: requests.Session, url: str) -> str:
    resp = session.get(url, headers=HEADERS, timeout=20, allow_redirects=True)
    resp.raise_for_status()
    return resp.text


def unescape_url(raw: str) -> str:
    """URL di dalam HTML di-escape ala JSON/JS (mis. \\u0027 untuk kutip satu)."""
    return json.loads(f'"{raw}"')


def find_prefetch_api_url(html: str):
    match = PREFETCH_URL_PATTERN.search(html)
    if not match:
        return None
    return unescape_url(match.group(1))


def extract_questions(form_json: dict):
    questions = form_json.get("questions") or form_json.get("Questions") or []
    normalized = []
    for q in questions:
        title = q.get("titleFormat") or q.get("title") or q.get("Title") or ""
        if isinstance(title, dict):
            title = title.get("content", "")

        qtype = q.get("questionType") or q.get("QuestionType") or q.get("type") or "unknown"
        required = bool(q.get("required") or q.get("Required") or q.get("isRequired"))

        choices = []
        raw_choices = q.get("choices") or q.get("Choices") or []
        for c in raw_choices:
            if isinstance(c, dict):
                text = c.get("displayText") or c.get("description") or c.get("Description") or c.get("value")
                if text:
                    choices.append(text)
            else:
                choices.append(str(c))

        normalized.append(
            {
                "id": q.get("id") or q.get("Id"),
                "title": title,
                "type": qtype,
                "required": required,
                "choices": choices,
            }
        )
    return normalized


def scrape(url: str, save_html_path: str = None):
    session = requests.Session()
    html = fetch_html(session, url)

    if save_html_path:
        Path(save_html_path).write_text(html, encoding="utf-8")
        print(f"[info] HTML mentah disimpan di: {save_html_path}")

    api_url = find_prefetch_api_url(html)
    if not api_url:
        print(
            "[gagal] Tidak menemukan 'prefetchFormUrl' di HTML halaman.\n"
            "Kemungkinan penyebab: form butuh login, link tidak valid,\n"
            "atau Microsoft mengubah nama field ini.\n"
            "Coba jalankan ulang dengan --save-html untuk memeriksa HTML mentahnya."
        )
        return None

    api_resp = session.get(api_url, headers=HEADERS, timeout=20)

    # Selalu simpan respons mentah API untuk debugging, apapun hasilnya.
    raw_api_path = "api_raw_response.json"
    Path(raw_api_path).write_text(api_resp.text, encoding="utf-8")
    print(f"[info] Respons mentah API disimpan di: {raw_api_path} (status HTTP: {api_resp.status_code})")

    if api_resp.status_code != 200:
        print(f"[gagal] Request ke API form gagal, status: {api_resp.status_code}")
        print(f"URL API yang dicoba: {api_url}")
        return None

    try:
        form_json = api_resp.json()
    except json.JSONDecodeError:
        print("[gagal] Respons API bukan JSON valid. Isi respons (dipotong):")
        print(api_resp.text[:500])
        return None

    title = form_json.get("title") or form_json.get("Title")
    description = form_json.get("description") or form_json.get("Description")
    questions = extract_questions(form_json)

    return {
        "url": url,
        "api_url": api_url,
        "title": title,
        "description": description,
        "jumlah_pertanyaan": len(questions),
        "pertanyaan": questions,
    }


def main():
    parser = argparse.ArgumentParser(description="Scraper struktur Microsoft Forms publik")
    parser.add_argument("url", help="Link form Microsoft Forms (mis. https://forms.office.com/r/xxxx)")
    parser.add_argument("-o", "--output", default="hasil_form.json", help="Path file JSON output")
    parser.add_argument("--save-html", dest="save_html", default=None, help="Simpan HTML mentah untuk debugging")
    args = parser.parse_args()

    try:
        result = scrape(args.url, save_html_path=args.save_html)
    except requests.RequestException as e:
        print(f"[error] Gagal mengakses URL: {e}")
        sys.exit(1)

    if result is None:
        sys.exit(1)

    Path(args.output).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[sukses] Disimpan ke: {args.output}")
    print(f"Judul form : {result['title']}")
    print(f"Jumlah pertanyaan: {result['jumlah_pertanyaan']}")
    for i, q in enumerate(result["pertanyaan"], 1):
        wajib = "wajib" if q["required"] else "opsional"
        print(f"  {i}. [{q['type']}, {wajib}] {q['title']}")
        for c in q["choices"]:
            print(f"       - {c}")


if __name__ == "__main__":
    main()
