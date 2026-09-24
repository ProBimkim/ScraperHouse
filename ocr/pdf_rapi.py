#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
pdf_rapi.py — ubah PDF soal "berantakan" (1 soal = 1 halaman gambar) menjadi PDF rapi
berisi teks penuh (bisa dicari), lengkap dengan indeks, bookmark, dan rekap kunci.

Alur:  PDF gambar --(render)--> gambar per halaman --(Claude vision)--> JSON soal --(reportlab)--> PDF rapi

Pemakaian cepat:
    export ANTHROPIC_API_KEY="sk-ant-..."          # Windows PowerShell: $env:ANTHROPIC_API_KEY="sk-ant-..."
    python pdf_rapi.py soal.pdf                    # hasil: soal_rapi.pdf (+ soal_rapi.json untuk dikoreksi)
    python pdf_rapi.py soal.pdf -o hasil.pdf --model claude-haiku-4-5-20251001   # lebih murah
    python pdf_rapi.py --dari-json soal_rapi.json -o hasil.pdf                    # susun ulang tanpa API (setelah koreksi JSON)
"""
import argparse, base64, io, json, os, re, sys, tempfile, time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed

# ───────────────────────────── 1. EKSTRAKSI (PDF gambar → data soal) ─────────────────────────────

MODEL_DEFAULT = "claude-sonnet-5"

TOOL = {
    "name": "simpan_halaman",
    "description": "Simpan hasil transkripsi satu halaman PDF soal.",
    "input_schema": {
        "type": "object",
        "properties": {
            "tipe": {"type": "string", "enum": ["soal", "lainnya"],
                     "description": "'soal' bila halaman berisi soal dengan pernyataan bercentang (☐). "
                                    "'lainnya' untuk daftar nama siswa, pilihan kelas/nomor absen, halaman kosong, dsb."},
            "intro": {"type": "string", "description": "Teks pengantar soal (sebelum daftar pernyataan ☐), TANPA kalimat instruksi 'Berilah tanda centang...'."},
            "instruksi_centang": {"type": "boolean", "description": "True bila ada kalimat 'Berilah tanda centang (☐) pada setiap pernyataan yang benar...'."},
            "pernyataan": {"type": "array", "items": {"type": "string"},
                           "description": "Isi tiap pernyataan ☐ sesuai urutan, tanpa simbol kotak dan tanpa nomor."},
            "catatan": {"type": "string", "description": "Teks di kotak kuning 'CATATAN' apa adanya (mis. 'benar semua', '1 2 3 4', 'Pernyataan 1, 3'). Kosong bila tidak ada."},
            "halaman_asli": {"type": "integer", "description": "Angka X dari footer 'Halaman X dari N'. 0 bila tidak ada."},
            "judul_footer": {"type": "string", "description": "Teks judul di footer kiri (mis. 'ULANGAN DIMENSI TIGA (XII 1)'). Kosong bila tidak ada."},
        },
        "required": ["tipe", "intro", "instruksi_centang", "pernyataan", "catatan", "halaman_asli", "judul_footer"],
    },
}

PROMPT = """Ini satu halaman PDF hasil scrape soal ujian (matematika, dimensi tiga). Transkripsikan isinya dengan memanggil tool `simpan_halaman`.

