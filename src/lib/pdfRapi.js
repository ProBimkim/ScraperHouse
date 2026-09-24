/**
 * pdfRapi.js — Konversi logika pdf_rapi.py ke JavaScript (client-side)
 *
 * Menghasilkan PDF rapi dari data soal hasil scraping ScraperHouse.
 * Fitur: cover page, indeks topik, daftar soal, kartu soal dengan
 * jawaban AI, rekap kunci, footer halaman.
 *
 * Alur: data scraper → klasifikasi topik → jsPDF → PDF rapi
 *
 * Semua proses otomatis (regex + logika programatik), tanpa API AI.
 */

// ═══════════════════════════════════════════════════════════════
// 1. KONSTANTA WARNA (dari pdf_rapi.py)
// ═══════════════════════════════════════════════════════════════

const COLORS = {
  NAVY:    [31, 58, 95],
  GREY:    [107, 114, 128],
  LINE:    [203, 213, 225],
  LIGHT:   [238, 243, 249],
  GREEN:   [21, 128, 61],
  GREENBG: [232, 245, 236],
  WHITE:   [255, 255, 255],
  BLACK:   [17, 25, 39],
  AMBER:   [180, 83, 9],
  AMBERBG: [255, 251, 235],
  LINK:    [43, 108, 176],
  TEAL:    [15, 118, 110],
  DKGREEN: [20, 83, 45],
};

const PAGE = { W: 210, H: 297, M: 16, BM: 19 };
PAGE.CW = PAGE.W - 2 * PAGE.M; // 178mm

// ═══════════════════════════════════════════════════════════════
// 2. FUNGSI PEMBERSIHAN & KLASIFIKASI (dari pdf_rapi.py)
// ═══════════════════════════════════════════════════════════════

/**
 * Bersihkan teks: hapus checkbox, nomor urut, gabungkan kata terpotong.
 * Adaptasi dari _bersih() di pdf_rapi.py
 */
function cleanText(s) {
  if (!s) return '';
  s = s.trim();
  s = s.replace(/^[\s]*(?:[☐□☑✓✗]|\d+[.)])\s*/, '');
  s = s.replace(/(\w)-\s+([a-z])/g, '$1$2');
  s = s.replace(/\s+/g, ' ');
  return s.trim();
}

/**
 * Klasifikasi topik soal berdasarkan teks (full otomatis, tanpa AI).
 * Adaptasi & perluasan dari klasifikasi() di pdf_rapi.py
 */
function klasifikasiTopik(title, choices) {
  const choiceTexts = (choices || []).map(c =>
    typeof c === 'string' ? c : (c?.text || '')
  );
  const text = ((title || '') + ' ' + choiceTexts.join(' ')).toLowerCase();

  // Matematika geometri dimensi tiga (dari pdf_rapi.py)
  if (/bidang pemotong|irisan|penampang/.test(text)) return 'Irisan Bidang';
  if (/mencari.{0,20}sudut|besar sudut|sudut antara|sudut pertemuan/.test(text)) return 'Sudut';
  if (/mencari.{0,20}jarak|jarak antara|jarak dari|lintasan terpendek/.test(text)) return 'Jarak';
  if (/vektor|proyeksi ortogonal/.test(text)) return 'Vektor';
  if (/koordinat|sumbu.{0,10}(x|y|z)|oktan|absis|ordinat/.test(text)) return 'Koordinat';
  if (/sejajar|tegak lurus|berpotongan|bersilangan/.test(text)) return 'Kedudukan';

  // Geometri umum
  if (/segitiga|persegi|lingkaran|luas|keliling|volume|kubus|balok|prisma|limas|kerucut|tabung|bola|bangun ruang|bangun datar|dimensi tiga/.test(text)) return 'Geometri';

  // Matematika umum
  if (/persamaan|fungsi|grafik|integral|turunan|limit|matriks|determinan|logaritma|eksponen|trigonometri/.test(text)) return 'Matematika';
  if (/aljabar|variabel|polinomial|faktor.{0,10}(prima|persekutuan)/.test(text)) return 'Aljabar';
  if (/statistik|peluang|probabilitas|rata-rata|median|modus|varians|standar deviasi/.test(text)) return 'Statistika';

  // Sains
  if (/biologi|sel|organ|tumbuhan|hewan|ekosistem|genetika|evolusi|fotosintesis|mitosis|meiosis/.test(text)) return 'Biologi';
  if (/fisika|gaya|energi|gerak|listrik|magnet|gelombang|optik|termodinamika|momentum/.test(text)) return 'Fisika';
  if (/kimia|unsur|senyawa|reaksi|atom|molekul|larutan|asam|basa|redoks|mol|molar/.test(text)) return 'Kimia';

  // Sosial
  if (/sejarah|peristiwa|tokoh|masa|era|abad|perang|kemerdekaan|revolusi|proklamasi/.test(text)) return 'Sejarah';
  if (/geografi|iklim|benua|negara|peta|wilayah|penduduk|demografi/.test(text)) return 'Geografi';
  if (/ekonomi|pasar|harga|produksi|konsumsi|inflasi|gdp|permintaan|penawaran/.test(text)) return 'Ekonomi';

  // Bahasa
  if (/bahasa|kalimat|paragraf|teks|puisi|novel|cerpen|sajak|imbuhan|konjungsi|preposisi/.test(text)) return 'Bahasa';

  // Agama
  if (/agama|ibadah|sholat|puasa|zakat|haji|quran|hadits|nabi|rasul|iman|islam/.test(text)) return 'Agama';

  // TIK / Komputer
  if (/komputer|internet|software|hardware|algoritma|pemrograman|database|jaringan/.test(text)) return 'TIK';

  return 'Umum';
}

