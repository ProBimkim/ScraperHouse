'use client';
import { useState, useEffect, use } from 'react';
import { ArrowLeft, Loader2, ExternalLink, Search, Trash2, FileText } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import DeleteConfirmModal from '@/components/DeleteConfirmModal';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import CommentBox from '@/components/CommentBox';

const FallbackImage = ({ primarySrc, fallbackSrc, alt, style }) => {
  const [imgSrc, setImgSrc] = useState(primarySrc);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setImgSrc(primarySrc);
    setHasError(false);
  }, [primarySrc]);

  return (
    <img
      src={imgSrc || ''}
      alt={alt}
      style={style}
      onError={() => {
        if (!hasError && fallbackSrc) {
          setImgSrc(fallbackSrc);
          setHasError(true);
        }
      }}
    />
  );
};

export default function ScraperResult({ params }) {
  const { slug } = use(params);
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionToast, setActionToast] = useState(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfProgress, setPdfProgress] = useState('');

  const handleDeleteConfirm = async (password) => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/scraper/${slug}?password=${encodeURIComponent(password)}`, { method: 'DELETE' });
      if (res.ok) {
        router.push('/ms-forms');
      } else {
        const errData = await res.json();
        setActionToast(errData.error || 'Gagal menghapus data. Pastikan password benar.');
        setTimeout(() => setActionToast(null), 4000);
        setIsDeleting(false);
        setShowDeleteModal(false);
      }
    } catch (err) {
      setActionToast(err.message || 'Terjadi kesalahan saat menghapus.');
      setTimeout(() => setActionToast(null), 4000);
      setIsDeleting(false);
      setShowDeleteModal(false);
    }
  };

  useEffect(() => {
    let interval;
    const fetchData = async () => {
      try {
        const res = await fetch(`/api/scraper/${slug}`);
        if (!res.ok) {
          setError(res.status === 404 ? 'Result not found' : 'Failed to fetch');
          setLoading(false);
          return;
        }
        const json = await res.json();
        setData(json);
        if (json.status !== 'processing') {
          setLoading(false);
          if (interval) clearInterval(interval);
        }
      } catch (e) {
        setError(e.message);
        setLoading(false);
      }
    };
    fetchData();
    interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [slug]);

  const statusBadge = (status) => {
    const map = {
      success: 'badge-success',
      processing: 'badge-processing',
      failed: 'badge-failed',
      partial: 'badge-partial',
    };
    return `badge ${map[status] || ''}`;
  };

  const filteredQuestions = data?.questions?.filter(q => 
    q.title?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    q.choices?.some(c => (typeof c === 'string' ? c : c.text)?.toLowerCase().includes(searchQuery.toLowerCase()))
  ) || [];

  const handleDownloadImages = async () => {
    setIsDownloading(true);
    try {
      const zip = new JSZip();
      let imgCount = 0;
      const errors = [];

      const fetchImage = async (url, baseFilename) => {
        try {
          // Hapus versi string dari Cloudinary (contoh: /v1788416122/) agar selalu mengambil versi terbaru
          // Ini berguna jika user menimpa/mengupload ulang gambar secara manual di Cloudinary
          let cleanUrl = url;
          if (cleanUrl.includes('res.cloudinary.com')) {
            cleanUrl = cleanUrl.replace(/\/v\d+\//, '/');
          }

          const res = await fetch(cleanUrl);
          if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
          
          const blob = await res.blob();
          let ext = 'jpg';
          if (blob.type === 'image/png') ext = 'png';
          else if (blob.type === 'image/webp') ext = 'webp';
          else if (blob.type === 'image/gif') ext = 'gif';
          else if (blob.type === 'image/svg+xml') ext = 'svg';
          
          zip.file(`${baseFilename}.${ext}`, blob);
          imgCount++;
        } catch (e) {
          console.error('Failed to download image', url, e);
          errors.push(`${baseFilename}: HTTP ${e.message} | URL: ${url}`);
        }
      };

      const promises = [];
      data.questions?.forEach((q, qIdx) => {
        if (q.imageUrl) {
          promises.push(fetchImage(q.imageUrl, `question_${qIdx + 1}`));
        }
        q.choices?.forEach((c, cIdx) => {
          if (typeof c === 'object' && c !== null && c.imageUrl) {
            promises.push(fetchImage(c.imageUrl, `question_${qIdx + 1}_opt_${cIdx + 1}`));
          }
        });
      });

      await Promise.all(promises);

      if (imgCount > 0) {
        const content = await zip.generateAsync({ type: 'blob' });
        saveAs(content, `images_${slug}.zip`);
        if (errors.length > 0) {
          alert(`Berhasil mendownload ${imgCount} gambar. Gagal: ${errors.length}\n\nError details:\n${errors.join('\n')}`);
        }
      } else {
        if (errors.length > 0) {
          alert(`Gagal mendownload semua gambar!\n\nError details:\n${errors.join('\n')}`);
        } else {
          alert('Tidak ada gambar untuk diunduh (tidak ditemukan data gambar pada form ini).');
        }
      }
    } catch (error) {
      console.error('Error creating zip:', error);
      alert('Gagal membuat zip gambar.');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownloadPdf = async () => {
    setIsGeneratingPdf(true);
    setPdfProgress('Memulai...');
    let renderContainer = null;
    try {
      const html2pdfModule = await import('html2pdf.js');
      const html2pdf = html2pdfModule.default || html2pdfModule;
      const questions = data?.questions || [];
      const aiAnswers = data?.aiAnswers || [];
      
      const docTitle = data?.title || 'Kumpulan Soal OCR';

      const opt = {
        margin: [10, 12, 10, 12],
        filename: `soal_ocr_${slug || 'export'}.pdf`,
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: {
          scale: 1.5, // Reduced from 2 for better memory/performance
          useCORS: true,
          logging: false,
          windowWidth: 800,
        },
        jsPDF: {
          unit: 'mm',
          format: 'a4',
          orientation: 'portrait',
        },
      };

      let worker = html2pdf().set(opt);

      // Create a persistent hidden container for rendering chunks
      renderContainer = document.createElement('div');
      renderContainer.id = 'pdf-render-container';
      renderContainer.style.position = 'absolute';
      renderContainer.style.top = '0';
      renderContainer.style.left = '-9999px';
      renderContainer.style.width = '750px';
      renderContainer.style.background = '#ffffff';
      renderContainer.style.zIndex = '-99999';
      renderContainer.style.pointerEvents = 'none';
      document.body.appendChild(renderContainer);

      const getProxiedUrl = (url) => {
        if (!url) return '';
        let cleanUrl = url;
        if (cleanUrl.includes('res.cloudinary.com')) {
          cleanUrl = cleanUrl.replace(/\/v\d+\//, '/');
        }
        return `/api/proxy-image?url=${encodeURIComponent(cleanUrl)}`;
      };

      for (let i = 0; i < questions.length; i++) {
        setPdfProgress(`Memproses halaman ${i + 1} dari ${questions.length}...`);
        const q = questions[i];
        const aiAnswer = aiAnswers.find(a => a.questionId === q.id);
        const comment = data?.comments?.find(c => c.questionId === q.id)?.text;
        
        let choicesHtml = '';
        if (q.choices && q.choices.length > 0) {
          choicesHtml = `
            <div style="margin-top: 16px;">
              <div style="font-size: 11.5px; font-weight: 700; color: #17324d; margin-bottom: 8px;">Pilihan Jawaban:</div>
              <div style="display: flex; flex-direction: column; gap: 6px;">
                ${q.choices.map((c, cIdx) => {
                  const text = typeof c === 'object' && c !== null ? c.text : c;
                  const cImg = typeof c === 'object' && c !== null ? c.imageUrl : null;
                  const ocrText = typeof c === 'object' && c !== null ? c.ocrText : null;
                  const isAiChoice = aiAnswer && (aiAnswer.answerIndex === cIdx || (aiAnswer.answer && text && aiAnswer.answer.toLowerCase().includes(String(text).toLowerCase())));
                  return `
                    <div style="display: flex; align-items: flex-start; gap: 8px; font-size: 11.5px; color: #1e293b; padding: 6px 10px; background: ${isAiChoice ? '#f0fdf4' : '#ffffff'}; border: 1px solid ${isAiChoice ? '#86efac' : '#e2e8f0'}; border-radius: 6px;">
                      <span style="font-weight: 700; color: ${isAiChoice ? '#16a34a' : '#1d68a7'}; min-width: 20px;">${String.fromCharCode(65 + cIdx)}.</span>
                      <div style="flex: 1;">
                        <span style="${isAiChoice ? 'font-weight: 600; color: #14532d;' : ''}">${escapeHtml(text || '[Pilihan Gambar]')}</span>
                        ${cImg ? `
                          <div style="margin-top: 6px;">
                            <img src="${getProxiedUrl(cImg)}" alt="Pilihan" style="max-height: 80px; max-width: 150px; object-fit: contain; border: 1px solid #e2e8f0; border-radius: 4px;" crossorigin="anonymous" />
                          </div>
                        ` : ''}
                        ${ocrText ? `<div style="font-size: 10.5px; color: #0f766e; margin-top: 4px; font-style: italic;">OCR: ${escapeHtml(ocrText)}</div>` : ''}
                      </div>
                      ${isAiChoice ? '<span style="font-size: 9.5px; font-weight: 700; background: #22c55e; color: #ffffff; padding: 2px 6px; border-radius: 4px; text-transform: uppercase;">Pilihan AI</span>' : ''}
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          `;
        }

        let aiAnswerHtml = '';
        if (aiAnswer) {
          aiAnswerHtml = `
            <div style="margin-top: 24px; padding: 14px 18px; background: #f0fdf4; border: 1.5px solid #86efac; border-left: 5px solid #16a34a; border-radius: 8px;">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
                <span style="font-size: 12px; font-weight: 800; color: #15803d; text-transform: uppercase; letter-spacing: 0.5px;">✓ Jawaban AI</span>
                ${aiAnswer.confidence ? `<span style="font-size: 10px; font-weight: 700; background: #dcfce7; color: #166534; padding: 2px 8px; border-radius: 12px; border: 1px solid #bbf7d0;">Keyakinan: ${aiAnswer.confidence}%</span>` : ''}
              </div>
              <div style="font-size: 13.5px; font-weight: 700; color: #14532d; margin-bottom: 6px; line-height: 1.4;">
                ${escapeHtml(aiAnswer.answer || 'Belum ada jawaban')}
              </div>
              ${aiAnswer.thinking ? `
                <div style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed #bbf7d0; font-size: 11px; line-height: 1.5; color: #374151;">
                  <strong style="color: #166534;">Pembahasan:</strong><br />
                  <span style="white-space: pre-wrap;">${escapeHtml(aiAnswer.thinking)}</span>
                </div>
              ` : ''}
            </div>
          `;
        }

        let commentHtml = '';
        if (comment) {
          commentHtml = `
            <div style="margin-top: 24px; padding: 14px 18px; background: #fffbeb; border: 1.5px solid #fde68a; border-left: 5px solid #f59e0b; border-radius: 8px;">
              <div style="font-size: 12px; font-weight: 800; color: #b45309; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;">
                💬 Catatan
              </div>
              <div style="font-size: 13px; color: #92400e; white-space: pre-wrap; line-height: 1.5; font-weight: 500;">
                ${escapeHtml(comment)}
              </div>
            </div>
          `;
        }

        const questionHtml = `
          <div class="pdf-card" style="padding: 16px 20px 24px 20px; background: #ffffff; box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #17212b;">
            <!-- Header Soal -->
            <div style="margin-bottom: 8px;">
              <h2 style="margin: 0 0 4px 0; font-size: 15px; font-weight: 700; color: #17324d; line-height: 1.3;">
                ${i + 1}. ${escapeHtml(q.title || `question_${i + 1}.jpg`)}
              </h2>
              <div style="font-size: 11px; color: #5b6875; margin-bottom: 8px;">
                ${q.imageUrl ? 'Gambar soal asli (diagram geometri/teks dipertahankan)' : 'Teks Soal'}
                ${q.required ? ' • <span style="color: #dc2626; font-weight: 600;">Wajib</span>' : ''}
                ${q.type ? ` • <span>${escapeHtml(q.type)}</span>` : ''}
              </div>
              <div style="border-top: 1px solid #d9e1ea; margin: 0 0 14px 0;"></div>
            </div>

            <!-- Gambar Soal Asli -->
            ${q.imageUrl ? `
              <div style="text-align: center; margin: 0 0 14px 0;">
                <img src="${getProxiedUrl(q.imageUrl)}" alt="Soal ${i + 1}" style="display: block; max-width: 100%; max-height: 380px; object-fit: contain; margin: 0 auto; border-top: 1px solid #e1e7ed; border-bottom: 1px solid #e1e7ed;" crossorigin="anonymous" />
              </div>
            ` : ''}

            <!-- Teks OCR -->
            ${q.imageOcrText ? `
              <div style="margin: 12px 0 0 0;">
                <div style="font-size: 11.5px; font-weight: 700; color: #1d68a7; margin-bottom: 6px;">
                  Teks OCR (bisa dicari/copy)
                </div>
                <div style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 11px; line-height: 1.55; color: #17212b; white-space: pre-wrap; word-break: break-word; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 14px;">${escapeHtml(q.imageOcrText)}</div>
              </div>
            ` : ''}

            <!-- Pilihan Jawaban -->
            ${choicesHtml}

            <!-- Kunci Jawaban & Pembahasan AI -->
            ${aiAnswerHtml}

            <!-- Komentar / Catatan -->
            ${commentHtml}

            <!-- Footer Halaman -->
            <div style="margin-top: 22px; padding-top: 8px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; display: flex; justify-content: space-between; align-items: center;">
              <span>${escapeHtml(docTitle)}</span>
              <span>Halaman ${i + 1} dari ${questions.length}</span>
            </div>
          </div>
        `;

        const qContainer = document.createElement('div');
        qContainer.innerHTML = questionHtml;
        renderContainer.appendChild(qContainer);

        // Wait for all images in the current chunk to load
        const imgs = Array.from(qContainer.querySelectorAll('img'));
        await Promise.all(
          imgs.map(img => {
            if (img.complete) return Promise.resolve();
            return new Promise(res => {
              img.onload = res;
              img.onerror = res;
            });
          })
        );

        // Give a tiny moment for layout calculation
        await new Promise(r => setTimeout(r, 50));

        if (i === 0) {
          worker = worker.from(qContainer).toPdf();
        } else {
          worker = worker.get('pdf').then(pdf => {
            pdf.addPage();
          }).from(qContainer).toContainer().toCanvas().toPdf();
        }
      }

      setPdfProgress('Menyimpan file...');
      await worker.save();

    } catch (err) {
      console.error('Error generating PDF:', err);
      alert('Gagal membuat file PDF: ' + (err.message || 'Terjadi kesalahan'));
    } finally {
      if (renderContainer && renderContainer.parentNode) {
        renderContainer.parentNode.removeChild(renderContainer);
      }
      setIsGeneratingPdf(false);
      setPdfProgress('');
    }
  };

  const escapeHtml = (str) => {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  if (error) {
    return (
      <>
        <Navbar />
        <div className="container">
          <Link href="/" className="btn btn-ghost btn-sm" style={{ marginBottom: '24px' }}>
            <ArrowLeft size={16} /> Back
          </Link>
          <div className="glass-card" style={{ textAlign: 'center', padding: '40px' }}>
            <div style={{ fontSize: '2rem', marginBottom: '12px' }}>❌</div>
            <div style={{ color: 'var(--error)', fontWeight: 600 }}>{error}</div>
          </div>
        </div>
      </>
    );
  }

  if (loading && !data) {
    return (
      <>
        <Navbar />
        <div className="loading-screen">
          <div className="spinner" />
          <div style={{ color: 'var(--text-muted)' }}>Loading {slug}...</div>
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div className="container">
        <Link href="/" className="btn btn-ghost btn-sm" style={{ marginBottom: '24px' }}>
          <ArrowLeft size={16} /> Back to Scraping
        </Link>

        {/* Header Card */}
        <div className="glass-card" style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ flex: 1 }}>
              <h1 style={{ fontSize: '1.8rem', fontWeight: 700, marginBottom: '8px' }}>
                {data?.title || 'Untitled Form'}
              </h1>
              <a
                href={data?.url}
                target="_blank"
                rel="noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.9rem' }}
              >
                {data?.url} <ExternalLink size={13} />
              </a>
              {data?.description && (
                <p style={{ color: 'var(--text-muted)', marginTop: '8px' }}>{data.description}</p>
              )}
            </div>
            <span className={statusBadge(data?.status)} style={{ fontSize: '0.8rem', padding: '5px 14px' }}>
              {data?.status === 'processing' ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> Processing
                </span>
              ) : (
                data?.status
              )}
            </span>
          </div>

          <div className="result-stats">
            <div className="stat-item">
              <div className="stat-label">Questions</div>
              <div className="stat-value">{data?.jumlah_pertanyaan || 0}</div>
            </div>
            <div className="stat-item">
              <div className="stat-label">Slug</div>
              <div className="stat-value" style={{ fontSize: '1.2rem', color: 'var(--accent)' }}>{data?.slug}</div>
            </div>
          </div>

          <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button 
                className="btn btn-primary" 
                onClick={handleDownloadImages}
                disabled={isDownloading || !data?.questions?.some(q => q.imageUrl || q.choices?.some(c => typeof c === 'object' && c !== null && c.imageUrl))}
              >
                {isDownloading ? (
                  <><span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Memproses ZIP...</>
                ) : (
                  <>📦 Download Gambar (ZIP)</>
                )}
              </button>

              <button
                className="btn btn-primary"
                style={{ background: 'rgba(20, 184, 166, 0.2)', borderColor: 'rgba(20, 184, 166, 0.4)', color: '#5eead4' }}
                onClick={handleDownloadPdf}
                disabled={isGeneratingPdf || !data?.questions?.length}
              >
                {isGeneratingPdf ? (
                  <><span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> {pdfProgress || 'Membuat PDF...'}</>
                ) : (
                  <><FileText size={16} /> Download PDF</>
                )}
              </button>
            </div>

            <button
              type="button"
              className="btn-liquid-delete"
              onClick={() => setShowDeleteModal(true)}
              disabled={isDownloading || isDeleting}
              title="Hapus data scraping ini"
            >
              <Trash2 size={16} />
              Hapus Hasil
            </button>
          </div>
        </div>

        {/* Scrape Steps Debug */}
        {data?.scrapeSteps && data.scrapeSteps.length > 0 && (
          <details className="glass-card" style={{ marginBottom: '20px', cursor: 'pointer' }}>
            <summary style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '8px' }}>
              🔍 Scrape Steps ({data.scrapeSteps.length} steps)
            </summary>
            <div className="steps-timeline">
              {data.scrapeSteps.map((s, i) => (
                <div key={i} className="step-item">
                  <div className={`step-dot ${s.status === 'ok' ? 'step-dot-ok' : s.status === 'failed' ? 'step-dot-fail' : 'step-dot-wait'}`} />
                  <span className="step-name">{s.step}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>— {s.status}</span>
                  {s.message && <span style={{ color: 'var(--error)', fontSize: '0.8rem', marginLeft: 'auto' }}>{s.message}</span>}
                </div>
              ))}
            </div>
          </details>
        )}

        {/* Search Bar */}
        {data?.questions?.length > 0 && (
          <div className="glass-card" style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', padding: '12px 24px' }}>
            <Search size={18} color="var(--text-muted)" style={{ marginRight: '12px' }} />
            <input 
              type="text" 
              placeholder="Cari soal atau pilihan ganda..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text-main)', fontSize: '1rem', outline: 'none' }}
            />
          </div>
        )}

        {/* Questions */}
        {data?.questions?.length > 0 ? (
          filteredQuestions.length > 0 ? (
            filteredQuestions.map((q, idx) => (
              <div key={idx} className="glass-card question-card">
                <div className="q-header">
                  <div className="q-title">
                    <span className="q-number">{data.questions.indexOf(q) + 1}.</span>
                    {q.title}
                  </div>
                  <div className="q-meta">
                    <span className="q-tag q-tag-type">{q.type}</span>
                    {q.required && <span className="q-tag q-tag-required">Required</span>}
                  </div>
                </div>
                {q.imageUrl && (
                  <div style={{ margin: '16px 0' }}>
                    <FallbackImage primarySrc={q.imageUrl} fallbackSrc={q.originalImageUrl} alt="Question Image" style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }} />
                  </div>
                )}
                {q.imageOcrText && (
                  <details className="ocr-panel">
                    <summary>📝 Teks OCR dari Gambar</summary>
                    <div className="ocr-panel-content">{q.imageOcrText}</div>
                  </details>
                )}
                {q.choices?.length > 0 && (
                  <ul className="choice-list">
                    {q.choices.map((c, ci) => {
                      const text = typeof c === 'object' && c !== null ? c.text : c;
                      const cImg = typeof c === 'object' && c !== null ? c.imageUrl : null;
                      const cOrigImg = typeof c === 'object' && c !== null ? c.originalImageUrl : null;
                      
                      const aiAnswer = data?.aiAnswers?.find(a => a.questionId === q.id);
                      const isCorrect = aiAnswer && aiAnswer.answerIndex === ci;

                      return (
                        <li key={ci} className={`choice-item ${isCorrect ? 'choice-item-correct' : ''}`}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>
                              {text || (cImg ? <span style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>[Image Option]</span> : '')}
                            </span>
                            {isCorrect && <span className="choice-correct-badge">✓ AI Answer</span>}
                          </div>
                          {cImg && (
                            <div style={{ marginTop: '8px' }}>
                              <FallbackImage primarySrc={cImg} fallbackSrc={cOrigImg} alt="Option Image" style={{ maxWidth: '150px', maxHeight: '150px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)' }} />
                              {typeof c === 'object' && c.ocrText && (
                                <span className="ocr-inline">OCR: {c.ocrText}</span>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {data?.aiAnswers?.find(a => a.questionId === q.id) && (() => {
                  const aiAnswer = data.aiAnswers.find(a => a.questionId === q.id);
                  return (
                    <div className="ai-answer-card">
                      <div className="ai-answer-header">
                        <span style={{ fontSize: '1.2rem' }}>🤖</span>
                        <strong>Jawaban AI</strong>
                      </div>
                      <div className="ai-answer-body">
                        {aiAnswer.answer && (
                          <div style={{ marginBottom: '12px', fontSize: '1.05rem', fontWeight: 500, color: 'var(--text-main)' }}>
                            {aiAnswer.answer}
                          </div>
                        )}
                        {aiAnswer.thinking && (
                          <details className="ai-thinking">
                            <summary>Lihat cara berpikir AI</summary>
                            <div className="ai-thinking-content">
                              {aiAnswer.thinking}
                            </div>
                          </details>
                        )}
                      </div>
                    </div>
                  );
                })()}
                
                <CommentBox
                  slug={slug}
                  questionId={q.id}
                  initialText={data?.comments?.find(c => c.questionId === q.id)?.text || ''}
                />
              </div>
            ))
          ) : (
            <div className="glass-card empty-state" style={{ padding: '30px' }}>
              <div style={{ color: 'var(--text-muted)' }}>Tidak ada soal yang cocok dengan pencarian.</div>
            </div>
          )
        ) : data?.status !== 'processing' ? (
          <div className="glass-card empty-state">
            <div className="empty-state-icon">📝</div>
            <div>No questions found in this form.</div>
          </div>
        ) : null}
      </div>

      {/* Modal Konfirmasi Hapus Data */}
      <DeleteConfirmModal
        isOpen={showDeleteModal}
        onClose={() => !isDeleting && setShowDeleteModal(false)}
        onConfirm={handleDeleteConfirm}
        isDeleting={isDeleting}
        item={data}
      />

      {actionToast && (
        <div className="toast">
          <span style={{ color: 'var(--error)' }}>⚠️</span> {actionToast}
        </div>
      )}
    </>
  );
}