Aturan transkripsi:
- Salin teks PERSIS seperti tertulis. Jangan menyelesaikan, memperbaiki, atau menilai soal.
- Rumus jadi teks Unicode biasa: akar → √ (contoh 6√3, 2√39, 1/√13), pecahan → (a/b) (contoh (9/2)√6, (1/3)√3), derajat → °, pangkat → ² ³, minus → −, kali → ×, titik → ·, teta → θ, sudut → ∠.
- Vektor huruf kecil (u, v, n) ditulis ~u, ~v, ~n. Vektor dari dua titik ditulis "vektor AB" (mis. "vektor BD = (−2, 2, 0)"). Panjang vektor: |~n|.
- Koordinat ditulis dengan spasi setelah koma: (0, 0, 6).
- Teks rata kiri-kanan sering terpotong tanda hubung di akhir baris (mis. "ten-gah", "se-gitiga"): gabungkan kembali jadi satu kata utuh.
- "intro" = teks sebelum daftar kotak ☐. Kalimat "Berilah tanda centang (☐)..." TIDAK dimasukkan ke intro; cukup set instruksi_centang=true.
- "pernyataan" = isi tiap baris ☐ berurutan, tanpa simbol kotak dan tanpa nomor. Pilihan jawaban "Pernyataan 1..5" di bawahnya JANGAN dimasukkan.
- "catatan" = teks di dalam kotak kuning CATATAN, apa adanya.
- Abaikan watermark abu-abu besar dan simbol titik/garis liar di tepi.
- Bila halaman bukan soal (daftar nama siswa, pilihan kelas, nomor absen, kosong), isi tipe='lainnya' dan sisanya kosong/[]/0."""


def render_pages(pdf_path, scale=1.6):
    """Render tiap halaman PDF jadi gambar PIL (butuh: pip install pypdfium2 pillow)."""
    import pypdfium2 as pdfium
    pdf = pdfium.PdfDocument(pdf_path)
    for i in range(len(pdf)):
        yield i + 1, pdf[i].render(scale=scale).to_pil().convert("RGB")


def _jpeg_b64(img, max_side=1600, quality=88):
    w, h = img.size
    if max(w, h) > max_side:
        r = max_side / max(w, h)
        img = img.resize((int(w * r), int(h * r)))
    buf = io.BytesIO(); img.save(buf, "JPEG", quality=quality)
    return base64.standard_b64encode(buf.getvalue()).decode()


def panggil_claude(client, model, img, retries=4):
    last = None
    for k in range(retries):
        try:
            r = client.messages.create(
                model=model, max_tokens=2500, tools=[TOOL],
                tool_choice={"type": "tool", "name": TOOL["name"]},
                messages=[{"role": "user", "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": _jpeg_b64(img)}},
                    {"type": "text", "text": PROMPT}]}])
            for b in r.content:
                if b.type == "tool_use":
                    return b.input
            last = "respons tanpa tool_use"
        except Exception as e:  # rate limit / jaringan
            last = repr(e)
        time.sleep(2 ** k)
    raise RuntimeError(last)


def ekstrak(pdf_path, model, cache_dir, workers=4, ulang=False, hanya=None):
    """Kembalikan list hasil mentah per halaman (urut halaman PDF). Hasil di-cache per halaman."""
    import anthropic
    if not os.environ.get("ANTHROPIC_API_KEY"):
        sys.exit("ANTHROPIC_API_KEY belum diset. Buat di https://console.anthropic.com lalu set sebagai environment variable.")
    client = anthropic.Anthropic(max_retries=3)
    os.makedirs(cache_dir, exist_ok=True)
    pages = [(n, img) for n, img in render_pages(pdf_path) if not hanya or n in hanya]
    hasil, gagal = {}, []

    def kerja(n, img):
        f = os.path.join(cache_dir, f"hal_{n:03d}.json")
        if os.path.exists(f) and not ulang:
            return n, json.load(open(f, encoding="utf-8")), True
        d = panggil_claude(client, model, img)
        json.dump(d, open(f, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        return n, d, False

    with ThreadPoolExecutor(workers) as ex:
        futs = {ex.submit(kerja, n, img): n for n, img in pages}
        for k, fu in enumerate(as_completed(futs), 1):
            n = futs[fu]
            try:
                n, d, dari_cache = fu.result(); hasil[n] = d
                print(f"[{k}/{len(pages)}] hal. PDF {n}: {d.get('tipe')}{' (cache)' if dari_cache else ''}")
            except Exception as e:
                gagal.append(n); print(f"[{k}/{len(pages)}] hal. PDF {n}: GAGAL {e}", file=sys.stderr)
    if gagal:
        print(f"\n⚠ Halaman gagal: {sorted(gagal)} — jalankan ulang perintah yang sama, halaman lain diambil dari cache.", file=sys.stderr)
    return [(n, hasil[n]) for n in sorted(hasil)]


# ───────────────────────────── 2. PEMBERSIHAN, KUNCI, TOPIK ─────────────────────────────

def parse_kunci(catatan, n):
    """'benar semua' → semua; '1 2 4' / 'Pernyataan 1, 2, 4' / '1 saja' → daftar nomor. None bila tak terbaca."""
    t = (catatan or "").lower()
    if re.search(r"semua", t):
        return list(range(1, n + 1))
    nums = sorted({int(x) for x in re.findall(r"\d+", t) if 1 <= int(x) <= n})
    return nums or None


def _bersih(s):
    s = re.sub(r"^\s*(?:[☐□]|\d+[.)])\s*", "", s.strip())
    s = re.sub(r"(?<=\w)-\s+(?=[a-z])", "", s)  # sisa tanda hubung akhir baris
    return re.sub(r"\s+", " ", s)


def klasifikasi(intro, st, chk):
    """Label topik bantu untuk indeks. Kembalikan string 'Utama · Tambahan · ...'."""
    teks = (intro + " " + " ".join(st)).lower()
    il = intro.lower()
    if re.search(r"bidang pemotong|irisan|penampang", teks):
        utama = "Irisan bidang"
    elif re.search(r"mencari (besar )?sudut|perhatikan sudut|sudut pertemuan|perhatikan bidang \w+ dan bidang", il):
        utama = "Sudut"
    elif re.search(r"mencari jarak|jarak antara|lintasan terpendek|jarak terdekat", il):
        utama = "Jarak"
    elif re.search(r"koordinat|sumbu", il):
        utama = "Koordinat"
    else:
        sk = {
            "Proyeksi": len(re.findall(r"proyeksi", teks)),
            "Jarak": len(re.findall(r"jarak|panjang", teks)) if all("jarak" in s.lower() for s in st) else len(re.findall(r"jarak", teks)),
            "Sudut": len(re.findall(r"sudut", teks)),
            "Koordinat": len(re.findall(r"koordinat|oktan", teks)),
            "Kedudukan": len(re.findall(r"sejajar|tegak lurus|berpotongan|bersilangan|terletak|menembus|melewati", teks)),
        }
        utama = max(sk, key=lambda k: (sk[k], list(sk).index(k) * -1))
    tag = [utama]
    if "vektor" in teks and utama != "Irisan bidang": tag.append("Vektor")
    if chk: tag.append("Soal cerita")
    return " · ".join(tag)


def susun_soal(hasil):
    """Ubah hasil mentah per halaman → (list soal, judul_footer)."""
    soal, judul, peringatan = [], Counter(), []
    for n, d in hasil:
        if d.get("judul_footer"): judul[d["judul_footer"].strip()] += 1
        if d.get("tipe") != "soal": continue
        st = [_bersih(s) for s in d.get("pernyataan", []) if s.strip()]
        if not st:
            peringatan.append(f"hal. PDF {n}: tidak ada pernyataan terbaca"); continue
        intro = _bersih(d.get("intro", ""))
        chk = bool(d.get("instruksi_centang"))
        key = parse_kunci(d.get("catatan", ""), len(st))
        if key is None: peringatan.append(f"hal. PDF {n}: kunci tidak terbaca (catatan={d.get('catatan')!r})")
        soal.append(dict(p=d.get("halaman_asli") or n, t=klasifikasi(intro, st, chk), intro=intro, st=st, key=key, chk=chk,
                         catatan=d.get("catatan", ""), pdf_hal=n))
    return soal, (judul.most_common(1)[0][0] if judul else ""), peringatan


# ───────────────────────────── 3. PEMBUAT PDF RAPI ─────────────────────────────

def cari_font():
    """Cari DejaVu Sans (butuh karakter ☑ ✓ √ θ ∠ ⃗). Urutan: env FONT_DIR, folder umum, bawaan matplotlib."""
    kandidat = [os.environ.get("FONT_DIR", ""), "/usr/share/fonts/truetype/dejavu", "/usr/share/fonts/dejavu",
                "/usr/share/fonts/TTF", "/Library/Fonts", os.path.expanduser("~/Library/Fonts"),
                os.path.expanduser("~/.fonts"), "C:\\Windows\\Fonts"]
    try:
        import matplotlib; kandidat.append(os.path.join(matplotlib.get_data_path(), "fonts", "ttf"))
    except Exception:
        pass
    for d in kandidat:
        if d and all(os.path.exists(os.path.join(d, f)) for f in
                     ("DejaVuSans.ttf", "DejaVuSans-Bold.ttf", "DejaVuSans-Oblique.ttf", "DejaVuSans-BoldOblique.ttf")):
            return d
    sys.exit("Font DejaVu Sans tidak ditemukan. Cara termudah: `pip install matplotlib` (membawa font DejaVu), "
             "atau unduh DejaVu Sans lalu set FONT_DIR=folder_font.")


def bangun_pdf(soal, out_path, judul="Kumpulan Soal", subjudul="Kumpulan soal & catatan kunci", footer=None):
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib import colors
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table,
                                    TableStyle, KeepTogether, PageBreak, Flowable)
    from reportlab.pdfgen import canvas as rl_canvas

    fd = cari_font()
    for nm, fn in (("DV", "DejaVuSans"), ("DV-B", "DejaVuSans-Bold"), ("DV-I", "DejaVuSans-Oblique"), ("DV-BI", "DejaVuSans-BoldOblique")):
        pdfmetrics.registerFont(TTFont(nm, os.path.join(fd, fn + ".ttf")))
    pdfmetrics.registerFontFamily("DV", normal="DV", bold="DV-B", italic="DV-I", boldItalic="DV-BI")

    NAVY, GREY, LINE = colors.HexColor("#1F3A5F"), colors.HexColor("#6B7280"), colors.HexColor("#CBD5E1")
    LIGHT, GREEN, GREENBG = colors.HexColor("#EEF3F9"), colors.HexColor("#15803D"), colors.HexColor("#E8F5EC")
    footer = footer or judul
    n = len(soal)
    W = A4[0] - 32 * mm

    def S(name, **kw):
        b = dict(fontName="DV", fontSize=9.5, leading=14, textColor=colors.HexColor("#111827")); b.update(kw)
        return ParagraphStyle(name, **b)
    sBody, sSmall = S("b"), S("s", fontSize=8, leading=11, textColor=GREY)
    sTitle = S("t", fontName="DV-B", fontSize=22, leading=28, textColor=NAVY)
    sSub = S("sub", fontSize=10.5, leading=15, textColor=GREY)
    sH1 = S("h1", fontName="DV-B", fontSize=14, leading=18, textColor=NAVY, spaceBefore=6, spaceAfter=6)
    sCell, sCellB = S("c", fontSize=8.3, leading=11), S("cb", fontName="DV-B", fontSize=8.3, leading=11, textColor=colors.white)
    sHead = S("h", fontName="DV-B", fontSize=10, leading=13, textColor=colors.white)
    sHeadR = S("hr", fontSize=8, leading=13, textColor=colors.HexColor("#DCE6F2"), alignment=2)
    sIntro, sInstr = S("i", fontSize=9.6, leading=14.5), S("in", fontName="DV-I", fontSize=8.5, leading=12, textColor=GREY)
    sStmt, sKey = S("st", fontSize=9.6, leading=14), S("k", fontName="DV-B", fontSize=9.2, leading=13, textColor=GREEN)

    def fx(t):
        t = t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        return re.sub(r"~([uvn])", lambda m: m.group(1) + "\u20d7", t)

    def keytext(q, short=False):
        k, m = q["key"], len(q["st"])
        if k is None: return "—" if short else "tidak ada catatan / tidak terbaca"
        if k == list(range(1, m + 1)): return f"Semua (1–{m})" if short else f"Semua pernyataan benar (1–{m})"
        s = ", ".join(map(str, k)); return s if short else f"Pernyataan {s}"

    def ringkas(q):
        intro = q["intro"]; sents = [x.strip() for x in re.split(r"(?<=\.) (?=[A-Z])", intro)]
        goal = next((x for x in sents if "mencari" in x), None)
        if goal: s = re.sub(r"^Diketahui ", "", sents[0]).rstrip(".") + " → " + re.sub(r"^.*?mencari ", "", goal).rstrip(".")
        elif len(intro) <= 80: s = intro + " — " + q["st"][0]
        else: s = intro
        return s if len(s) <= 120 else s[:117].rstrip() + "…"

    tags = lambda q: [t.strip() for t in q["t"].split("·")]
    link = lambda no: f'<a href="#q{no}" color="#2B6CB0">{no}</a>'
    PAGES = {}

    class Anchor(Flowable):
        def __init__(self, key, title=None, level=0, num=None):
            super().__init__(); self.key, self.title, self.level, self.num = key, title, level, num
        def wrap(self, w, h): return (0, 0)
        def draw(self):
            c = self.canv; c.bookmarkHorizontal(self.key, 0, 14)
            if self.title: c.addOutlineEntry(self.title, self.key, self.level, 0)
            if self.num: PAGES[self.num] = c.getPageNumber()

    class NumCanvas(rl_canvas.Canvas):
        def __init__(self, *a, **k): super().__init__(*a, **k); self._saved = []
        def showPage(self): self._saved.append(dict(self.__dict__)); self._startPage()
        def save(self):
            tot = len(self._saved)
            for st in self._saved:
                self.__dict__.update(st)
                w, h = A4
                self.setStrokeColor(LINE); self.setLineWidth(0.5); self.line(16*mm, 13*mm, w-16*mm, 13*mm)
                self.setFont("DV", 7.5); self.setFillColor(GREY)
                self.drawString(16*mm, 8.5*mm, footer); self.drawRightString(w-16*mm, 8.5*mm, f"Halaman {self._pageNumber} dari {tot}")
                super().showPage()
            super().save()

    def card(i, q):
        no = i + 1
        head = Table([[Paragraph(f"<b>Soal {no}</b>", sHead), Paragraph(f"{fx(q['t'])} &nbsp;·&nbsp; hal. asli {q['p']}", sHeadR)]], colWidths=[W*.25, W*.75])
        head.setStyle(TableStyle([("BACKGROUND", (0,0), (-1,-1), NAVY), ("VALIGN", (0,0), (-1,-1), "MIDDLE"), ("LEFTPADDING", (0,0), (-1,-1), 8),
                                  ("RIGHTPADDING", (0,0), (-1,-1), 8), ("TOPPADDING", (0,0), (-1,-1), 5), ("BOTTOMPADDING", (0,0), (-1,-1), 5)]))
        intro = [Paragraph(fx(q["intro"]), sIntro)]
        if q["chk"]: intro += [Spacer(1, 2), Paragraph("Berilah tanda centang (☐) pada setiap pernyataan yang benar berikut ini!", sInstr)]
        rows = []
        for j, s in enumerate(q["st"], 1):
            ok = q["key"] is not None and j in q["key"]
            mk = Paragraph(f'<font color="{"#15803D" if ok else "#9CA3AF"}" size="12">{"☑" if ok else "☐"}</font>', sStmt)
            rows.append([mk, Paragraph(f"<b>{j}.</b>", sStmt), Paragraph(fx(s), sStmt)])
        st = Table(rows, colWidths=[9*mm, 6*mm, W - 15*mm - 16])
        st.setStyle(TableStyle([("VALIGN", (0,0), (-1,-1), "TOP"), ("TOPPADDING", (0,0), (-1,-1), 2.2), ("BOTTOMPADDING", (0,0), (-1,-1), 2.2),
                                ("LEFTPADDING", (0,0), (-1,-1), 0), ("RIGHTPADDING", (0,0), (-1,-1), 0)]))
        body = Table([[intro], [st], [Paragraph(f"✓ Kunci (catatan): {keytext(q)}", sKey)]], colWidths=[W])
        body.setStyle(TableStyle([("BOX", (0,0), (-1,-1), .6, LINE), ("LEFTPADDING", (0,0), (-1,-1), 9), ("RIGHTPADDING", (0,0), (-1,-1), 9),
                                  ("TOPPADDING", (0,0), (0,0), 8), ("TOPPADDING", (0,1), (0,1), 4), ("BOTTOMPADDING", (0,0), (0,0), 2),
                                  ("BACKGROUND", (0,2), (0,2), GREENBG), ("TOPPADDING", (0,2), (0,2), 5), ("BOTTOMPADDING", (0,2), (0,2), 5)]))
        return KeepTogether([Anchor(f"q{no}", f"Soal {no} — {q['t']}", 1, no), head, body, Spacer(1, 9)])

    def tabel(rows, widths, pad=3):
        t = Table(rows, colWidths=widths, repeatRows=1)
        t.setStyle(TableStyle([("BACKGROUND", (0,0), (-1,0), NAVY), ("VALIGN", (0,0), (-1,-1), "TOP"),
                               ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, LIGHT]), ("LINEBELOW", (0,0), (-1,-1), .3, LINE),
                               ("TOPPADDING", (0,0), (-1,-1), pad), ("BOTTOMPADDING", (0,0), (-1,-1), pad)]))
        return t

    def build(path):
        doc = BaseDocTemplate(path, pagesize=A4, leftMargin=16*mm, rightMargin=16*mm, topMargin=16*mm, bottomMargin=19*mm,
                              title=f"{judul} — Kumpulan Soal", author=judul, subject=f"{n} soal")
        doc.addPageTemplates([PageTemplate(id="p", frames=[Frame(16*mm, 19*mm, W, A4[1]-35*mm, leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)])])
        story = [Anchor("top", "Indeks per topik", 0), Paragraph(fx(judul), sTitle), Paragraph(fx(subjudul), sSub), Spacer(1, 6)]
        info = Table([[Paragraph(
            f"<b>{n} soal</b> pilihan ganda kompleks (centang semua pernyataan yang benar), lengkap dengan <b>catatan kunci</b> dari file asli. "
            'Pernyataan yang benar menurut kunci ditandai <font color="#15803D">☑</font>, yang salah <font color="#9CA3AF">☐</font>. '
            'Notasi vektor memakai tanda panah (u⃗, v⃗, n⃗); vektor dari dua titik ditulis "vektor AB". '
            "Semua teks bisa dicari (Ctrl+F), nomor di indeks bisa diklik, dan bookmark tersedia di panel samping PDF.", sBody)]], colWidths=[W])
        info.setStyle(TableStyle([("BACKGROUND", (0,0), (-1,-1), LIGHT), ("LEFTPADDING", (0,0), (-1,-1), 10), ("RIGHTPADDING", (0,0), (-1,-1), 10),
                                  ("TOPPADDING", (0,0), (-1,-1), 8), ("BOTTOMPADDING", (0,0), (-1,-1), 8)]))
        story += [info, Spacer(1, 12), Paragraph("Indeks per topik", sH1)]
        rows = [[Paragraph("Topik", sCellB), Paragraph("Nomor soal (klik untuk loncat)", sCellB)]]
        semua_tag = list(dict.fromkeys(t for q in soal for t in tags(q)))
        urut = ["Jarak", "Proyeksi", "Sudut", "Koordinat", "Kedudukan", "Irisan bidang", "Vektor", "Soal cerita"]
        for t in sorted(semua_tag, key=lambda x: (urut.index(x) if x in urut else 99, x)):
            nums = [i + 1 for i, q in enumerate(soal) if t in tags(q)]
            rows.append([Paragraph(f"<b>{fx(t)}</b> ({len(nums)})", sCell), Paragraph(", ".join(link(x) for x in nums), sCell)])
        story += [tabel(rows, [W*.30, W*.70], 4), Spacer(1, 6),
                  Paragraph("Catatan: topik adalah label bantu untuk pencarian (dibuat otomatis). Halaman identitas (nama siswa, kelas, nomor absen) dan halaman kosong tidak disertakan.", sSmall),
                  PageBreak(), Anchor("toc", "Daftar soal", 0), Paragraph("Daftar soal", sH1)]
        rows = [[Paragraph(x, sCellB) for x in ("No", "Topik", "Ringkasan soal", "Kunci", "Hal.")]]
        for i, q in enumerate(soal):
            rows.append([Paragraph(f"<b>{link(i+1)}</b>", sCell), Paragraph(fx(q["t"]), sCell), Paragraph(fx(ringkas(q)), sCell),
                         Paragraph(keytext(q, True), sCell), Paragraph(str(PAGES.get(i + 1, "")), sCell)])
        story += [tabel(rows, [W*.06, W*.17, W*.52, W*.17, W*.08]), PageBreak(), Anchor("soal", "Soal", 0), Paragraph("Soal", sH1)]
        story += [card(i, q) for i, q in enumerate(soal)]
        story += [PageBreak(), Anchor("rekap", "Rekap kunci jawaban", 0), Paragraph("Rekap kunci jawaban", sH1),
                  Paragraph("Nomor pernyataan yang benar menurut catatan pada file asli. Klik nomor soal untuk loncat.", sSmall), Spacer(1, 6)]
        cols = 3; per = -(-n // cols)
        grid = [[Paragraph(f"<b>{link(c*per+r+1)}.</b> {keytext(soal[c*per+r], True)}", sCell) if c*per+r < n else "" for c in range(cols)] for r in range(per)]
        g = Table(grid, colWidths=[W / cols] * cols)
        g.setStyle(TableStyle([("ROWBACKGROUNDS", (0,0), (-1,-1), [colors.white, LIGHT]), ("LINEBELOW", (0,0), (-1,-1), .3, LINE),
                               ("TOPPADDING", (0,0), (-1,-1), 3.5), ("BOTTOMPADDING", (0,0), (-1,-1), 3.5)]))
        story.append(g)
        doc.build(story, canvasmaker=NumCanvas)

    # dua putaran: putaran 1 mencatat nomor halaman tiap soal, putaran 2 menulisnya di daftar soal
    with tempfile.TemporaryDirectory() as td:
        build(os.path.join(td, "pass1.pdf"))
    build(out_path)


# ───────────────────────────── 4. CLI ─────────────────────────────

def judul_cantik(s):
    s = s.title()
    return re.sub(r"\(([^)]*)\)", lambda m: "(" + m.group(1).upper() + ")", s)


def main():
    ap = argparse.ArgumentParser(description="PDF soal berantakan (gambar) → PDF rapi (teks, bisa dicari).")
    ap.add_argument("pdf", nargs="?", help="PDF sumber (1 soal per halaman, berbasis gambar)")
    ap.add_argument("-o", "--output", help="PDF hasil (default: <nama>_rapi.pdf)")
    ap.add_argument("--dari-json", help="lewati ekstraksi; susun PDF dari file JSON soal (hasil koreksi manual)")
    ap.add_argument("--model", default=MODEL_DEFAULT, help=f"model Claude untuk baca gambar (default {MODEL_DEFAULT}; murah: claude-haiku-4-5-20251001)")
    ap.add_argument("--workers", type=int, default=4, help="jumlah permintaan paralel (default 4)")
    ap.add_argument("--ulang", action="store_true", help="abaikan cache, baca ulang semua halaman")
    ap.add_argument("--halaman", help="hanya halaman PDF tertentu, mis. 1-5,9 (berguna untuk uji coba)")
    ap.add_argument("--judul", help="judul di sampul (default: dari footer PDF)")
    ap.add_argument("--subjudul", default="Kumpulan soal & catatan kunci")
    a = ap.parse_args()

    if a.dari_json:
        data = json.load(open(a.dari_json, encoding="utf-8"))
        soal, judul_footer = data["soal"], data.get("judul_footer", "")
        out = a.output or os.path.splitext(a.dari_json)[0] + ".pdf"
    else:
        if not a.pdf: ap.error("berikan file PDF, atau pakai --dari-json")
        base = os.path.splitext(a.pdf)[0]
        out = a.output or base + "_rapi.pdf"
        hanya = None
        if a.halaman:
            hanya = set()
            for part in a.halaman.split(","):
                lo, _, hi = part.partition("-"); hanya |= set(range(int(lo), int(hi or lo) + 1))
        hasil = ekstrak(a.pdf, a.model, base + "_cache", a.workers, a.ulang, hanya)
        soal, judul_footer, warn = susun_soal(hasil)
        for w in warn: print("⚠", w, file=sys.stderr)
        json.dump({"judul_footer": judul_footer, "soal": soal}, open(os.path.splitext(out)[0] + ".json", "w", encoding="utf-8"),
                  ensure_ascii=False, indent=1)
    if not soal: sys.exit("Tidak ada soal yang terbaca.")
    judul = a.judul or (judul_cantik(judul_footer) if judul_footer else "Kumpulan Soal")
    bangun_pdf(soal, out, judul=judul, subjudul=a.subjudul, footer=judul_footer or judul)
    print(f"\n✓ {len(soal)} soal → {out}")


if __name__ == "__main__":
    main()