/**
 * Buat ringkasan singkat soal (maks ~100 karakter).
 * Adaptasi dari ringkas() di pdf_rapi.py
 */
function ringkasQuestion(q) {
  const title = cleanText(q.title || '');
  if (title.length <= 100) return title;
  return title.substring(0, 97).trimEnd() + '...';
}

/** Format huruf pilihan: 0→A, 1→B, dst. */
function choiceLetter(idx) {
  return String.fromCharCode(65 + idx);
}

/** Dapatkan teks jawaban singkat. */
function getAnswerShort(aiAnswer, choices) {
  if (!aiAnswer) return '\u2014'; // em dash
  if (aiAnswer.answerIndex != null && choices && choices.length > 0) {
    return choiceLetter(aiAnswer.answerIndex);
  }
  if (aiAnswer.answer) {
    return aiAnswer.answer.length > 30
      ? aiAnswer.answer.substring(0, 27) + '...'
      : aiAnswer.answer;
  }
  return '\u2014';
}

// ═══════════════════════════════════════════════════════════════
// 3. HELPER PDF DRAWING
// ═══════════════════════════════════════════════════════════════

/** Cek ruang tersisa, tambah halaman baru jika perlu. */
function ensureSpace(doc, y, needed) {
  if (y + needed > PAGE.H - PAGE.BM) {
    doc.addPage();
    return PAGE.M;
  }
  return y;
}

/** Gambar checkbox (grafis vector). */
function drawCheckbox(doc, x, y, checked, size = 3.5) {
  if (checked) {
    doc.setFillColor(...COLORS.GREEN);
    doc.roundedRect(x, y, size, size, 0.5, 0.5, 'F');
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.6);
    doc.line(x + 0.7, y + 1.9, x + 1.5, y + 2.8);
    doc.line(x + 1.5, y + 2.8, x + 2.9, y + 0.8);
  } else {
    doc.setDrawColor(...COLORS.GREY);
    doc.setFillColor(...COLORS.WHITE);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, size, size, 0.5, 0.5, 'FD');
  }
}

/**
 * Tulis teks dengan word-wrap. Return Y akhir.
 * Font harus di-set SEBELUM memanggil fungsi ini (untuk splitTextToSize).
 */
function drawWrappedText(doc, text, x, startY, maxWidth, lineH) {
  const lines = doc.splitTextToSize(text || '', maxWidth);
  let y = startY;
  for (const line of lines) {
    y = ensureSpace(doc, y, lineH + 1);
    doc.text(line, x, y);
    y += lineH;
  }
  return y;
}

