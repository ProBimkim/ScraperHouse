'use client';
import { useState, useEffect, use } from 'react';
import { ArrowLeft, Loader2, ExternalLink, Search, Trash2, FileText } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import DeleteConfirmModal from '@/components/DeleteConfirmModal';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

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

  const handleDeleteConfirm = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/scraper/${slug}`, { method: 'DELETE' });
      if (res.ok) {
        router.push('/ms-forms');
      } else {
        const errData = await res.json();
        setActionToast(errData.error || 'Gagal menghapus data.');
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
    try {
      const questions = data?.questions || [];
      const aiAnswers = data?.aiAnswers || [];
      
      // Convert images to base64 for embedding in PDF
      const imageToBase64 = async (url) => {
        try {
          let cleanUrl = url;
          if (cleanUrl.includes('res.cloudinary.com')) {
            cleanUrl = cleanUrl.replace(/\/v\d+\//, '/');
          }
          const res = await fetch(cleanUrl);
          if (!res.ok) return null;
          const blob = await res.blob();
          return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
          });
        } catch {
          return null;
        }
      };

      // Pre-load all images
      const imagePromises = [];
      const imageMap = {};
      
      questions.forEach((q, qIdx) => {
        if (q.imageUrl) {
          imagePromises.push(
            imageToBase64(q.imageUrl).then(b64 => { if (b64) imageMap[`q_${qIdx}`] = b64; })
          );
        }
        q.choices?.forEach((c, cIdx) => {
          const cImg = typeof c === 'object' && c !== null ? c.imageUrl : null;
          if (cImg) {
            imagePromises.push(
              imageToBase64(cImg).then(b64 => { if (b64) imageMap[`q_${qIdx}_c_${cIdx}`] = b64; })
            );
          }
        });
      });
      
      await Promise.allSettled(imagePromises);

      // Build HTML for PDF
      let questionsHtml = '';
      questions.forEach((q, qIdx) => {
        const aiAnswer = aiAnswers.find(a => a.questionId === q.id);
        
        questionsHtml += `
          <div class="question-block">
            <div class="q-header-pdf">
              <span class="q-num">${qIdx + 1}.</span>
              <span class="q-text">${escapeHtml(q.title || '[Tanpa Judul]')}</span>
              <span class="q-tags">
                <span class="tag tag-type">${escapeHtml(q.type || '')}</span>
                ${q.required ? '<span class="tag tag-required">Required</span>' : ''}
              </span>
            </div>
        `;
        
        // Question image
        if (q.imageUrl && imageMap[`q_${qIdx}`]) {
          questionsHtml += `<div class="q-image"><img src="${imageMap[`q_${qIdx}`]}" alt="Question Image" /></div>`;
        }
        
        // OCR text
        if (q.imageOcrText) {
          questionsHtml += `<div class="ocr-box"><strong>📝 Teks OCR:</strong> ${escapeHtml(q.imageOcrText)}</div>`;
        }
        
        // Choices
        if (q.choices && q.choices.length > 0) {
          questionsHtml += '<div class="choices">';
          q.choices.forEach((c, cIdx) => {
            const text = typeof c === 'object' && c !== null ? c.text : c;
            const cImg = typeof c === 'object' && c !== null ? c.imageUrl : null;
            const ocrText = typeof c === 'object' && c !== null ? c.ocrText : null;
            const isCorrect = aiAnswer && aiAnswer.answerIndex === cIdx;
            
            questionsHtml += `
              <div class="choice ${isCorrect ? 'choice-correct' : ''}">
                <span class="choice-letter">${String.fromCharCode(65 + cIdx)}.</span>
                <span>${escapeHtml(text || '[Gambar]')}</span>
                ${isCorrect ? '<span class="correct-badge">✓ AI Answer</span>' : ''}
            `;
            
            if (cImg && imageMap[`q_${qIdx}_c_${cIdx}`]) {
              questionsHtml += `<div class="choice-img"><img src="${imageMap[`q_${qIdx}_c_${cIdx}`]}" alt="Option" /></div>`;
            }
            if (ocrText) {
              questionsHtml += `<div class="choice-ocr">OCR: ${escapeHtml(ocrText)}</div>`;
            }
            
            questionsHtml += '</div>';
          });
          questionsHtml += '</div>';
        }
        
        // AI Answer
        if (aiAnswer) {
          questionsHtml += `
            <div class="ai-box">
              <div class="ai-title">🤖 Jawaban AI</div>
              <div class="ai-answer">${escapeHtml(aiAnswer.answer || '')}</div>
              ${aiAnswer.thinking ? `<div class="ai-thinking">${escapeHtml(aiAnswer.thinking)}</div>` : ''}
            </div>
          `;
        }
        
        questionsHtml += '</div>';
      });

      const htmlContent = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(data?.title || 'Hasil Scraping')} - ScraperHouse</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
    
    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      color: #1e293b;
      background: #ffffff;
      padding: 40px 48px;
      line-height: 1.6;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    
    .header {
      margin-bottom: 36px;
      padding-bottom: 24px;
      border-bottom: 3px solid #3b82f6;
    }
    .header h1 {
      font-size: 24px;
      font-weight: 800;
      color: #0f172a;
      margin-bottom: 8px;
    }
    .header .meta {
      font-size: 13px;
      color: #64748b;
      display: flex;
      gap: 20px;
      flex-wrap: wrap;
    }
    .header .meta span {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    
    .question-block {
      margin-bottom: 32px;
      padding: 24px;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      background: #fafbfc;
      page-break-inside: avoid;
    }
    
    .q-header-pdf {
      margin-bottom: 16px;
      display: flex;
      align-items: baseline;
      flex-wrap: wrap;
      gap: 8px;
    }
    .q-num {
      font-size: 20px;
      font-weight: 800;
      color: #3b82f6;
      min-width: 32px;
    }
    .q-text {
      font-size: 16px;
      font-weight: 600;
      color: #0f172a;
      flex: 1;
      line-height: 1.5;
    }
    .q-tags { display: flex; gap: 6px; }
    .tag {
      font-size: 11px;
      font-weight: 700;
      padding: 3px 10px;
      border-radius: 6px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .tag-type {
      background: #f1f5f9;
      color: #64748b;
      border: 1px solid #e2e8f0;
    }
    .tag-required {
      background: #fef2f2;
      color: #dc2626;
      border: 1px solid #fecaca;
    }
    
    .q-image {
      margin: 14px 0;
      text-align: center;
    }
    .q-image img {
      max-width: 100%;
      max-height: 360px;
      object-fit: contain;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
    }
    
    .ocr-box {
      margin: 12px 0;
      padding: 12px 16px;
      background: #f0fdfa;
      border: 1px solid #99f6e4;
      border-radius: 8px;
      font-size: 13px;
      color: #0f766e;
      line-height: 1.5;
      white-space: pre-wrap;
    }
    
    .choices {
      margin-top: 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .choice {
      padding: 12px 16px;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      font-size: 14px;
      color: #334155;
      display: flex;
      align-items: baseline;
      flex-wrap: wrap;
      gap: 8px;
    }
    .choice-letter {
      font-weight: 700;
      color: #3b82f6;
      min-width: 24px;
    }
    .choice-correct {
      border-color: #22c55e !important;
      background: #f0fdf4 !important;
      box-shadow: inset 0 0 0 1px #22c55e;
    }
    .correct-badge {
      font-size: 11px;
      font-weight: 800;
      background: #22c55e;
      color: white;
      padding: 2px 8px;
      border-radius: 10px;
      margin-left: auto;
      text-transform: uppercase;
    }
    .choice-img {
      width: 100%;
      margin-top: 8px;
    }
    .choice-img img {
      max-width: 140px;
      max-height: 140px;
      border-radius: 6px;
      border: 1px solid #e2e8f0;
    }
    .choice-ocr {
      width: 100%;
      font-size: 12px;
      color: #0f766e;
      font-style: italic;
      margin-top: 4px;
    }
    
    .ai-box {
      margin-top: 20px;
      padding: 16px;
      background: linear-gradient(135deg, #faf5ff, #eef2ff);
      border: 1px solid #c4b5fd;
      border-radius: 10px;
    }
    .ai-title {
      font-weight: 700;
      font-size: 14px;
      color: #7c3aed;
      margin-bottom: 10px;
    }
    .ai-answer {
      font-size: 15px;
      font-weight: 600;
      color: #1e1b4b;
      margin-bottom: 8px;
    }
    .ai-thinking {
      font-size: 12px;
      color: #6b7280;
      padding: 10px 12px;
      background: rgba(0,0,0,0.03);
      border-radius: 6px;
      line-height: 1.5;
      white-space: pre-wrap;
    }
    
    .footer {
      margin-top: 40px;
      padding-top: 16px;
      border-top: 1px solid #e2e8f0;
      font-size: 12px;
      color: #94a3b8;
      text-align: center;
    }
    
    @media print {
      body { padding: 20px; }
      .question-block { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${escapeHtml(data?.title || 'Hasil Scraping')}</h1>
    <div class="meta">
      <span>📋 ${questions.length} pertanyaan</span>
      <span>🔗 ${escapeHtml(data?.slug || '')}</span>
      <span>📅 ${new Date(data?.createdAt || Date.now()).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
    </div>
    ${data?.description ? `<p style="margin-top:10px;font-size:14px;color:#475569">${escapeHtml(data.description)}</p>` : ''}
  </div>
  
  ${questionsHtml}
  
  <div class="footer">
    Dihasilkan oleh ScraperHouse • ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
  </div>
</body>
</html>`;

      // Open in new window and trigger print (save as PDF)
      const printWindow = window.open('', '_blank', 'width=900,height=700');
      if (!printWindow) {
        alert('Pop-up diblokir oleh browser. Izinkan pop-up untuk mendownload PDF.');
        return;
      }
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      
      // Wait for images to load then trigger print
      printWindow.onload = () => {
        setTimeout(() => {
          printWindow.print();
        }, 500);
      };
      
    } catch (err) {
      console.error('Error generating PDF:', err);
      alert('Gagal membuat PDF.');
    } finally {
      setIsGeneratingPdf(false);
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
                  <><span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Membuat PDF...</>
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
