'use client';
import { useState, useEffect, use } from 'react';
import { ArrowLeft, Loader2, ExternalLink, Search, Trash2, FileText, Sparkles } from 'lucide-react';
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
  const [isProcessingOcr, setIsProcessingOcr] = useState(false);

  const handleTriggerOcr = async () => {
    // 1. Cek apakah ada gambar soal yang belum di-OCR
    const unscanned = (data?.questions || []).filter(
      q => (q.imageUrl && !q.imageOcrText) || 
           q.choices?.some(c => typeof c === 'object' && c !== null && c.imageUrl && !c.ocrText)
    );

    // Jika seluruh gambar sudah ter-OCR, langsung beri konfirmasi instan (0 detik)
    if (unscanned.length === 0) {
      const ocrCount = data?.questions?.filter(q => q.imageOcrText)?.length || 0;
      setActionToast(`✓ Seluruh ${ocrCount} gambar soal sudah selesai di-OCR dan siap dicari!`);
      setTimeout(() => setActionToast(null), 4000);
      return;
    }

    // 2. Jika ada yang belum di-OCR, proses bertahap per batch (5 gambar per request) agar cepat & tidak timeout
    setIsProcessingOcr(true);
    const totalNeeded = unscanned.length;
    let completed = 0;

    try {
      while (true) {
        setActionToast(`⚡ Memindai OCR: ${completed}/${totalNeeded} gambar selesai...`);
        const res = await fetch(`/api/scraper/${slug}/ocr?limit=5`, { method: 'POST' });
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || 'Gagal memproses batch OCR');
        }
        const resData = await res.json();
        completed += resData.processed || 0;

        if (resData.remaining <= 0 || resData.processed === 0) {
          break;
        }
      }

      // Ambil data terbaru yang sudah lengkap
      const refreshed = await fetch(`/api/scraper/${slug}`);
      if (refreshed.ok) {
        const fresh = await refreshed.json();
        setData(fresh);
        const ocrCount = fresh?.questions?.filter(q => q.imageOcrText)?.length || 0;
        setActionToast(`✓ Selesai! ${ocrCount} soal berhasil dipindai dan siap dicari.`);
        setTimeout(() => setActionToast(null), 4000);
      }
    } catch (e) {
      setActionToast('Error OCR: ' + e.message);
      setTimeout(() => setActionToast(null), 4000);
    } finally {
      setIsProcessingOcr(false);
    }
  };

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

  const filteredQuestions = data?.questions?.filter(q => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    const matchTitle = q.title?.toLowerCase().includes(query);
    const matchOcr = q.imageOcrText?.toLowerCase().includes(query);
    const matchChoices = q.choices?.some(c => {
      const text = typeof c === 'string' ? c : (c?.text || '');
      const cOcr = typeof c === 'object' && c?.ocrText ? c.ocrText : '';
      return text.toLowerCase().includes(query) || cOcr.toLowerCase().includes(query);
    });
    return matchTitle || matchOcr || matchChoices;
  }) || [];

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
    setPdfProgress('Mengambil data terbaru...');
    try {
      const res = await fetch(`/api/scraper/${slug}`);
      const freshData = res.ok ? await res.json() : data;
      if (freshData) setData(freshData);

      const { buildRapiPdf } = await import('@/lib/pdfRapi');
      await buildRapiPdf(freshData || data, setPdfProgress);
    } catch (err) {
      console.error('Error generating PDF:', err);
      alert('Gagal membuat file PDF: ' + (err.message || 'Terjadi kesalahan'));
    } finally {
      setIsGeneratingPdf(false);
      setPdfProgress('');
    }
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

              <button
                className="btn btn-primary"
                style={{ background: 'rgba(168, 85, 247, 0.2)', borderColor: 'rgba(168, 85, 247, 0.4)', color: '#d8b4fe' }}
                onClick={handleTriggerOcr}
                disabled={isProcessingOcr || isGeneratingPdf || !data?.questions?.some(q => q.imageUrl || q.choices?.some(c => typeof c === 'object' && c?.imageUrl))}
                title="Mulai proses OCR untuk memindai teks pada gambar soal di web"
              >
                {isProcessingOcr ? (
                  <><span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Memproses OCR...</>
                ) : (
                  <><Sparkles size={16} /> OCR</>
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
          <div style={{ marginBottom: '20px' }}>
            <div className="glass-card" style={{ display: 'flex', alignItems: 'center', padding: '12px 24px' }}>
              <Search size={18} color="var(--text-muted)" style={{ marginRight: '12px' }} />
              <input 
                type="text" 
                placeholder="Cari kata kunci (judul, pilihan, atau teks gambar)..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text-main)', fontSize: '1rem', outline: 'none' }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.85rem' }}
                >
                  ✕ Clear
                </button>
              )}
            </div>
            {searchQuery && (
              <div style={{ marginTop: '8px', padding: '0 8px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Ditemukan <strong>{filteredQuestions.length}</strong> dari {data.questions.length} soal untuk &ldquo;{searchQuery}&rdquo;
              </div>
            )}
          </div>
        )}

        {/* Questions */}
        {data?.questions?.length > 0 ? (
          filteredQuestions.length > 0 ? (
            filteredQuestions.map((q, idx) => {
              const qIndex = data.questions.indexOf(q);
              const qNo = qIndex + 1;
              const isMatchInOcr = searchQuery && q.imageOcrText?.toLowerCase().includes(searchQuery.toLowerCase().trim());

              return (
                <div key={qIndex} id={`soal-${qNo}`} className="glass-card question-card" style={{ position: 'relative' }}>
                  <div className="q-header">
                    <div className="q-title">
                      <span className="q-number">{qNo}.</span>
                      {q.title || `Soal ${qNo}`}
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

                  {/* Teks OCR sepenuhnya tersembunyi (100% hidden), hanya gambar yang terlihat di layar, tapi tetap terindeks untuk pencarian & Ctrl+F */}
                  {q.imageOcrText && (
                    <div
                      className="ocr-hidden-searchable"
                      aria-hidden="true"
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        opacity: 0,
                        color: 'transparent',
                        pointerEvents: 'none',
                        userSelect: 'text',
                        overflow: 'hidden',
                        zIndex: -1,
                      }}
                    >
                      {q.imageOcrText}
                    </div>
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
                                  <span
                                    aria-hidden="true"
                                    style={{
                                      position: 'absolute',
                                      opacity: 0,
                                      color: 'transparent',
                                      pointerEvents: 'none',
                                      userSelect: 'text',
                                      overflow: 'hidden',
                                      zIndex: -1,
                                    }}
                                  >
                                    {c.ocrText}
                                  </span>
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
            );
          })
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