// ═══════════════════════════════════════════════════════════════
// 4. IMAGE PRELOADER
// ═══════════════════════════════════════════════════════════════

async function loadImageAsBase64(url) {
  try {
    let cleanUrl = url;
    if (cleanUrl && cleanUrl.includes('res.cloudinary.com')) {
      cleanUrl = cleanUrl.replace(/\/v\d+\//, '/');
    }
    const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(cleanUrl)}`;
    const response = await fetch(proxyUrl);
    if (!response.ok) return null;
    const blob = await response.blob();

    const dataUrl = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
    if (!dataUrl) return null;

    const dims = await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
    if (!dims) return null;

    // Determine format from data URL
    let format = 'JPEG';
    if (dataUrl.startsWith('data:image/png')) format = 'PNG';
    else if (dataUrl.startsWith('data:image/webp')) format = 'WEBP';

    return { dataUrl, w: dims.w, h: dims.h, format };
  } catch {
    return null;
  }
}

async function preloadImages(questions, onProgress) {
  const imageMap = {};
  const urls = [];

  questions.forEach((q, i) => {
    if (q.imageUrl) urls.push({ key: `q_${i}`, url: q.imageUrl });
    (q.choices || []).forEach((c, ci) => {
      if (typeof c === 'object' && c?.imageUrl) {
        urls.push({ key: `q_${i}_c_${ci}`, url: c.imageUrl });
      }
    });
  });

  if (urls.length === 0) return imageMap;

  for (let i = 0; i < urls.length; i++) {
    if (onProgress) onProgress(`Memuat gambar ${i + 1}/${urls.length}...`);
    const img = await loadImageAsBase64(urls[i].url);
    if (img) imageMap[urls[i].key] = img;
  }

  return imageMap;
}

// ═══════════════════════════════════════════════════════════════
// 5. PAGE BUILDERS
// ═══════════════════════════════════════════════════════════════

function buildCoverPage(doc, title, subtitle, classified) {
  const { M, CW, H } = PAGE;
  let y = 45;

  // Decorative accent line
  doc.setDrawColor(...COLORS.NAVY);
  doc.setLineWidth(1);
  doc.line(M, y - 5, M + 55, y - 5);

  // Title
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.NAVY);
  const titleLines = doc.splitTextToSize(title, CW);
  for (const line of titleLines) {
    doc.text(line, M, y);
    y += 10;
  }
  y += 3;

  // Subtitle
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.GREY);
  doc.text(subtitle, M, y);
  y += 16;

  // Info box
  doc.setFillColor(...COLORS.LIGHT);
  doc.roundedRect(M, y, CW, 28, 2, 2, 'F');
  y += 9;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.NAVY);
  doc.text(`${classified.length} Soal`, M + 10, y);
  y += 7;

  doc.setFontSize(8);
  doc.setTextColor(...COLORS.GREY);
  doc.text('Jawaban ditandai berdasarkan analisis otomatis.', M + 10, y);
  y += 4;
  doc.text('Pilihan benar: checkbox hijau.  Pilihan lain: checkbox abu-abu.', M + 10, y);

  // Date
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.GREY);
  const now = new Date();
  const dateStr = now.toLocaleDateString('id-ID', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  }) + ', ' + now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  doc.text(`Dibuat: ${dateStr}`, M, H - 35);

  doc.setFontSize(7);
  doc.text('Dihasilkan oleh ScraperHouse', M, H - 30);
}

function buildTopicIndex(doc, autoTable, classified, topicCounts) {
  doc.addPage();
  let y = PAGE.M;

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.NAVY);
  doc.text('Indeks per Topik', PAGE.M, y + 5);
  y += 14;

  const topicOrder = [
    'Jarak', 'Sudut', 'Koordinat', 'Kedudukan', 'Irisan Bidang',
    'Vektor', 'Geometri', 'Matematika', 'Aljabar', 'Statistika',
    'Fisika', 'Kimia', 'Biologi', 'Bahasa', 'Sejarah', 'Geografi',
    'Ekonomi', 'Agama', 'TIK', 'Umum',
  ];

  const sortedTopics = Object.keys(topicCounts).sort((a, b) => {
    const ia = topicOrder.indexOf(a);
    const ib = topicOrder.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  const tableBody = sortedTopics.map(topic => {
    const nums = classified
      .filter(q => q.topik === topic)
      .map(q => q.index + 1)
      .join(', ');
    return [`${topic} (${topicCounts[topic]})`, nums];
  });

  // Menggunakan autoTable dari jspdf-autotable
  autoTable(doc, {
    startY: y,
    head: [['Topik', 'Nomor Soal']],
    body: tableBody,
    theme: 'grid',
    styles: {
      fontSize: 8.5,
      cellPadding: 4,
      textColor: COLORS.BLACK,
      lineColor: COLORS.LINE,
      lineWidth: 0.3,
    },
    headStyles: {
      fillColor: COLORS.NAVY,
      textColor: COLORS.WHITE,
      fontStyle: 'bold',
      fontSize: 9,
    },
    alternateRowStyles: {
      fillColor: COLORS.LIGHT,
    },
    columnStyles: {
      0: { cellWidth: PAGE.CW * 0.28, fontStyle: 'bold' },
      1: { cellWidth: PAGE.CW * 0.72 },
    },
    margin: { left: PAGE.M, right: PAGE.M },
  });

  y = doc.lastAutoTable.finalY + 8;
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(...COLORS.GREY);
  doc.text(
    'Catatan: topik dibuat otomatis berdasarkan kata kunci dalam soal (tanpa AI).',
    PAGE.M, y
  );
}

function buildQuestionList(doc, autoTable, classified) {
  doc.addPage();
  let y = PAGE.M;

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.NAVY);
  doc.text('Daftar Soal', PAGE.M, y + 5);
  y += 14;

  const tableBody = classified.map(q => [
    String(q.index + 1),
    ringkasQuestion(q),
    getAnswerShort(q.aiAnswer, q.choices),
  ]);

  autoTable(doc, {
    startY: y,
    head: [['No', 'Ringkasan Soal', 'Jawaban']],
    body: tableBody,
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 3,
      textColor: COLORS.BLACK,
      lineColor: COLORS.LINE,
      lineWidth: 0.3,
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: COLORS.NAVY,
      textColor: COLORS.WHITE,
      fontStyle: 'bold',
      fontSize: 8.5,
    },
    alternateRowStyles: {
      fillColor: COLORS.LIGHT,
    },
    columnStyles: {
      0: { cellWidth: PAGE.CW * 0.08, halign: 'center', fontStyle: 'bold' },
      1: { cellWidth: PAGE.CW * 0.74 },
      2: { cellWidth: PAGE.CW * 0.18, halign: 'center', fontStyle: 'bold' },
    },
    margin: { left: PAGE.M, right: PAGE.M },
  });
}

/**
 * Tambah gambar ke PDF, menghitung skala otomatis.
 * Return Y setelah gambar.
 */
function addImageToPdf(doc, imgData, y, maxW, maxH, ocrText = null) {
  let imgW = imgData.w * 0.264583; // px → mm (96dpi)
  let imgH = imgData.h * 0.264583;

  if (imgW > maxW) {
    const ratio = maxW / imgW;
    imgW = maxW;
    imgH *= ratio;
  }
  if (imgH > maxH) {
    const ratio = maxH / imgH;
    imgH = maxH;
    imgW *= ratio;
  }

  y = ensureSpace(doc, y, imgH + 6);
  const imgX = PAGE.M + (PAGE.CW - imgW) / 2;

  // Invisible OCR Text layer
  if (ocrText) {
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(1);
    drawWrappedText(doc, cleanText(ocrText), imgX, y + 2, imgW, 1);
  }

  try {
    doc.addImage(imgData.dataUrl, imgData.format, imgX, y, imgW, imgH);
  } catch {
    // Fallback: coba format JPEG jika format asli gagal
    try {
      doc.addImage(imgData.dataUrl, 'JPEG', imgX, y, imgW, imgH);
    } catch {
      // Gambar tidak bisa ditambahkan, skip
      return y;
    }
  }
  return y + imgH + 4;
}

function buildQuestionCards(doc, classified, imageMap, onProgress) {
  const { M, CW } = PAGE;

  for (let i = 0; i < classified.length; i++) {
    if (onProgress) onProgress(`Memproses soal ${i + 1} dari ${classified.length}...`);

    doc.addPage();
    let y = M;
    const q = classified[i];
    const no = q.index + 1;

    // ── Header bar (navy) ──
    doc.setFillColor(...COLORS.NAVY);
    doc.roundedRect(M, y, CW, 9, 1.5, 1.5, 'F');

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.WHITE);
    doc.text(`Soal ${no}`, M + 6, y + 6.2);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(220, 230, 242);
    if (q.type) {
      doc.text(q.type, M + CW - 6, y + 6.2, { align: 'right' });
    }
    y += 13;

    // ── Question text ──
    y += 2;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.BLACK);
    y = drawWrappedText(doc, cleanText(q.title || `Soal ${no}`), M + 4, y, CW - 8, 4.5);
    y += 3;

    // ── Question image (with invisible OCR text layer) ──
    const qImgKey = `q_${q.index}`;
    if (imageMap[qImgKey]) {
      y = addImageToPdf(doc, imageMap[qImgKey], y, CW - 16, 85, q.imageOcrText);
    } else if (q.imageOcrText) {
      // Fallback: If image missing but OCR exists, render visibly
      y = ensureSpace(doc, y, 8);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...COLORS.BLACK);
      y = drawWrappedText(doc, cleanText(q.imageOcrText), M + 4, y, CW - 8, 4);
      y += 4;
    }

    // ── Choices ──
    if (q.choices && q.choices.length > 0) {
      y = ensureSpace(doc, y, 12);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...COLORS.NAVY);
      doc.text('Pilihan Jawaban:', M + 4, y);
      y += 6;

      for (let ci = 0; ci < q.choices.length; ci++) {
        const c = q.choices[ci];
        const text = typeof c === 'string' ? c : (c?.text || '[Pilihan Gambar]');
        const isCorrect = q.aiAnswer && q.aiAnswer.answerIndex === ci;

        y = ensureSpace(doc, y, 10);

        // Background highlight for correct choice
        if (isCorrect) {
          doc.setFontSize(9);
          doc.setFont('helvetica', 'normal');
          const choiceLines = doc.splitTextToSize(cleanText(text), CW - 32);
          const bgH = Math.max(choiceLines.length * 4 + 2, 6);
          doc.setFillColor(...COLORS.GREENBG);
          doc.setDrawColor(134, 239, 172);
          doc.setLineWidth(0.2);
          doc.roundedRect(M + 2, y - 4, CW - 4, bgH + 2, 1, 1, 'FD');
        }

        // Checkbox
        drawCheckbox(doc, M + 6, y - 3, isCorrect, 3.5);

        // Letter label
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...(isCorrect ? COLORS.GREEN : COLORS.LINK));
        doc.text(`${choiceLetter(ci)}.`, M + 12, y);

        // Choice text
        doc.setFont('helvetica', isCorrect ? 'bold' : 'normal');
        doc.setTextColor(...(isCorrect ? COLORS.DKGREEN : COLORS.BLACK));
        const choiceTextClean = cleanText(text);
        const choiceLines = doc.splitTextToSize(choiceTextClean, CW - 32);
        for (let li = 0; li < choiceLines.length; li++) {
          if (li > 0) y = ensureSpace(doc, y, 4);
          doc.text(choiceLines[li], M + 20, y + (li > 0 ? 0 : 0));
          if (li < choiceLines.length - 1) y += 4;
        }

        // AI badge for correct answer
        if (isCorrect) {
          doc.setFillColor(...COLORS.GREEN);
          doc.roundedRect(M + CW - 24, y - 4, 20, 5, 1, 1, 'F');
          doc.setFontSize(6.5);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(...COLORS.WHITE);
          doc.text('JAWABAN', M + CW - 14, y - 0.8, { align: 'center' });
        }

        y += 4;

        // Choice image (with invisible OCR text layer)
        const cImgKey = `q_${q.index}_c_${ci}`;
        const cOcrText = (typeof c === 'object' && c?.ocrText) ? c.ocrText : null;
        if (imageMap[cImgKey]) {
          y = addImageToPdf(doc, imageMap[cImgKey], y, 45, 35, cOcrText);
        } else if (cOcrText) {
          doc.setFontSize(8);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(...COLORS.BLACK);
          y = drawWrappedText(doc, cleanText(cOcrText), M + 20, y, CW - 32, 3.5);
          y += 4;
        }

        y += 2;
      }
    }

    // ── AI Answer & Reasoning box ──
    if (q.aiAnswer) {
      y += 4;
      y = ensureSpace(doc, y, 25);

      // Calculate box content
      const answerText = q.aiAnswer.answer || 'Belum ada jawaban';
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      const answerLines = doc.splitTextToSize(answerText, CW - 28);

      let thinkingLines = [];
      if (q.aiAnswer.thinking) {
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'normal');
        thinkingLines = doc.splitTextToSize(q.aiAnswer.thinking, CW - 28);
        if (thinkingLines.length > 12) {
          thinkingLines = [...thinkingLines.slice(0, 12), '...'];
        }
      }

      const boxH = 14
        + answerLines.length * 4.5
        + (thinkingLines.length > 0 ? 8 + thinkingLines.length * 3.5 : 0)
        + 4;

      // Green box background
      doc.setFillColor(...COLORS.GREENBG);
      doc.setDrawColor(134, 239, 172);
      doc.setLineWidth(0.4);
      doc.roundedRect(M + 2, y, CW - 4, boxH, 2, 2, 'FD');

      // Left accent bar
      doc.setFillColor(...COLORS.GREEN);
      doc.rect(M + 2, y, 2.5, boxH, 'F');

      let boxY = y + 7;

      // Label
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...COLORS.GREEN);
      doc.text('JAWABAN AI', M + 10, boxY);

      if (q.aiAnswer.confidence) {
        doc.setFontSize(7);
        doc.text(`Keyakinan: ${q.aiAnswer.confidence}%`, M + CW - 10, boxY, { align: 'right' });
      }
      boxY += 7;

      // Answer text
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...COLORS.DKGREEN);
      for (const line of answerLines) {
        doc.text(line, M + 10, boxY);
        boxY += 4.5;
      }

      // Thinking / Pembahasan
      if (thinkingLines.length > 0) {
        boxY += 2;
        doc.setDrawColor(187, 247, 208);
        doc.setLineWidth(0.2);
        doc.line(M + 10, boxY, M + CW - 10, boxY);
        boxY += 5;

        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(22, 101, 52);
        doc.text('Pembahasan:', M + 10, boxY);
        boxY += 4;

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(55, 65, 81);
        for (const line of thinkingLines) {
          doc.text(line, M + 10, boxY);
          boxY += 3.5;
        }
      }

      y += boxH + 4;
    }

    // ── Comment / Catatan box ──
    if (q.comment) {
      y += 2;
      y = ensureSpace(doc, y, 22);

      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      const commentLines = doc.splitTextToSize(q.comment, CW - 28);
      const commentH = 14 + commentLines.length * 3.5 + 4;

      // Amber box
      doc.setFillColor(...COLORS.AMBERBG);
      doc.setDrawColor(253, 230, 138);
      doc.setLineWidth(0.4);
      doc.roundedRect(M + 2, y, CW - 4, commentH, 2, 2, 'FD');

      // Left accent bar
      doc.setFillColor(...COLORS.AMBER);
      doc.rect(M + 2, y, 2.5, commentH, 'F');

      let cY = y + 7;
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...COLORS.AMBER);
      doc.text('CATATAN', M + 10, cY);
      cY += 6;

      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(146, 64, 14);
      for (const line of commentLines) {
        doc.text(line, M + 10, cY);
        cY += 3.5;
      }

      y += commentH + 4;
    }
  }
}

function buildAnswerRecap(doc, autoTable, classified) {
  doc.addPage();
  let y = PAGE.M;

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.NAVY);
  doc.text('Rekap Kunci Jawaban', PAGE.M, y + 5);
  y += 10;

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(...COLORS.GREY);
  doc.text('Jawaban berdasarkan analisis otomatis program.', PAGE.M, y);
  y += 8;

  // Build table data for autoTable
  const cols = 5;
  const perCol = Math.ceil(classified.length / cols);
  const tableBody = [];

  for (let r = 0; r < perCol; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      const idx = c * perCol + r;
      if (idx < classified.length) {
        const q = classified[idx];
        const answer = getAnswerShort(q.aiAnswer, q.choices);
        row.push(`${q.index + 1}. ${answer}`);
      } else {
        row.push('');
      }
    }
    tableBody.push(row);
  }

  autoTable(doc, {
    startY: y,
    body: tableBody,
    theme: 'plain',
    styles: {
      fontSize: 8.5,
      cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
      textColor: COLORS.BLACK,
    },
    alternateRowStyles: {
      fillColor: COLORS.LIGHT,
    },
    columnStyles: Object.fromEntries(
      Array.from({ length: cols }, (_, i) => [i, { cellWidth: PAGE.CW / cols }])
    ),
    margin: { left: PAGE.M, right: PAGE.M },
    didParseCell: function (data) {
      // Buat nomor soal bold
      if (data.section === 'body') {
        const text = data.cell.raw || '';
        if (text && text !== '') {
          data.cell.styles.fontStyle = 'normal';
        }
      }
    },
  });
}

function addFooters(doc, title) {
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...COLORS.LINE);
    doc.setLineWidth(0.3);
    doc.line(PAGE.M, PAGE.H - 14, PAGE.W - PAGE.M, PAGE.H - 14);

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.GREY);

    const footerTitle = title.length > 60 ? title.substring(0, 57) + '...' : title;
    doc.text(footerTitle, PAGE.M, PAGE.H - 10);
    doc.text(`Halaman ${i} dari ${totalPages}`, PAGE.W - PAGE.M, PAGE.H - 10, { align: 'right' });
  }
}

// ═══════════════════════════════════════════════════════════════
// 6. MAIN EXPORT
// ═══════════════════════════════════════════════════════════════

/**
 * Generate PDF rapi dari data scraping.
 *
 * @param {Object} data - Data dari ScrapeResult (questions, aiAnswers, comments, title, slug)
 * @param {Function} onProgress - Callback(string) untuk update progress UI
 */
export async function buildRapiPdf(data, onProgress) {
  // Dynamic import (client-side only)
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const questions = data?.questions || [];
  const aiAnswers = data?.aiAnswers || [];
  const comments = data?.comments || [];
  const title = data?.title || 'Kumpulan Soal';

  if (questions.length === 0) {
    throw new Error('Tidak ada soal untuk dibuat PDF.');
  }

  // ── Step 1: Mapping Data ──
  if (onProgress) onProgress('Memproses data soal...');
  const classified = questions.map((q, i) => ({
    ...q,
    index: i,
    aiAnswer: aiAnswers.find(a => a.questionId === q.id) || null,
    comment: comments.find(c => c.questionId === q.id)?.text || null,
  }));

  // ── Step 2: Preload gambar ──
  const imageMap = await preloadImages(questions, onProgress);

  // ── Step 3: Buat dokumen PDF ──
  if (onProgress) onProgress('Membuat dokumen PDF...');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  doc.setProperties({
    title: `${title} \u2014 Kumpulan Soal Rapi`,
    subject: `${questions.length} soal`,
    creator: 'ScraperHouse',
  });

  // ── Step 4: Cover page ──
  if (onProgress) onProgress('Membuat halaman sampul...');
  buildCoverPage(doc, title, 'Kumpulan soal & kunci jawaban', classified);

  // ── Step 6: Daftar soal ──
  if (onProgress) onProgress('Membuat daftar soal...');
  buildQuestionList(doc, autoTable, classified);

  // ── Step 7: Kartu soal ──
  buildQuestionCards(doc, classified, imageMap, onProgress);

  // ── Step 8: Rekap kunci jawaban ──
  if (onProgress) onProgress('Membuat rekap kunci jawaban...');
  buildAnswerRecap(doc, autoTable, classified);

  // ── Step 9: Footer semua halaman ──
  if (onProgress) onProgress('Menambah footer halaman...');
  addFooters(doc, title);

  // ── Step 10: Simpan ──
  if (onProgress) onProgress('Menyimpan file PDF...');
  doc.save(`soal_rapi_${data?.slug || 'export'}.pdf`);
}
